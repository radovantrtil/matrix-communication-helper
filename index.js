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
            accessToken: credentials.access_token,
            userId: credentials.user_id,
            deviceId: credentials.device_id
        };
    }catch (error){
       throw new Error("failed to login ", error);
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
    let fileData;
    if (filePath) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        fileData = JSON.parse(fileContent);
    }

    const fileProperties = fileData ? ['homeserverUrl', 'username', 'password'] : [];
    const objectProperties = ['homeserverUrl', 'username', 'password'];
    const properties = [...fileProperties, ...objectProperties];
    const missingProperties = properties.filter(prop => !fileData?.[prop] && !credentials?.[prop]);

    if (missingProperties.length > 0) {
        throw new Error(`Error: missing properties, needed properties: ${missingProperties.join(', ')}`);
    }

    data = credentials && (!fileData || missingProperties.some(prop => credentials.hasOwnProperty(prop))) ? credentials : fileData;

    try {
        const { accessToken, userId, deviceId } = await getCredentialsWithPassword(data.username,data.password, data.homeserverUrl);
        client = sdk.createClient({
            baseUrl: data.homeserverUrl,
            accessToken: accessToken,
            userId: userId,
            deviceId: deviceId,
            store: memoryStore,
            cryptoStore: cryptoStore
        });

        await client.initCrypto();

        client.on("RoomMember.membership", function (event, member) {
            if (member.membership === "invite" && member.userId === client.getUserId()) {
                client.joinRoom(member.roomId).then(function () {
                    console.log("Auto-joined %s", member.roomId);
                });
            }
        });


        await client.startClient({ initialSyncLimit: 10 });

        if(client.getCrypto()){
            client.getCrypto().globalBlacklistUnverifiedDevices = false;
            client.getCrypto().globalErrorOnUnknownDevices = false;

        }

        if (!client.getCrossSigningId()) {
            await client.bootstrapCrossSigning();
        }


    }catch (err) {
        throw new Error("Error while setting up client: ", err.message);
    }
}
/**
 * Method to send encrypted message to the room.
 * @param roomId - ID of the room, where message is sent, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @param message - send JSON like this e.q. {"albumId": 1, "id": 2, "title": "reprehenderit est deserunt velit ipsam"}
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendEncryptedMessage(roomId, message) {
    try {
        if(!isCurrentClientJoinedInRoom(roomId)){
            return; // { success: false, message: `Client is not member of the room ${roomId}`};
        }

        await client.sendEvent(roomId, "m.room.message", {
            body: JSON.stringify(message),
            msgtype: "m.text"
         });
        return { success: true, message: "Encrypted message sent successfully." };
    } catch (error) {
        throw new Error(`Error sending encrypted message: ${error.message}`);
    }
}

/**
 * Method to send given message to the room. Message will NOT be encrypted.
 * @param message - send JSON like this e.q. {"albumId": 1, "id": 2, "title": "reprehenderit est deserunt velit ipsam"}
 * @param roomId - ID of the room, where message is sent, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 */

async function sendMessage(message, roomId) {
     if(!isCurrentClientJoinedInRoom(roomId)){
        throw new Error(`Client is not member of the room ${roomId}`);
     }

    const content = {
        body: JSON.stringify(message),
        msgtype: "m.text",
    };
    client.sendEvent(roomId, "m.room.message", content, "", (err) => {
        throw new Error('Error while sending message: ', err)
    });
}
/**
 * Waiting for NOT encrypted message to come
 * @param roomId - e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @return - whenever message comes, onMessage returns it
 */
