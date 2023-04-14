const assert = require('assert');
const matrix = require('../index.js');
const sinon = require('sinon');

describe('inviteUser and getMyPowerLevel', () => {
    let client;
    let roomId;
    let userId;

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
        it('should return an error message when the client does not have permission to invite users', async () => {
            client.getStateEvent.returns({ invite: 50 }); // Set the required invite power level to 50
            client.roomInitialSync.resolves();

            const result = await matrix.inviteUser(roomId, userId);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.message, "You don't have permission to invite users");

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
                    type: 'm.room.guest_access',
                    state_key: '',
                    content: {
                        guest_access: 'can_join',
                    },
                },
                {
                    type: 'm.room.encryption',
                    state_key: '',
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
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should send message to room', async () => {
        const mockClient = {
            sendEvent: sinon.stub(),
        };

        matrix.setClient(mockClient);

        const message = { text: 'Hello, world!' };
        const roomId = '!room1:matrix.org';

        await matrix.sendMessage(message, roomId);

        assert(mockClient.sendEvent.calledOnceWith(roomId, 'm.room.message', { body: JSON.stringify(message), msgtype: 'm.text' }, ''));
    });
});

describe('getMessage', () => {
    let client;
    let onCallback;

    beforeEach(() => {
        client = {
            on: sinon.stub()
        };

        client.on.callsFake((event, callback) => {
            onCallback = callback;
        });

        matrix.setClient(client);
    });

    it('should return a message when a new message is received', async () => {
        const messagePromise = matrix.getMessage();

        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' })
        };

        onCallback(event, {}, false);

        const result = await messagePromise;
        assert.strictEqual(result, event.getContent().body);
    });
});

describe('getJoinedRoomsID', () => {
    let client;

    beforeEach(() => {
        client = matrix.getClient();
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should return joined rooms', async () => {
        const mockClient = {
            getJoinedRooms: sinon.stub().resolves({ joined_rooms: ['!room1:matrix.org', '!room2:matrix.org'] }),
        };

        matrix.setClient(mockClient);

        const result = await matrix.getJoinedRoomsID();
            assert.deepStrictEqual(result, ['!room1:matrix.org', '!room2:matrix.org']);
    });
});

describe('messageListener', () => {
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
        sinon.stub(matrix, 'currentClientJoinedInRoom').returns(true);
    });

    it('should call the onMessageCallback when a new message is received for the correct room', () => {
        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' }),
            getRoomId: () => '!test:example.com',
        };
        const room = { roomId: '!test:example.com' };

        matrix.messageListener(onMessageCallback, room.roomId, client);

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

        matrix.messageListener(onMessageCallback, room.roomId, client);

        client.on.args[0][1](event, room, false);

        sinon.assert.notCalled(onMessageCallback);
    });

    it('should not call the onMessageCallback for non-message events', () => {
        const event = {
            getType: () => 'm.room.topic',
            getRoomId: () => '!test:example.com',
        };
        const room = { roomId: '!test:example.com' };

        matrix.messageListener(onMessageCallback, room.roomId, client);

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

        matrix.messageListener(onMessageCallback, room.roomId, client);

        client.on.args[0][1](event, room, true);

        sinon.assert.notCalled(onMessageCallback);
    });
});

describe('messageListenerEncrypted', () => {
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
        sinon.stub(matrix, 'currentClientJoinedInRoom').returns(true);
    });

    it('should call setRoomEncryption and on with correct arguments', async () => {
        const roomId = 'some-room-id';

        await matrix.messageListenerEncrypted(onMessageCallback, roomId);

        assert(client.setRoomEncryption.calledOnce);
        assert(client.setRoomEncryption.calledWith(roomId, {
            algorithm: "m.megolm.v1.aes-sha2",
        }));
        assert(client.on.calledOnce);
        assert(client.on.calledWith('Event.decrypted', sinon.match.func));
    });

    it('should not call the onMessageCallback when a new encrypted message is received for a different room', async () => {
        const event = {
            getRoomId: () => '!other:example.com',
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' }),
        };

        await matrix.messageListenerEncrypted(onMessageCallback, '!test:example.com');

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

        await matrix.messageListenerEncrypted(onMessageCallback, '!test:example.com');

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

        await matrix.messageListenerEncrypted(onMessageCallback, '!test:example.com');

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
            matrix.runClient(null, incompleteCredentials),
            {
                message: 'Error: missing properties, needed properties: password'
            }
        );
    });
});


describe('currentClientJoinedInRoom', () => {
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

        const result = matrix.currentClientJoinedInRoom('!room1:matrix.org');
        assert.strictEqual(result, true);
    });

    it('should return false if the client is not a member of the room', () => {
        const mockClient = {
            getUserId: sinon.stub().returns('@alice:matrix.org'),
            getRoom: sinon.stub().returns(null),
        };

        matrix.setClient(mockClient);

        const result = matrix.currentClientJoinedInRoom('!room1:matrix.org');
        assert.strictEqual(result, false);
    });
});

describe('sendEncryptedMessage', () => {
    let client;

    beforeEach(() => {
        client = matrix.getClient();
    });

    afterEach(() => {
        matrix.setClient(client);
    });

    it('should return an error if the client is not a member of the room', async () => {
        const mockClient = {
            getUserId: sinon.stub().returns('@alice:matrix.org'),
            getRoom: sinon.stub().returns(null),
        };

        matrix.setClient(mockClient);

        const result = await matrix.sendEncryptedMessage('!room1:matrix.org', 'Hello, world!');
        assert.deepStrictEqual(result, { success: false, message: 'Client is not member of the room !room1:matrix.org' });
    });

    it('should send an encrypted message if the client is a member of the room', async () => {
        const mockClient = {
            getUserId: sinon.stub().returns('@alice:matrix.org'),
            getRoom: sinon.stub().returns({
                getMember: sinon.stub().returns({ membership: 'join' }),
            }),
            setRoomEncryption: sinon.stub().resolves(),
            sendEvent: sinon.stub().resolves(),
        };

        matrix.setClient(mockClient);

        const result = await matrix.sendEncryptedMessage('!room1:matrix.org', 'Hello, world!');
        assert.deepStrictEqual(result, { success: true, message: 'Encrypted message sent successfully.' });
    });

    it('should return an error if there is a problem sending the encrypted message', async () => {
        const mockClient = {
            getUserId: sinon.stub().returns('@alice:matrix.org'),
            getRoom: sinon.stub().returns({
                getMember: sinon.stub().returns({ membership: 'join' }),
            }),
            setRoomEncryption: sinon.stub().resolves(),
            sendEvent: sinon.stub().rejects(new Error('Network error')),
        };

        matrix.setClient(mockClient);

        const result = await matrix.sendEncryptedMessage('!room1:matrix.org', 'Hello, world!');
        assert.deepStrictEqual(result, { success: false, message: 'Error sending encrypted message: Network error' });
    });
});