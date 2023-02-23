const sdk = require("matrix-js-sdk");
const olm = require('olm');


const myUserId = "@xtrtil1:matrix.org";
const myAccessToken = "syt_eHRydGlsMQ_mdEXfZJEJXeHBhkwpigY_44ZEXb";

const roomId = '!wsuLXkQeEgUrYhxYIK:matrix.org';
const message = 'Hello, world!';

const content = {
    "body": "Ahoj lidi!",
    "msgtype": "m.text"
};

const zprava ={
    type: "m.room.message",
    content: content,
    room_id: roomId
}

const matrixClient = sdk.createClient({
    baseUrl: "https://matrix.org",
    accessToken: myAccessToken,
    userId: myUserId,
});

// Get the encryption keys for the room
const room = matrixClient.getRoom(roomId);
const encryptionKeys = room.getEncryptionTargetMembers().map((member) => member.userId);

// Encrypt the message using Olm
const ciphertext = matrixClient.crypto.encryptMessage(encryptionKeys, {
    type: 'm.text',
    body: message
}).then(console.log('Encrypted message:', ciphertext));



matrixClient.on("RoomMember.membership", function (event, member) {
    if (member.membership === "invite" && member.userId === myUserId) {
        matrixClient.joinRoom(member.roomId).then(function () {
            console.log("Auto-joined %s", member.roomId);
        });
    }
});

matrixClient.startClient();