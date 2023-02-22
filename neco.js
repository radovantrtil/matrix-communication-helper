const sdk = require("matrix-js-sdk");

const client = sdk.createClient({
    baseUrl: "https://matrix.org",
    accessToken: "syt_cmFkb3ZhbnRydGls_vkwvMUnSwQUQqCNRpVVj_0amRWi",
    userId: "@radovantrtil:matrix.org"
});

//console.log(client.getAccessToken());

client.login("m.login.password", {"user": "@radovantrtil:matrix.org", "password": "bujvak-cyqxUv-3nymse"}).then((response) => {
    console.log(response.access_token);
});

await client.startClient({initialSyncLimit: 10});

client.once('sync', function(state, prevState, res) {
    console.log(state); // state will be 'PREPARED' when the client is ready to use
});

client.on("event", function(event){
    console.log(event.getType());
    console.log(event);
})

client.on("Room.timeline", function(event, room, toStartOfTimeline) {
    console.log(event.event);
});


// client.client.getRooms() returns an array of room objects
const rooms = client.getRooms();
rooms.forEach(room => {
    console.log(room.roomId);
});