function onMessage(roomId) {
    return new Promise((resolve, reject) => {

        const isJoined =  isCurrentClientJoinedInRoom(roomId);
        if (!isJoined) {
            reject("Client is not a member of the room");
            return;
        }

        client.on("Room.timeline", function (event, room, toStartOfTimeline) {
            if (event.getRoomId() !== roomId) {
                return;
            }

            if (event.getSender() === client.getUserId()) {
                return;
            }

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
 * Waiting for encrypted message to come TODO not working, bad message index 😢
 * @param roomId - The room ID where the encrypted message is expected, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @return - Whenever an encrypted message comes, onMessage decrypts and returns it
 */
function onMessageEncrypted(roomId) {
    return new Promise(async (resolve, reject) => {

        const isJoined =  isCurrentClientJoinedInRoom(roomId);
        if (!isJoined) {
            reject("Client is not a member of the room");
            return;
        }

        if(!client.isRoomEncrypted(roomId)){
            throw new Error(`room with ${roomId} has not enabled e2ee`);
        }

        client.on("Event.decrypted", (event) => {
            if (event.getRoomId() !== roomId) {
                return;
            }
            if (event.getSender() === client.getUserId()) {
                return;
            }

            if (event.getType() === "m.room.encrypted" && event.isDecryptionFailure()) {
                reject("Failed to decrypt message: "+ event);
            } else if (event.getType() === "m.room.message") {
                const content = event.getContent().body;
                resolve(content);
            }else{
                throw new Error("another error happened");
            }
        });
    });
}

/**
 * Checks if current client is joined in given room
 * @param roomId - id of room where should listener listen for events
 * @return boolean
 */
function isCurrentClientJoinedInRoom(roomId) {
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
 * @param roomId - id of room where should listener listen for events, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 */
function messageListener(onMessageCallback, roomId) {
    if(!isCurrentClientJoinedInRoom(roomId)){
        throw new Error("Error while checking user's room join status");
    }
    client.on("Room.timeline", function (event, room, toStartOfTimeline) {
        if (event.getRoomId() !== roomId) {
            return;
        }
        if (toStartOfTimeline) {
            return; // don't print paginated results
        }
        if (event.getType() !== "m.room.message") {
            return; // only print messages
        }
        const message = event.getContent().body;
        onMessageCallback(message);
    });
}


/**
 * Get all room member's user ids
 * @param roomId - id of room where should listener listen for encrypted events, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @returns userIds - all user ids that are in this room
 */
function getAllMemberUserIds(roomId) {
    const room = client.getRoom(roomId);

    if (!room) {
        throw new Error(`Room with ID ${roomId} not found.`);
    }

    const members = room.getJoinedMembers();
    const userIds = members.map(member => member.userId);

    return userIds;
}

/**
 * Message listener for messages that are end-to-end encrypted
 * @param onMessageCallback - gives decrypt message
 * @param roomId - id of room where should listener listen for encrypted events, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 */
function messageListenerEncrypted(roomId, onMessageCallback,) {

    if(!isCurrentClientJoinedInRoom(roomId)){
        throw new Error("Error while checking user's room join status");
    }

    if(!client.isRoomEncrypted(roomId)){
        throw new Error(`room with ${roomId} has not enabled e2ee`);
    }
    client.on("Event.decrypted", (event) => {
        if (event.getRoomId() !== roomId) {
             return;
        }
        if (event.getSender() === client.getUserId()) {
            return;
        }
        if (event.getType() === "m.room.encrypted" && event.isDecryptionFailure()) {
            throw new Error("Failed to decrypt message");
        } else if (event.getType() === "m.room.message") {
            const content = event.getContent();
            onMessageCallback(content.body);
        }else{
            throw new Error("another error happened");
        }
    });
}

/**
 *  First check if client has permission to invite other users. If client has permission then user is invited to the room.
 * @param roomId - ID of room, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @param userId - ID of user, who will be invited, e.g. @radovantrtil6:matrix.org
 * @returns {Promise<{success: boolean, message: string}>}
 * */
async function inviteUser(roomId, userId){
    try {
        const powerLevels = await client.getStateEvent(roomId, "m.room.power_levels", "");
        const myPowerLevel = await getMyPowerLevel(roomId);
        const invitePowerLevel = powerLevels.invite || 50; // Default value for invite permission is 50

        if (invitePowerLevel > myPowerLevel) {
            return { success: false, message: "You don't have permission to invite users" };
        }
        await client.invite(roomId, userId);
        return { success: true, message: "User invited successfully." };
    } catch (error) {
        throw new Error(`User invitation failed. ${error.message}`);
    }
}


/**
 * Method to check for permission level. Default values are 0, 50 and 100. (0 is default user, 50 is moderator, 100 is owner)
 * @param roomId - ID of the room to check the power level, e.g. !qnjuOasOtHffOMyfpp:matrix.org
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
                    content: {
                        guest_access: "can_join"
                    }
                },
                {
                    type: "m.room.encryption",
                    content: {
                        algorithm: "m.megolm.v1.aes-sha2"
                    }
                }
            ]
        });
        return { success: true, message: "Room created successfully.", room_id: response.room_id, };
    } catch (error) {
        throw new Error(`Room creation failed. ${error.message}`);
    }
}


/**
 * Getting array of rooms ID, where client is joined
 * @return - return array of rooms ID
 */
async function getJoinedRoomsID(){
    try{
        const response = await client.getJoinedRooms();
        return response.joined_rooms;
    }catch (error){
        throw new Error("Error while trying to get rooms ID: ", error.message);
    }
}

/**
 * Getting client object
 * @return - returns client object
 */
function getClient() {
    return client;
}

/**
 * Setting client object - prob for testing purpose only
 * @param newClient - set client object
 */
function setClient(newClient) {
    client = newClient;
}

module.exports = {
    runClient, inviteUser, createRoom, sendEncryptedMessage, sendMessage,
    onMessage, getJoinedRoomsID, messageListener, messageListenerEncrypted,
    getClient, setClient, getMyPowerLevel, isCurrentClientJoinedInRoom
}


