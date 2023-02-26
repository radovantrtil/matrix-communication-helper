const Olm = require("@matrix-org/olm");

Olm.init({locateFile: () => "node_modules/@matrix-org/olm/olm.wasm"})
    .then(succ =>{
        console.log(`Olm init succ`,succ);

        const bob_message = {
                body: "Ahoj lidi!",
                msgtype: "m.text"
        };

        const outbound_session = new Olm.OutboundGroupSession();
        outbound_session.create();

        // exchange these over a secure channel
        const session_id = outbound_session.session_id();
        const session_key = outbound_session.session_key();
        const message_index = outbound_session.message_index();

        let inbound_session = new Olm.InboundGroupSession();
        inbound_session.create(session_key)



        const ciphertext = outbound_session.encrypt(JSON.stringify(bob_message));
        console.log(ciphertext);
        const plaintext = inbound_session.decrypt(ciphertext);
        console.log(plaintext);
    } )
    .catch(err => console.error(`Failed to init`, err));





