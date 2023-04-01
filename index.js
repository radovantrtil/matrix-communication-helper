const sdk = require("matrix-js-sdk");
const olm = require("@matrix-org/olm");
const { getCredentialsWithPassword } = require('./matrix');
const {OlmDevice} = require("matrix-js-sdk/lib/crypto/OlmDevice");
const fs = require('fs');
global.Olm = olm;

let client;
let memoryStore = new sdk.MemoryStore();
let cryptoStore = new sdk.MemoryCryptoStore();

async function runClient(filePath, credentials={}) {
    if (!filePath && !(credentials.username && credentials.password && credentials.homeserverUrl)) {
        throw new Error('Must provide either a file path or a username and password');
    }
    //init olm library
    await olm.init({locateFile: () => "node_modules/@matrix-org/olm/olm.wasm"});

    let jsonData, username, password, homeserverUrl;
    if(filePath && !credentials){
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            jsonData = JSON.parse(data);
            if (!jsonData.hasOwnProperty('homeserverUrl') || !jsonData.hasOwnProperty('username') || !jsonData.hasOwnProperty('password')) {
               console.error('The file is missing one or more properties');
               return null;
            }
            const { username: usernameFromFile, password: passwordFromFile, homeserverUrl: homeserverUrlFromFile} = jsonData;

            username = usernameFromFile;
            password = passwordFromFile;
            homeserverUrl= homeserverUrlFromFile;
        } catch (err) {
            console.error(err);
            return null;
        }
    } else{
        if (!credentials.hasOwnProperty('homeserverUrl') || !credentials.hasOwnProperty('username') || !credentials.hasOwnProperty('password')) {
            throw new Error('The object is missing one or more properties');
        }
        const { username: usernameOverride, password: passwordOverride, homeserverUrl: homeserverOverride} = credentials;
        username = usernameOverride;
        password = passwordOverride;
        homeserverUrl= homeserverOverride;
    }

    const { accessToken, userId, deviceId } = await getCredentialsWithPassword(username,password);
    client = sdk.createClient({
        baseUrl: homeserverUrl,
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

    if(client.isInitialSyncComplete()){
        client.on("RoomMember.membership", function(event, member) {
            if (member.membership === "invite" && member.userId === client.getUserId()) {
                client.joinRoom(member.roomId).then(function() {
                    console.log("Auto-joined %s", member.roomId);
                });
            }
        });
    }

    client.on("RoomState.members", function (event, state, member) {
        const room = client.getRoom(state.roomId);
        if (!room) {
            return;
        }
        const memberList = state.getMembers();
        console.log(room.name);
        console.log(Array(room.name.length + 1).join("=")); // underline
        for (let i = 0; i < memberList.length; i++) {
            console.log("(%s) %s", memberList[i].membership, memberList[i].name);
        }
    });
}

async function sendMessage(message, roomId) {
    if (client.isInitialSyncComplete()) {

        const content = {
            body: JSON.stringify(message),
            msgtype: "m.text",
        };
        client.sendEvent(roomId, "m.room.message", content, "", (err, res) => {
            console.log(err);
        });
    }
}

function getMessage() {
    return new Promise((resolve) => {
        client.on("Room.timeline", function (event, room, toStartOfTimeline) {
            if (toStartOfTimeline) {
                return; // don't print paginated results
            }
            if (event.getType() !== "m.room.message") {
                return; // only print messages
            }
            console.log(
                // the room name will update with m.room.name events automatically
                "(%s) %s :: %s",
                room.name,
                event.getSender(),
                event.getContent().body,
            );
            const mess = event.getContent().body;
            resolve(mess);
        });
    });
}

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

    console.log('ivo', localStorage.length)

    await client.sendEvent(roomId, "m.room.encrypted", content)
}

async function inviteUser(roomId, userId){
    await  client.invite(roomId, userId);
}

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

//method returning array of room IDS
async function getJoinedRoomsID(){
    const response = await client.getJoinedRooms();
    return response.joined_rooms;
}

module.exports = {
    runClient, inviteUser, createRoom, sendEncryptedMessage, sendMessage, getMessage, getJoinedRoomsID
}



//TESTING 😂💥
const filePath= "./config.json";
runClient(filePath,null)
    .then((a) =>{
        sendMessage("hello", "!pScOYJKexjtjIPBGAI:matrix.org",
        )
            .then((a) =>{
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

