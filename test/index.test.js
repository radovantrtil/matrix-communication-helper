const assert = require('assert');
const matrix = require('../index.js');
const sinon = require('sinon');

describe('inviteUser and getMyPowerLevel', () => {
    let client;
    let roomId;
    let userId;
    let consoleLogStub;

    beforeEach(() => {
        client = {
            getStateEvent: sinon.stub(),
            getUserId: sinon.stub().returns('@testUser:example.com'),
            invite: sinon.stub(),
            roomInitialSync: sinon.stub(),
            getRoom: sinon.stub()
        };

        const room = {
            getMember: sinon.stub().returns({
                powerLevel: 0,
            }),
        };

        client.getRoom = sinon.stub().returns(room);

        matrix.setClient(client);

        roomId = '!testRoom:example.com';
        userId = '@invitedUser:example.com';
        consoleLogStub = sinon.stub(console, 'log');
    });

    afterEach(() => {
        consoleLogStub.restore();
    });

    describe('getMyPowerLevel', () => {
        it('should return the power level of the client', async () => {
            const room = {
                getMember: sinon.stub().returns({ powerLevel: 50 })
            };
            client.getRoom.returns(room);

            const powerLevel = await matrix.getMyPowerLevel(roomId);

            assert.strictEqual(powerLevel, 50);
        });
    });

    describe('inviteUser', () => {
        it('should successfully invite a user when the client has permission', async () => {
            client.getStateEvent.returns({ invite: 50 }); // Set the required invite power level to 50
            client.roomInitialSync.resolves();
            const room = {
                getMember: sinon.stub().returns({ powerLevel: 100 })
            };
            client.getRoom.returns(room);

            await matrix.inviteUser(roomId, userId);

            sinon.assert.calledWith(consoleLogStub, "User invited successfully.");
            sinon.assert.calledWith(client.invite, roomId, userId);
        });
    });
});

describe('createRoom', () => {
    let client;

    beforeEach(() => {
        client = matrix.getClient();
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should create a private, end-to-end encrypted room', async () => {
        const roomName = 'Test Room';

        const createRoomStub = sinon.stub().resolves({
            room_id: '!newRoomId:matrix.org',
        });

        const mockClient = {
            createRoom: createRoomStub,
        };

        matrix.setClient(mockClient);

        await matrix.createRoom(roomName);

        sinon.assert.calledWith(createRoomStub, {
            name: roomName,
            preset: 'private_chat',
            visibility: 'private',
            initial_state: [
                {
                    type: 'm.room.encryption',
                    content: {
                        algorithm: 'm.megolm.v1.aes-sha2',
                    },
                },
            ],
        });
    });
});

describe('sendMessage', () => {
    let client;

    beforeEach(() => {
        client = matrix.getClient();

        matrix.setClient({
            sendEvent: sinon.stub(),
            getRoom: sinon.stub().returns({ getMember: sinon.stub().returns({ membership: 'join' }) }),
            getUserId: sinon.stub().returns('test-user-id'),
        });

        client = matrix.getClient();
        sinon.stub(matrix, 'isCurrentClientJoinedInRoom').returns(true);
    });

    afterEach(() => {
        sinon.restore();
        matrix.setClient(client);
    });

    it('should send message to room', async () => {
        const message = { text: 'Hello, world!' };
        const roomId = '!room1:matrix.org';

        await matrix.sendMessage(roomId, message);

        assert(client.sendEvent.calledOnceWith(roomId, 'm.room.message', { body: JSON.stringify(message), msgtype: 'm.text' }));
    });

    it('should throw an error when there is an error while sending the message', async () => {
        const message = { text: 'Hello, world!' };
        const roomId = '!room1:matrix.org';

        const errorMessage = 'Error while sending message';
        client.sendEvent.callsFake((_, __, ___, ____, callback) => {
            callback(errorMessage);
        });

        try {
            await matrix.sendMessage(roomId, message);
        } catch (error) {
            assert.strictEqual(error.message, `${error.message}`);
        }
        assert(client.sendEvent.calledOnce);
    });
});

