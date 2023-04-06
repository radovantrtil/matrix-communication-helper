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

            // Call the getMyPowerLevel function
            const powerLevel = await matrix.getMyPowerLevel(roomId);

            // Check if the returned power level is correct
            assert.strictEqual(powerLevel, 50);
        });
    });

    describe('inviteUser', () => {
        it('should throw an error if the client does not have permission to invite users', async () => {
            // Set up stubs for power level state event and getMyPowerLevel function
            client.getStateEvent.returns(Promise.resolve({ invite: 100 }));
            sinon.stub(matrix, 'getMyPowerLevel').returns(Promise.resolve(50));

            // Call the inviteUser function and expect an error to be thrown
            await assert.rejects(
                matrix.inviteUser(roomId, userId),
                {
                    message: 'Error: You dont have permission to invite users'
                }
            );

            // Restore the getMyPowerLevel stub
            matrix.getMyPowerLevel.restore();
        });

        // Add more test cases for the inviteUser function here
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

describe('sendEncryptedMessage', () => {
    // TODO tests for sendEncryptedMessage method....
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
        matrix.setClient(client);
    });

    beforeEach(() => {
        client = matrix.getClient();

        matrix.setClient({
            on: sinon.stub()
        });

        client = matrix.getClient();

        onMessageCallback = sinon.stub();
    });

    it('should call the onMessageCallback when a new message is received for the correct room', () => {
        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' })
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
            getContent: () => ({ body: 'Test message' })
        };
        const room = { roomId: '!other:example.com' };

        matrix.messageListener(onMessageCallback, '!test:example.com', client);

        client.on.args[0][1](event, room, false);

        sinon.assert.notCalled(onMessageCallback);
    });

    it('should not call the onMessageCallback for non-message events', () => {
        const event = {
            getType: () => 'm.room.topic'
        };
        const room = { roomId: '!test:example.com' };

        matrix.messageListener(onMessageCallback, room.roomId, client);

        client.on.args[0][1](event, room, false);

        sinon.assert.notCalled(onMessageCallback);
    });

    it('should not call the onMessageCallback for paginated results', () => {
        const event = {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Test message' })
        };
        const room = { roomId: '!test:example.com' };

        matrix.messageListener(onMessageCallback, room.roomId, client);

        client.on.args[0][1](event, room, true);

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
