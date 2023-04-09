const sdk = require("matrix-js-sdk");
const olm = require("@matrix-org/olm");
const fs = require('fs');
global.Olm = olm;

let client;
let memoryStore = new sdk.MemoryStore();
let cryptoStore = new sdk.MemoryCryptoStore();

async function getCredentialsWithPassword(username, password, homeserver) {
    try{
        const credentials = await sdk.createClient({baseUrl: homeserver}).loginWithPassword(
            username,
            password
        );
        return {
            success: true,
            message: "User logged in successfully.",
            accessToken: credentials.access_token,
            userId: credentials.user_id,
            deviceId: credentials.device_id,
        };
    }catch (error){
        console.error("Error logging in with password:", error);
        return {
            success: false,
            message: "User login failed.",
            accessToken: null,
            userId: null,
            deviceId: null,

        };
    }
}

/**
 * This method runs matrix client. Use object or file to give this method credentials.
 * @param filePath - path to file that contains the user's login credentials (username, password, and homeserverUrl)
 * @param credentials - object with the user's login credentials (username, password and homeserverUrl)
 */
async function runClient(filePath, credentials={}) {
    if (!filePath && !credentials) {
        throw new Error('Error: must provide either a file path or a object with username, password and homeserverUrl');
    }

    await olm.init({locateFile: () => "node_modules/@matrix-org/olm/olm.wasm"});

    let data;
    // Load file data
    let fileData;
    if (filePath) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        fileData = JSON.parse(fileContent);
    }

    // Check for required properties
    const fileProperties = fileData ? ['homeserverUrl', 'username', 'password'] : [];
    const objectProperties = ['homeserverUrl', 'username', 'password'];
    const properties = [...fileProperties, ...objectProperties];
    const missingProperties = properties.filter(prop => !fileData?.[prop] && !credentials?.[prop]);

    if (missingProperties.length > 0) {
        throw new Error(`Error: missing properties, needed properties: ${missingProperties.join(', ')}`);
    }

    // Check if file or object has required properties and use one that does
    data = credentials && (!fileData || missingProperties.some(prop => credentials.hasOwnProperty(prop))) ? credentials : fileData;

    try {
        const { accessToken, userId, deviceId } = await getCredentialsWithPassword(data.username,data.password, data.homeserverUrl);
        client = sdk.createClient({
            baseUrl: data.homeserverUrl,
            accessToken: accessToken,
            userId: userId,
            deviceId: deviceId,
            store: memoryStore,
            cryptoStore: cryptoStore,
            cryptoInfo: {
                'ignore_unknown_devices': true
            }
        });
        await client.initCrypto();

        client.on("RoomMember.membership", function (event, member) {
            if (member.membership === "invite" && member.userId === client.getUserId()) {
                client.joinRoom(member.roomId).then(function () {
                    console.log("Auto-joined %s", member.roomId);
                });
            }
        });


        client.setGlobalBlacklistUnverifiedDevices(false);
        client.setGlobalErrorOnUnknownDevices(false);

        if(client.isCryptoEnabled()){
            await client.startClient({ initialSyncLimit: 1 });
        }

        if (!client.getCrossSigningId()) {
            await client.bootstrapCrossSigning({
                authUploadDeviceSigningKeys: async function () {
                    // Implement a secure method to get the user's password or interactive authentication
                    const response = await client.login("m.login.password", {
                        identifier: {
                            type: "m.id.user",
                            user: data.username,
                        },
                        password: data.password,
                    });

                    return {
                        user_id: client.getUserId(),
                        device_id: client.getDeviceId(),
                        access_token: response.access_token,
                    };
                },
            });
        }
    }catch (err) {
        console.error(err.message);
    }
}
/**
 * Method to send encrypted message to the room.
 * @param roomId - ID of the room, where message is sent
 * @param message - message which will be encrypted and sent
 */