describe('onMessage', () => {
    let client;
    let onMessageCallback;

    afterEach(() => {
        sinon.restore()
        matrix.setClient(client);
    });

    beforeEach(() => {
        client = matrix.getClient();

        matrix.setClient({
            on: sinon.stub(),
            setRoomEncryption: sinon.stub().resolves(),
            getRoom: sinon.stub().returns({ getMember: sinon.stub().returns({ membership: 'join' }) }),
            getUserId: sinon.stub().returns('test-user-id'),
        });

        client = matrix.getClient();
        onMessageCallback = sinon.stub();
        sinon.stub(matrix, 'isCurrentClientJoinedInRoom').returns(true);
    });

    it('should call the onMessageCallback when a new message is received for the correct room', () => {
        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' }),
            getRoomId: () => '!test:example.com',
        };
        const room = { roomId: '!test:example.com' };

        matrix.onMessage(room.roomId, onMessageCallback);

        client.on.args[0][1](event, room, false);

        sinon.assert.calledOnce(onMessageCallback);
        sinon.assert.calledWithExactly(onMessageCallback, event.getContent().body);
    });

    it('should not call the onMessageCallback when a new message is received for a different room', () => {
        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' }),
            getRoomId: () => '!other:example.com',
        };

        const room = { roomId: '!test:example.com' };

        matrix.onMessage(room.roomId, onMessageCallback);

        client.on.args[0][1](event, room, false);

        sinon.assert.notCalled(onMessageCallback);
    });

    it('should not call the onMessageCallback for non-message events', () => {
        const event = {
            getType: () => 'm.room.topic',
            getRoomId: () => '!test:example.com',
        };
        const room = { roomId: '!test:example.com' };

        matrix.onMessage(room.roomId, onMessageCallback);

        client.on.args[0][1](event, room, false);

        sinon.assert.notCalled(onMessageCallback);
    });

    it('should not call the onMessageCallback for paginated results', () => {
        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' }),
            getRoomId: () => '!test:example.com',
        };
        const room = { roomId: '!test:example.com' };

        matrix.onMessage(room.roomId, onMessageCallback);

        client.on.args[0][1](event, room, true);

        sinon.assert.notCalled(onMessageCallback);
    });
});

describe('onEncryptedMessage', () => {
    let client;
    let onMessageCallback;

    afterEach(() => {
        sinon.restore()
        matrix.setClient(client);
    });

    beforeEach(() => {
        client = matrix.getClient();

        matrix.setClient({
            on: sinon.stub(),
            getRoom: sinon.stub().returns({ getMember: sinon.stub().returns({ membership: 'join' }) }),
            getUserId: sinon.stub().returns('test-user-id'),
            isRoomEncrypted: sinon.stub().returns(true),
        });

        client = matrix.getClient();
        onMessageCallback = sinon.stub();
        sinon.stub(matrix, 'isCurrentClientJoinedInRoom').returns(true);
    });

    it('should not call the onMessageCallback when a new encrypted message is received for a different room', async () => {
        const event = {
            getRoomId: () => '!other:example.com',
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' }),
        };

        await matrix.onEncryptedMessage('!test:example.com', onMessageCallback);
        client.on.args[0][1](event);

        sinon.assert.notCalled(onMessageCallback);
    });
    it('should call the onMessageCallback when a new decrypted message is received for the specified room', async () => {
        const event = {
            getRoomId: () => '!test:example.com',
            getSender: () => 'other-user-id',
            getType: () => 'm.room.message',
            isDecryptionFailure: () => false,
            getContent: () => ({ body: 'Test message' }),
        };

        await matrix.onEncryptedMessage('!test:example.com', onMessageCallback);

        client.on.args[0][1](event);

        sinon.assert.calledOnce(onMessageCallback);
        sinon.assert.calledWith(onMessageCallback, 'Test message');
    });

    it('should not call the onMessageCallback when a decryption failure occurs for the specified room', async () => {
        const event = {
            getRoomId: () => '!test:example.com',
            getSender: () => 'other-user-id',
            getType: () => 'm.room.encrypted',
            isDecryptionFailure: () => true,
            getContent: () => ({ body: 'Test message' }),
        };

        await matrix.onEncryptedMessage('!test:example.com', onMessageCallback);

        try {
            client.on.args[0][1](event);
        } catch (error) {
            assert.strictEqual(error.message, 'Failed to decrypt message');
        }
        sinon.assert.notCalled(onMessageCallback);
    });
});

describe('runClient', () => {
    let client;

    beforeEach(() => {
        client = matrix.getClient();
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should throw an error if required properties are missing from the credentials object', async () => {
        const incompleteCredentials = {
            username: 'testUser',
            homeserverUrl: 'https://matrix.org'
        };

        await assert.rejects(
            matrix.runClient(incompleteCredentials),
            {
                message: 'Error: missing properties, needed properties: password'
            }
        );
    });
});

