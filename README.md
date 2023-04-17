
# Matrix communication helper

Matrix communication helper is an [NPM](https://www.npmjs.com/package/matrix-communication-helper) package that provides end-to-end encrypted (e2ee) 
secure communication between web services, built on top of the Matrix protocol.
This package makes it easy to send and receive encrypted messages, 
create and manage rooms, and invite users to rooms.

## Requirements

- Node.js version 18 or higher
- A valid account on the desired homeserver

## Installation

To install the package, run the following command:

```
npm install matrix-communication-helper
```
## Exported methods

- `runClient(credentials)` Initializes and starts the Matrix client with the given credentials.
- `createRoom(roomName)` Creates a new private, end-to-end encrypted room.
- `inviteUser(roomId, userId)` Invites a user to a room. 
- `sendEncryptedMessage(roomId, message)` Sends an encrypted message to a room. 
- `sendMessage(roomId, message)` Sends a plain text message to a room.
- `onMessage(roomId, onMessageCallback)` Sets up a message listener for plain text messages in a room.
- `onEncryptedMessage(roomId, onMessageCallback)` Sets up a message listener for encrypted messages in a room.
- `getMessage(roomId)` Waits for a plain text message to arrive in a room. 
- `getJoinedRoomsID()` Retrieves an array of room IDs that the client has joined.
- `getAllMemberUserIds(roomId)` Retrieves an array of room member's user ids.
- `getMyPowerLevel(roomId)` Retrieves the power level of the client in a room. 
- `isCurrentClientJoinedInRoom(roomId)` Checks if the client is a member of a room.


## Usage

1. Import the package:

```javascript
const m_helper = require("matrix-communication-helper");
```

2. Provide the user's login credentials (homeserver URL, username and password as object):

```javascript
const loginCred = {
    homeserverUrl: "https://matrix.org",
    username: "your-username",
    password: "your-password",
};
```
   or in json file like this conf.json and add relative path to this file as parameter, e.g. "./config.json"  
``` json
{
    "homeserverUrl": "https://matrix.org",
    "username": "yourUsername",
    "password": "yourPassword"
}
```
3. Start the client with the provided credentials using object or file path to file with creds:

```javascript
m_helper.runClient(credentials)
.then(() => {
    // Your code here
})
.catch((error) => {
    console.error("Error while running client:", error);
});
```

4. Use the available functions to perform various tasks, such as sending encrypted messages, listening for encrypted messages, inviting users to a room, and more. See the following examples:

```javascript
const roomsID = await m_helper.getJoinedRoomsID();
const roomId = roomsID[0];

const mess = {
    albumId: 1,
    id: 2,
    title: "reprehenderit est deserunt velit ipsam",
    url: "https://via.placeholder.com/600/771796",
    thumbnailUrl: "https://via.placeholder.com/150/771796",
};

// Send an encrypted message
m_helper.sendEncryptedMessage(roomId, mess)
.then((response) => {
    console.log(response);
})
.catch((error) => {
    console.error("Error while sending encrypted message:", error);
});

// Listen for encrypted messages
m_helper.onEncryptedMessage( roomId, (message) => {
        console.log("Received message:", message);
    }
);
```

## Documentation

For a detailed description of the available functions and their usage, refer to the package's source code comments.

## Contributing

Contributions to the package are welcome. Feel free to open an issue or submit a pull request on the repository.

## License

This project is licensed under the MIT License.