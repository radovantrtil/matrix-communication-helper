# Matrix communication helper

Matrix communication helper is an NPM package that provides end-to-end encrypted (e2ee) 
secure communication between web services, built on top of the Matrix protocol.
This package makes it easy to send and receive encrypted messages, 
create and manage rooms, and invite users to rooms.

## Requirements

- Node.js version 18 or higher
- A valid account on the desired homeserver

## Installation

To install the package, run the following command:

```
npm install bp_xtrtil
```

## Usage

1. Import the package:

```javascript
const bp_xtrtil = require("bp_xtrtil");
```

2. Provide the user's login credentials (homeserver URL, username and password):

```javascript
const loginCred = {
    homeserverUrl: "https://matrix.org",
    username: "your-username",
    password: "your-password",
};
```

or in json file like this conf.json:
``` json
{
    "homeserverUrl": "https://matrix.org",
    "username": "yourUsername",
    "password": "yourPassword"
}
```
3. Start the client with the provided credentials using object or file path to file with creds:

```javascript
bp_xtrtil.runClient(filePath, loginCred)
.then(() => {
    // Your code here
})
.catch((error) => {
    console.error("Error while running client:", error);
});
```

4. Use the available functions to perform various tasks, such as sending encrypted messages, listening for encrypted messages, inviting users to a room, and more. See the following examples:

```javascript
const roomsID = await bp_xtrtil.getJoinedRoomsID();
const roomId = roomsID[0];

const mess = {
    albumId: 1,
    id: 2,
    title: "reprehenderit est deserunt velit ipsam",
    url: "https://via.placeholder.com/600/771796",
    thumbnailUrl: "https://via.placeholder.com/150/771796",
};

// Send an encrypted message
bp_xtrtil.sendEncryptedMessage(roomId, mess)
.then((response) => {
    console.log(response);
})
.catch((error) => {
    console.error("Error while sending encrypted message:", error);
});

// Listen for encrypted messages
bp_xtrtil.onEncryptedMessage(
    (message) => {console.log("Received message:", message);}, roomId
);
```

## Documentation

For a detailed description of the available functions and their usage, refer to the package's source code comments.

## Contributing

Contributions to the package are welcome. Feel free to open an issue or submit a pull request on the repository.

## License

This project is licensed under the MIT License.