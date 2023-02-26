const Olm = require("@matrix-org/olm");

Olm.init({locateFile: () => "node_modules/@matrix-org/olm/olm.wasm"})
    .then(succ =>{
            console.log(`Olm init succ`,succ);

            let alice = new Olm.Account();
            let bob = new Olm.Account();

            const bob_message = {
                body: "Ahoj lidi!",
                msgtype: "m.text"
            };

            alice.create();
            bob.create();
            bob.generate_one_time_keys(1);

            const bobs_id_keys = JSON.parse(bob.identity_keys());
            const bobs_id_key = bobs_id_keys.curve25519;
            let bobs_ot_keys = JSON.parse(bob.one_time_keys());
            for (let key in bobs_ot_keys.curve25519) {
                var bobs_ot_key = bobs_ot_keys.curve25519[key];
            }

            let alice_session = new Olm.Session();
            alice_session.create_outbound(alice, bobs_id_key, bobs_ot_key);
            const alice_message = alice_session.encrypt("Hello");

            let bob_session = new Olm.Session();
            bob_session.create_inbound(bob,bobs_ot_keys);
            const plaintext = bob_session.decrypt(0, alice_message);
            bob.remove_one_time_keys(bob_session);
        })
    .catch(err => console.error(`Failed to init`, err));

