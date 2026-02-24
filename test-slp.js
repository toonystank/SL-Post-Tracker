const axios = require('axios');
const https = require('https');

async function testSLP() {
    try {
        console.log("Fetching SLP captcha direct...");
        const agent = new https.Agent({
            rejectUnauthorized: false
        });
        const response = await axios.get('https://slpmail.slpost.gov.lk/track/cap/index.php', {
            responseType: 'arraybuffer',
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
            timeout: 10000
        });
        console.log("Status:", response.status);
        console.log("Buffer Length:", response.data.length);
        const cookie = response.headers['set-cookie'] ? response.headers['set-cookie'][0] : 'no cookie';
        console.log("Cookie:", cookie);
    } catch (e) {
        if (e.response) {
            console.error("HTTP Error", e.response.status, e.message);
        } else {
            console.error(e.message);
        }
    }
}

testSLP();
