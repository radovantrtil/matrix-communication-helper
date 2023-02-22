const sdk = require("matrix-js-sdk");

const myUserID = "@radovantrtil1:matrix.org";
const myAccessToekn = "syt_cmFkb3ZhbnRydGlsMQ_nlgCLnwPbVhxcBOaTOln_0yS1SC"

const testRoomID = "!ambjRjYWCPSvILAPze:matrix.org";
//!jjrsLQPtuOWsvGelBL:matrix.org

const client = sdk.createClient({
    baseUrl: "https://matrix.org",
    accessToken: myAccessToekn,
    userId: myUserID
});

const recipient = "!cJujgkNfmdLISHmkoq:matrix.org";

//client.publicRooms(function(err, data) {
//      console.log("Public Rooms: %s", JSON.stringify(data));
//});

/*
// Listen for low-level MatrixEvents
client.on("event", function(event) {
    console.log(event.getType());
});*/

client.on("RoomMember.membership", function(event, member) {
    if (member.membership === "invite" && member.userID === myUserID) {
        client.joinRoom(member.roomId).then(function() {
            console.log("Auto-joined %s", member.roomId);
        });
    }
});


// Listen for typing changes
client.on("RoomMember.typing", function(event, member) {
    if (member.typing) {
        console.log(member.name + " is typing...");
    }
    else {
        console.log(member.name + " stopped typing.");
    }
});

client.on("Room.timeline", function(event, room, toStartOfTimeline) {
    if (toStartOfTimeline) {
        return; // don't print paginated results
    }
    if (event.getType() !== "m.room.message") {
        return; // only print messages
    }
    // the room name will update with m.room.name events automatically
    console.log("(%s) %s :: %s", room.name, event.getSender(), event.getContent().body);
});

// start the client to setup the connection to the server
client.startClient({initialSyncLimit: 10}).then((response)=> {
    console.log(response)
});

client.once('sync', function(state, prevState, res) {
    if(state === 'PREPARED') {
        console.log("prepared");
    } else {
        console.log(state);
        process.exit(1);
    }
});

const content = {
    "body": "Ahoj lidi!",
    "msgtype": "m.text"
};
client.sendEvent(testRoomID, "m.room.message", content, "", (err, res) => {
    console.log(err);
});

const mess = {
    "body": "Ahoj člověče!",
    "msgtype": "m.text"
}

client.sendEvent(recipient, "m.room.message", mess
).then((response) => {
    console.log(`Message sent to ${recipient}: ${mess.body}`);
}).catch((error) => {
    console.error(`Failed to send message to ${recipient}: ${error}`);
});

client.on("Room.timeline", function(event, room, toStartOfTimeline) {
    if (event.getType() !== "m.room.message") {
        return; // only use messages
    }
    // we are only interested in messages from the test room, which start with "!"
    if (event.getRoomId() === testRoomID && event.getContent().body[0] === '!') {
        sendNotice(event.event.content.body);
    }
});

const rooms = client.getRooms();
rooms.forEach(room => {
    const members = room.getJoinedMembers();
    members.forEach(member => {
        console.log(member.name);
    });
});

Object.keys(client.store.rooms).forEach((roomId) => {
    client.getRoom(roomId).timeline.forEach(t => {
        console.log(t.event);
    });
});