async function sendEncryptedMessage(roomId, message) {
    try {
        isUserJoinedInRoom(roomId);

        await client.setRoomEncryption(roomId, {
            algorithm: "m.megolm.v1.aes-sha2",
        });

        await client.sendEvent(roomId, "m.room.message", {
            "body": JSON.stringify(message),
            "msgtype": "m.text"
        });
        console.log("Encrypted message sent successfully.");
    } catch (error) {
        console.error("Error sending encrypted message:", error);
    }
}

/**
 * Method to send given message to the room. Message will NOT be encrypted.
 * @param roomId - ID of the room, where message is sent
 * @param message - message
 */

async function sendMessage(message, roomId) {
    const content = {
        body: JSON.stringify(message),
        msgtype: "m.text",
    };
    client.sendEvent(roomId, "m.room.message", content, "", (err) => {
        console.log(err);
    });
}
/**
 * Waiting for NOT encrypted message to come
 * @return - whenever message comes, getMessage returns it
 */
function getMessage() {
    return new Promise((resolve) => {
        client.on("Room.timeline", function (event, room, toStartOfTimeline) {
            if (toStartOfTimeline) {
                return;
            }
            if (event.getType() !== "m.room.message") {
                return;
            }
            const mess = event.getContent().body;
            resolve(mess);
        });
    });
}

/**
* Waiting for encrypted message to come TODO not working 😢
* @param roomId - The room ID where the encrypted message is expected
* @return - Whenever an encrypted message comes, getMessage decrypts and returns it
*/
function getMessageEncrypted(roomId) {
    return new Promise(async (resolve, reject) => {

        const isJoined =  isUserJoinedInRoom(roomId);
        if (!isJoined) {
            reject("Client is not a member of the room");
            console.log("Client is not a member of the room");
            return;
        }

        await client.setRoomEncryption(roomId, {
            algorithm: "m.megolm.v1.aes-sha2",
        });

        if(client.isRoomEncrypted(roomId)){
            console.log("ROOM IS ENCRYPTED");
            client.on("Event.decrypted", (event) => {
                if (event.getRoomId() === roomId) {
                    if (event.getType() === "m.room.encrypted" && event.isDecryptionFailure()) {
                        reject("Failed to decrypt message: "+ event);
                    } else if (event.getType() === "m.room.message") {
                        const content = event.getContent().body;
                        resolve(content);
                    }
                }
            });
            client.on("Event.decryption_failure", (event, err) => {
                console.error("Error decrypting event: ", err);
                reject(err);
            });
        }else{
            reject("Room is NOT encrypted "+ roomId);
        }
    });
}

/**
 * Checks if current client is joined in given room
 * @param roomId - id of room where should listener listen for events
 * @return boolean
 */
function isUserJoinedInRoom(roomId) {
    if (!client) {
        throw new Error("Client is not initialized.");
    }
    const room = client.getRoom(roomId);
    if (!room) {
        return false;
    }
    const member = room.getMember(client.getUserId());
    return member && member.membership === "join";
}

/**
 * Message listener
 * @param onMessageCallback - gives received message
 * @param roomId - id of room where should listener listen for events
 */
function messageListener(onMessageCallback, roomId) {
    client.on("Room.timeline", function (event, room, toStartOfTimeline) {
        if (toStartOfTimeline) {
            return; // don't print paginated results
        }
        if (event.getType() !== "m.room.message") {
            return; // only print messages
        }
        if(roomId !== room.roomId){
            throw new Error("Error: wrong room");
        }
        const message = event.getContent().body;
        onMessageCallback(message);
    });
}

/**
 * Message listener for messages that are end-to-end encrypted
 * @param onMessageCallback - gives decrypt message
 * @param roomId - id of room where should listener listen for encrypted events
 */
function messageListenerEncrypted(onMessageCallback, roomId) {

    if(!isUserJoinedInRoom(roomId)){
        throw new Error("Error while checking user's room join status");
    }
    client.setRoomEncryption(roomId, {
        algorithm: "m.megolm.v1.aes-sha2",
    }).then(()=>{
        client.on("Event.decrypted", (event) => {
            if (event.getRoomId() === roomId) {
                if (event.getType() === "m.room.encrypted" && event.isDecryptionFailure()) {
                    throw new Error("Failed to decrypt message: ", event);
                } else if (event.getType() === "m.room.message") {
                    const content = event.getContent();
                    onMessageCallback(content.body);
                }
            }
        });
    }).catch(er => {
        console.error("Error while setting room encryption:", er);
    });
}

