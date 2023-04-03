const Matrix = require('matrix-js-sdk');

async function getCredentialsWithPassword(username, password) {
    const credentials = await Matrix.createClient({baseUrl: "https://matrix.org"}).loginWithPassword(
        username,
        password
    );
    return {
        accessToken: credentials.access_token,
        userId: credentials.user_id,
        deviceId: credentials.device_id,
    };
}

module.exports = {
    getCredentialsWithPassword
}
