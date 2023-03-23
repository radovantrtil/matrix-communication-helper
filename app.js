const sdk = require("matrix-js-sdk");
const olm = require("@matrix-org/olm");
const { getCredentialsWithPassword } = require('./matrix');
const { LocalStorage } = require('node-localstorage');
const {OlmDevice} = require("matrix-js-sdk/lib/crypto/OlmDevice");
const localStorage = new LocalStorage('./scratch');
const fs = require('fs');
const {ToDeviceChannel} = require("matrix-js-sdk/lib/crypto/verification/request/ToDeviceChannel");
global.Olm = olm;

const configData = fs.readFileSync('config.json');
const config = JSON.parse(configData);

let client;

async function runMatrixClient() {
    const { accessToken, userId, deviceId} = await getCredentialsWithPassword(config.username,config.password);
    client = sdk.createClient({
        baseUrl: config.homeserverUrl,
        accessToken: accessToken,
        userId: userId,
        deviceId: deviceId,
        cryptoStore: new sdk.MemoryCryptoStore(localStorage)
    });

    await client.initCrypto();
    await client.startClient({ initialSyncLimit: 1 });
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

    client.on('Room.timeline', async (event, room, toStartOfTimeline) => {
        if (toStartOfTimeline) {
            return; // don't print paginated results
        }
        if (event.getType() !== "m.room.message") {
            return; // only print messages
        }
        try {
            if (event.getType() === 'm.room.encrypted') {

                const { content, sender, event_id, room_id } = event.getWireContent();
                const sessionId = content.session_id;
                const olmDevice = new OlmDevice();
                const inbound = olmDevice.decryptGroupMessage(
                    room_id, content.sender_key,
                    sessionId,content.ciphertext,event_id  );
                console.log(inbound);
            }
        } catch (error) {
            console.error('#### ', error);
        }

        console.log(
            // the room name will update with m.room.name events automatically
            "(%s) %s :: %s",
            room.name,
            event.getSender(),
            event.getContent().body,
        );
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

module.exports = {
    runMatrixClient, inviteUser, createRoom, sendEncryptedMessage,
}





olm.init({locateFile: () => "node_modules/@matrix-org/olm/olm.wasm"})
    .then(r => {
        console.log("Uspech ", r);
        runMatrixClient()
            .then((a) =>{
                console.log(a);
                sendEncryptedMessage("hello", "!NgWGvoTTehOwtZHZCS:matrix.org",
                )
                    .then((a) =>{
                        console.log(a);
                    })
                    .catch((error) => console.error(error));
            })
            .catch((error) => console.error(error));
    })
    .catch( r=> console.log("Chyba", r));