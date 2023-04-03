const sdk = require("matrix-js-sdk");
const olm = require("@matrix-org/olm");
const { getCredentialsWithPassword } = require('./matrix');
const {OlmDevice} = require("matrix-js-sdk/lib/crypto/OlmDevice");
const fs = require('fs');

global.Olm = olm;

let client;
let memoryStore = new sdk.MemoryStore();
let cryptoStore = new sdk.MemoryCryptoStore();

/**
 * This method runs matrix client. Use object or file to give this method credentials.
 * @param filePath - path to file that contains the user's login credentials (username, password, and homeserverUrl)
 * @param credentials - object with the user's login credentials (username, password, and homeserverUrl)
 */
async function runClient(filePath, credentials={}) {
    // Check if file path or object is missing
    if (!filePath && !credentials) {
        throw new Error('Error: must provide either a file path or a object with username, password and homeserverUrl');
    }

    //init olm library
    await olm.init({locateFile: () => "node_modules/@matrix-org/olm/olm.wasm"});

    let data;

    try {
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
    } catch (err) {
        console.error(err.message);
    }

    const { accessToken, userId, deviceId } = await getCredentialsWithPassword(data.username,data.password);
    client = sdk.createClient({
        baseUrl: data.homeserverUrl,
        accessToken: accessToken,
        userId: userId,
        deviceId: deviceId,
        store: memoryStore,
        cryptoStore: cryptoStore
    });

    await client.initCrypto();

    if(client.isCryptoEnabled()){
        console.log("STARTING client, crypto enabled");
        await client.startClient({ initialSyncLimit: 1 });
    }
    await client.exportDevice();

    client.on('sync', async function (state, prevState, res) {
        if (state === 'PREPARED') {
            console.log("STATE: ", state);
            client.exportRoomKeys();
        }
    });

    client.on("RoomMember.membership", function(event, member) {
        if (member.membership === "invite" && member.userId === client.getUserId()) {
            client.joinRoom(member.roomId).then(function() {
                console.log("Auto-joined %s", member.roomId);
            });
        }
    });
}

async function sendMessage(message, roomId) {
    const content = {
        body: JSON.stringify(message),
        msgtype: "m.text",
    };
    client.sendEvent(roomId, "m.room.message", content, "", (err, res) => {
        console.log(err);
    });
}
/**
 * Waiting for message to come... TODO return encrypted messages instead....
 * @return - whenever message comes, getMessage returns it
 */

function getMessage() {
    return new Promise((resolve) => {
        client.on("Room.timeline", function (event, room, toStartOfTimeline) {
            if (toStartOfTimeline) {
                return; // don't print paginated results
            }
            if (event.getType() !== "m.room.message") {
                return; // only print messages
            }
            const mess = event.getContent().body;
            resolve(mess);
        });
    });
}

/**
 * Message listener... TODO listen for encrypted events instead....
 * @param onMessageCallback
 */

function messageListener(onMessageCallback) {
    client.on("Room.timeline", function (event, room, toStartOfTimeline) {
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
 * Method to send and encrypt given message to the room.
 * @param message - message which will be encrypted and sent
 * @param roomId - ID of the room, where message is sent
 */
// send encrypted message to user
async function sendEncryptedMessage(message, roomId) {

    const olmDevice = new OlmDevice();
    const sessionId =  olmDevice.createOutboundGroupSession();
    const sessionKey = olmDevice.getOutboundGroupSessionKey(sessionId);
    //const devices = client.getDevicesFromStore(["@xtrtil1:matrix.org"]);

    const devices = client.getDevices();
    const sessionInfo = {
        type: "m.room_key",
        content: {
            algorithm: "m.megolm.v1.aes-sha2",
            room_id: roomId,
            session_id: sessionId,
            session_key: sessionKey
        }
    };

    //TODO sent keys to device m.room_key event
    client.queueToDevice({
        eventType: 'm.room_key',
        batch: [{
            userId: client.getUserId(),
            deviceId: client.getDeviceId(),
            payload: sessionInfo.content,
        }]
    })

    // Encrypt the message using the session
    const text = {
        type: "m.room.encrypted",
        content: {
            msgtype: "m.text",
            body: message
        }
    };
    const cipherText = olmDevice.encryptGroupMessage(sessionId, text);
    const content = {
        algorithm: "m.megolm.v1.aes-sha2",
        sender_key: client.getDeviceCurve25519Key(),
        device_id: client.getDeviceId(),
        session_id: sessionId,
        ciphertext: cipherText,
        sender: client.userid,
    };
    await client.sendEvent(roomId, "m.room.encrypted", content)
}

/**
 *  First check if client has permission to invite other users. If client has permission than user is invited to the room.
 * @param userId - ID of user, who will be invited
 */
async function inviteUser(roomId, userId){
    const powerLevels = await client.getStateEvent(roomId, "m.room.power_levels", "");
    const myPowerLevel = await getMyPowerLevel(roomId);
    if(powerLevels.invite > myPowerLevel){
        throw new Error("Error: You dont have permission to invite users");
    }
    await client.invite(roomId, userId);
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
 */
async function createRoom(roomName){
    await client.createRoom({
        name: roomName,
        preset:"private_chat",
        visibility:"private",
        initial_state:
            [
                {
                    type:"m.room.guest_access",
                    state_key:"",
                    content:{
                        guest_access:"can_join"
                    }
                },
                {
                    type:"m.room.encryption",
                    state_key:"",
                    content:
                        {
                            algorithm:"m.megolm.v1.aes-sha2"
                        }
                }
            ]
    });
}


/**
 * Getting array of rooms ID, where client is joined
 * @return - return array of rooms ID
 */
async function getJoinedRoomsID(){
    const response = await client.getJoinedRooms();
    return response.joined_rooms;
}

module.exports = {
    runClient, inviteUser, createRoom, sendEncryptedMessage, sendMessage, getMessage, getJoinedRoomsID, messageListener
}

const loginCred = {
    homeserverUrl: "https://matrix.org",
    username: "",
    password: ""
}

//TESTING 😂💥
const filePath= "./config.json";
runClient(filePath,loginCred)
    .then((a) =>{
        sendMessage("hello", "!pScOYJKexjtjIPBGAI:matrix.org",
        )
            .then((a) =>{
                messageListener(message => {
                    console.log("Received message: ", message);
                    inviteUser("!pScOYJKexjtjIPBGAI:matrix.org", "@xtrtil:matrix.org");
                });
                getMessage().then((mess) => {
                    getJoinedRoomsID().then(r => {
                        for(const room of r){
                            console.log("Room: ", room)
                        }
                    });
                });
            })
            .catch((error) => console.error(error));
    })
    .catch((error) => console.error(error));

