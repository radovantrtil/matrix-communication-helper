import olm from "@matrix-org/olm";
import sdk from "matrix-js-sdk";

if (typeof window !== 'undefined') {
    window.Olm = olm;
} else if (typeof global !== 'undefined') {
    global.Olm = olm;
} else {
    throw new Error('Unsupported environment.');
}

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

async function initializeOlm() {
    await olm.init();
}

async function initClient(credentials) {
    const { accessToken, userId, deviceId } =
        await getCredentialsWithPassword(credentials.username, credentials.password, credentials.homeserverUrl);

    client = sdk.createClient({
        baseUrl: credentials.homeserverUrl,
        accessToken: accessToken,
        userId: userId,
        deviceId: deviceId,
        store: memoryStore,
        cryptoStore: cryptoStore
    });
}

function validateCredentials(data) {
    const requiredProperties = ['homeserverUrl', 'username', 'password'];
    const missingProperties = requiredProperties.filter(prop => !data?.[prop]);

    if (missingProperties.length > 0) {
        throw new Error(`Error: missing properties, needed properties: ${missingProperties.join(', ')}`);
    }
}

function autoJoinRooms() {
    client.on("RoomMember.membership", function (event, member) {
        if (member.membership === "invite" && member.userId === client.getUserId()) {
            client.joinRoom(member.roomId).then(function () {
                console.log("Auto-joined %s", member.roomId);
            });
        }
    });
}

async function configureCrypto() {
    if (client.getCrypto()) {
        client.getCrypto().globalBlacklistUnverifiedDevices = false;
        client.getCrypto().globalErrorOnUnknownDevices = false;
    }

    if (!client.getCrossSigningId()) {
        await client.bootstrapCrossSigning();
    }
}

function waitForPreparedState() {
    return new Promise((resolve) => {
        client.once("sync", function (state, prevState, res) {
            if (state === "PREPARED") {
                resolve();
            }
        });
    });
}

/**
 * This method runs matrix client. Use object or file to give this method credentials.
 * @param credentials - relative path to file (e.g. ./config.json) or object containing this ({"homeserverUrl": "https://matrix.org", "username": "yourUsername", "password": "yourPassword"})
 */
async function runClient(credentials) {
    if (!credentials) {
        throw new Error('Error: must provide either a file path or an object with username, password, and homeserverUrl');
    }

    let data;
    if (typeof credentials === 'string' && typeof window === 'undefined') {
        const fs = require('fs');
        const fileContent = fs.readFileSync(credentials, 'utf8');
        const fileData = JSON.parse(fileContent);
        data = fileData;
    } else if (typeof credentials === 'object') {
        data = credentials;
    } else {
        throw new Error('Error: input must be either a file path or an object with username, password, and homeserverUrl');
    }
    validateCredentials(data);
    await initializeOlm();
    await initClient(data);
    const waitForPreparedStatePromise = waitForPreparedState();
    await client.initCrypto();
    autoJoinRooms();
    await client.startClient({ initialSyncLimit: 10 });
    await configureCrypto();
    await waitForPreparedStatePromise;
}

/**
 * Method to send encrypted message to the room.
 * @param roomId - ID of the room, where message is sent, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @param message - send JSON like this e.q. {"albumId": 1, "id": 2, "title": "reprehenderit est deserunt velit ipsam"}
 */
async function sendEncryptedMessage(roomId, message) {
    if(!client.isRoomEncrypted(roomId)){
        throw new Error("Error sending message, room is not encrypted", roomId);
    }
    await sendMessage(roomId, message);
}

/**
 * Method to send given message to the room. Message will NOT be encrypted.
 * @param roomId - ID of the room, where message is sent, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @param message - send JSON like this e.q. {"albumId": 1, "id": 2, "title": "reprehenderit est deserunt velit ipsam"}
 */
async function sendMessage(roomId, message) {
    try{
        if(!isCurrentClientJoinedInRoom(roomId)){
            return;
        }
        const content = {
            body: JSON.stringify(message),
            msgtype: "m.text",
        };
        await client.sendEvent(roomId, "m.room.message", content);
    }catch(error){
        throw new Error(`Error sending message: ${error.message}`)
    }
}

/**
 * Checks if current client is joined in given room
 * @param roomId - id of room where should listener listen for events
 * @return {boolean}
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
function onMessage(roomId, onMessageCallback) {
    if(!isCurrentClientJoinedInRoom(roomId)){
        throw new Error("Error while checking user's room join status");
    }
    client.on("Room.timeline", function (event, room, toStartOfTimeline) {
        if (event.getRoomId() !== roomId) {
            return;
        }
        if (toStartOfTimeline) {
            return;
        }
        if (event.getType() !== "m.room.message") {
            return;
        }
        const message = event.getContent().body;
        onMessageCallback(message);
    });
}


/**
 * Get all room member's user ids
 * @param roomId - id of room where should listener listen for encrypted events, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @returns {[userIds]} userIds - all user ids that are in this room
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
function onEncryptedMessage(roomId, onMessageCallback) {
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
 * */
async function inviteUser(roomId, userId){
    try {
        const powerLevels = await client.getStateEvent(roomId, "m.room.power_levels", "");
        const myPowerLevel = await getMyPowerLevel(roomId);
        const invitePowerLevel = powerLevels.invite || 50; // Default value for invite permission is 50

        if (invitePowerLevel > myPowerLevel) {
            console.log("You don't have permission to invite users");
            return;
        }
        await client.invite(roomId, userId);
        console.log("User invited successfully.");
    } catch (error) {
        throw new Error(`User invitation failed. ${error}`);
    }
}

/**
 * Method to check for permission level. Default values are 0, 50 and 100. (0 is default user, 50 is moderator, 100 is owner)
 * @param roomId - ID of the room to check the power level, e.g. !qnjuOasOtHffOMyfpp:matrix.org
 * @return {int} number of power level in room
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
 * @return {Promise<{ room_id: string }>}
 */
async function createRoom(roomName){
    try {
        const response = await client.createRoom({
            name: roomName,
            preset: "private_chat",
            visibility: "private",
            initial_state: [
                {
                    type: "m.room.encryption",
                    content: {
                        algorithm: "m.megolm.v1.aes-sha2"
                    }
                }
            ]
        });
        return {room_id: response.room_id};
    } catch (error) {
        throw new Error(`Room creation failed. ${error.message}`);
    }
}


/**
 * Getting array of rooms ID, where client is joined
 * @return {Promise< [joinedRooms] >} returns array of rooms ID
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

export default  {
    runClient, inviteUser, createRoom, sendEncryptedMessage, sendMessage,
    getJoinedRoomsID, onMessage, onEncryptedMessage, getClient, setClient,
    getMyPowerLevel, isCurrentClientJoinedInRoom, getAllMemberUserIds
}
