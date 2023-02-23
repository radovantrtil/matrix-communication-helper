const olm = require('olm');

const senderDevice = new olm.Session();
const senderIdentity = new olm.Account();
senderIdentity.create();

// Alice's device generates a new outbound session key and message key
senderDevice.create_outbound(senderIdentity, 'RECIPIENT_DEVICE_KEY');

// Prepare the message to be sent
const plaintext = 'This is my secret message';

// Encrypt the message using the outbound session key and message key
const ciphertext = senderDevice.encrypt(plaintext);

console.log(`Original message: ${plaintext}`);
console.log(`Encrypted message: ${ciphertext}`);


olm.init();
const alice = new olm.Account();
const bob = new olm.Account();
alice.create();
bob.create();
bob.generate_one_time_keys(1);

const bobs_id_keys = JSON.parse(bob.identity_keys());
const bobs_id_key = bobs_id_keys.curve25519;
const bobs_ot_keys = JSON.parse(bob.one_time_keys());
for (key in bobs_ot_keys.curve25519) {
    var bobs_ot_key = bobs_ot_keys.curve25519[key];
}

alice_session = new Olm.Session();
alice_session.create_outbound(alice, bobs_id_key, bobs_ot_key);
alice_message = a_session.encrypt("Hello");

bob_session.create_inbound(bob, bob_message);
const plaintext = bob_session.decrypt(message_1.type, bob_message);
bob.remove_one_time_keys(bob_session);
