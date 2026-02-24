const axios = require('axios');

async function testCaptcha() {
    try {
        console.log("Fetching captcha...");
        const response = await axios.get('http://localhost:3000/api/courier/captcha', { timeout: 15000 });
        console.log(`Success: ${response.data.success}, Image Length: ${response.data.image ? response.data.image.length : 0}`);
        if (response.data.image && response.data.image.length > 50) {
            console.log("Image starts with: " + response.data.image.substring(0, 50));
        }
    } catch (e) {
        console.error("Error calling local API:");
        if (e.response) {
            console.error(e.response.status, e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

testCaptcha();
