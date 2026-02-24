const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const response = await axios.post('https://bepost.lk/m/cal/', 'wht=500&payback=1000&Calculate=Calculate', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Referer': 'https://bepost.lk/m/cal/',
            }
        });
        console.log("Response length:", response.data.length);
        if (response.data.includes("reCAPTCHA")) {
            console.log("Recaptcha mentioned in response");
        }
        const $ = cheerio.load(response.data);
        console.log("Result text:", $('.alert-success, .alert-danger, .result').text().trim().substring(0, 200));
        console.log("Body text snippet:", $('body').text().replace(/\s+/g, ' ').substring(0, 500));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