/**
 *  First check if client has permission to invite other users. If client has permission than user is invited to the room.
 * @param roomId - ID of room
 * @param userId - ID of user, who will be invited
 * @returns {Promise<{success: boolean, message: string}>}
 * */
async function inviteUser(roomId, userId){
    try {
        const powerLevels = await client.getStateEvent(roomId, "m.room.power_levels", "");
        const myPowerLevel = await getMyPowerLevel(roomId);
        const invitePowerLevel = powerLevels.invite || 50; // Default value for invite permission is 50

        if (invitePowerLevel > myPowerLevel) {
            console.error("Error: You don't have permission to invite users");
        }

        await client.invite(roomId, userId);
        return { success: true, message: "User invited successfully." };
    } catch (error) {
        console.error("Error inviting user:", error);
        return { success: false, message: "User invitation failed." };
    }
}


/**
 * Method to check for permission level. Default values are 0, 50 and 100. (0 is default user, 50 is moderator, 100 is owner)
 * @param roomId - ID of the room to check the power level
 * @return number of power level in room
 */

async function getMyPowerLevel(roomId){
    try {
        await client.roomInitialSync(roomId, 10);
        const room = client.getRoom(roomId);
        const me = room.getMember(client.getUserId());
       return me.powerLevel
    }catch (error){
        throw new Error(error.message);
    }
}

/**
 * Create own private, end-to-end encrypted room (algorithm m.megolm.v1.aes-sha2)
 * @param roomName - choose name for new room
 * @return {Promise<{success: boolean, message: string, room_id: string || null }>}
 */
async function createRoom(roomName){
    try {
        const response = await client.createRoom({
            name: roomName,
            preset: "private_chat",
            visibility: "private",
            initial_state: [
                {
                    type: "m.room.guest_access",
                    state_key: "",
                    content: {
                        guest_access: "can_join"
                    }
                },
                {
                    type: "m.room.encryption",
                    state_key: "",
                    content: {
                        algorithm: "m.megolm.v1.aes-sha2"
                    }
                }
            ]
        });
        return { success: true, message: "Room created successfully.", room_id: response.room_id, };
    } catch (error) {
        console.error("Error creating room:", error);
        return { success: false, message: "Room creation failed.", room_id: null };
    }
}


/**
 * Getting array of rooms ID, where client is joined
 * @return - return array of rooms ID
 */
async function getJoinedRoomsID(){
    if (!client) {
        throw new Error("Client is not initialized.");
    }
    const response = await client.getJoinedRooms();
    return response.joined_rooms;
}

/**
 * Getting client object
 * @return - returns client object
 */
function getClient() {
    return client;
}

/**
 * Setting client object - prob for mocking purpose only
 * @param newClient - set client object
 */
function setClient(newClient) {
    client = newClient;
}


module.exports = {
    runClient, inviteUser, createRoom, sendEncryptedMessage, sendMessage,
    getMessage, getJoinedRoomsID, messageListener, messageListenerEncrypted,
    getClient, setClient, getMyPowerLevel
}



const loginCred = {
    homeserverUrl: "https://matrix.org",
    username: "radovantrtil1",
    password: "PEFStudent2023"
}

runClient(null, loginCred).then(()=>{

    const roomId = "!FDIfCEjMcxQdaVoAUf:matrix.org";
    const mess = {
        "albumId": 1,
        "id": 2,
        "title": "reprehenderit est deserunt velit ipsam",
        "url": "https://via.placeholder.com/600/771796",
        "thumbnailUrl": "https://via.placeholder.com/150/771796"
    };
    sendEncryptedMessage(roomId,mess).then(r => {console.log(r)}).catch(er =>{console.log(er)});


    getMessageEncrypted(roomId)
        .then((message) => {
            console.log("Received message:", message);
        })
        .catch((error) => {
            console.error("Error while waiting for message:", error);
        });
});
