const sdk = require("matrix-js-sdk");


const xtrtilId= "@xtrtil1:matrix.org";
const myUserID = "@radovantrtil1:matrix.org";
const myAccessToekn = "syt_cmFkb3ZhbnRydGlsMQ_nlgCLnwPbVhxcBOaTOln_0yS1SC"

const testRoomID = "!KQANJEAzaiMyqMFVlA:matrix.org";


const client = sdk.createClient({
    baseUrl: "https://matrix.org",
    accessToken: myAccessToekn,
    userId: myUserID
});

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



client.once('sync', function(state, prevState, res) {
    if(state === 'PREPARED') {
        console.log("prepared");
    } else {
        console.log(state);
        process.exit(1);
    }
});

const content = {
    body: "Ahoj lidi!",
    msgtype: "m.text"
};

client.sendEvent(testRoomID, "m.room.message", content, "", (err, res) => {
    console.log(err);
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

client.createRoom({
        name:"Tohle je mistnost",
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
})
    .then(room => {
        console.log(`Created room ${room.room_id}`);
        // Do something with the roomId, such as inviting users
        client.invite(room.room_id, xtrtilId)
            .then(() => console.log(`Invited ${xtrtilId} to ${room.room_id}`))
            .catch(err => console.error(`Failed to invite ${userId} to ${room.room_id}`, err));

    })
    .catch(err => console.error(`Failed to create room`, err));

Object.keys(client.store.rooms).forEach((roomId) => {
    client.getRoom(roomId).timeline.forEach(t => {
        console.log(t.event);
    });
});


// start the client to setup the connection to the server
client.startClient({initialSyncLimit: 10}).then((response)=> {
    console.log(response)
});