describe('isCurrentClientJoinedInRoom', () => {
    let client;
    beforeEach(() => {
       client = matrix.getClient();

    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should return true if the client is a member of the room', () => {
        const mockClient = {
            getUserId: sinon.stub().returns('@alice:matrix.org'),
            getRoom: sinon.stub().returns({
                getMember: sinon.stub().returns({ membership: 'join' }),
            }),
        };

        matrix.setClient(mockClient);

        const result = matrix.isCurrentClientJoinedInRoom('!room1:matrix.org');
        assert.strictEqual(result, true);
    });

    it('should return false if the client is not a member of the room', () => {
        const mockClient = {
            getUserId: sinon.stub().returns('@alice:matrix.org'),
            getRoom: sinon.stub().returns(null),
        };

        matrix.setClient(mockClient);

        const result = matrix.isCurrentClientJoinedInRoom('!room1:matrix.org');
        assert.strictEqual(result, false);
    });
});

describe('sendEncryptedMessage', () => {
    let client;
    let roomId;
    let message;

    beforeEach(() => {
        client = {
            getUserId: sinon.stub().returns('@testUser:example.com'),
            getRoom: sinon.stub(),
            isRoomEncrypted: sinon.stub(),
            sendEvent: sinon.stub().resolves(),
        };

        const room = {
            getMember: sinon.stub().returns({ membership: 'join' }),
        };

        client.getRoom = sinon.stub().returns(room);

        matrix.setClient(client);

        roomId = '!testRoom:example.com';
        message = { text: 'Hello, world!' };
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should call sendMessage when the room is encrypted', async () => {
        client.isRoomEncrypted.returns(true);
        sinon.spy(matrix, 'sendEncryptedMessage');

        await matrix.sendEncryptedMessage(roomId, message);

        sinon.assert.calledOnce(matrix.sendEncryptedMessage);
        sinon.assert.calledWith(matrix.sendEncryptedMessage, roomId, message);
    });

    it('should throw an error when the room is not encrypted', async () => {
        client.isRoomEncrypted.returns(false);

        try {
            await matrix.sendEncryptedMessage(roomId, message);
        } catch (error) {
            assert.strictEqual(error.message, 'Error sending message, room is not encrypted');
        }
    });
});

describe('getAllMemberUserIds', () => {
    let client;
    let roomId;

    beforeEach(() => {
        client = {
            getRoom: sinon.stub(),
        };

        const room = {
            getJoinedMembers: sinon.stub().returns([
                { userId: '@user1:example.com' },
                { userId: '@user2:example.com' },
                { userId: '@user3:example.com' },
            ]),
        };

        client.getRoom = sinon.stub().returns(room);

        matrix.setClient(client);

        roomId = '!testRoom:example.com';
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should return all member user ids in the room', () => {
        const expectedUserIds = [
            '@user1:example.com',
            '@user2:example.com',
            '@user3:example.com',
        ];

        const userIds = matrix.getAllMemberUserIds(roomId);

        assert.deepStrictEqual(userIds, expectedUserIds);
    });

    it('should throw an error when the room is not found', () => {
        client.getRoom = sinon.stub().returns(null);

        try {
            matrix.getAllMemberUserIds(roomId);
            throw new Error('Expected an error to be thrown');
        } catch (error) {
            assert.strictEqual(
                error.message,
                `Room with ID ${roomId} not found.`
            );
        }
    });
});

describe('getJoinedRoomsID', () => {
    let client;

    beforeEach(() => {
        client = {
            getJoinedRooms: sinon.stub(),
        };

        matrix.setClient(client);
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should return an array of joined room ids', async () => {
        const expectedJoinedRooms = [
            '!room1:example.com',
            '!room2:example.com',
            '!room3:example.com',
        ];

        client.getJoinedRooms.resolves({ joined_rooms: expectedJoinedRooms });

        const joinedRooms = await matrix.getJoinedRoomsID();

        assert.deepStrictEqual(joinedRooms, expectedJoinedRooms);
    });

    it('should throw an error when there is an issue getting joined rooms', async () => {
        const errorMessage = 'Error while trying to get rooms ID: ';
        client.getJoinedRooms.rejects(new Error('API error'));

        try {
            await matrix.getJoinedRoomsID();
            throw new Error('Expected an error to be thrown');
        } catch (error) {
            assert.strictEqual(error.message, errorMessage);
        }
    });
});





