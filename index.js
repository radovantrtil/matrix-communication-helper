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