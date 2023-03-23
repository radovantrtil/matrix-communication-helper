const Matrix = require('matrix-js-sdk');

async function getCredentialsWithPassword(username, password) {
    const _credentials = await Matrix.createClient({baseUrl: "https://matrix.org"}).loginWithPassword(
        username,
        password
    );
    return {
        accessToken: _credentials.access_token,
        userId: _credentials.user_id,
        deviceId: _credentials.device_id,
    };
}

module.exports = {
    getCredentialsWithPassword,
}
