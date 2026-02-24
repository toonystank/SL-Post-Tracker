const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

async function scrapeSLP() {
    try {
        console.log("Fetching SLP track page...");
        const agent = new https.Agent({ rejectUnauthorized: false });
        const res = await axios.get('https://slpmail.slpost.gov.lk/track/', {
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const $ = cheerio.load(res.data);
        const imgs = [];
        $('img').each((i, img) => imgs.push($(img).attr('src')));

        console.log("Found images:", imgs);

        const forms = [];
        $('form').each((i, form) => forms.push($(form).attr('action')));
        console.log("Forms action:", forms);

        console.log("HTML Sample:", res.data.substring(0, 500));

    } catch (e) {
        console.error(e.message);
    }
}

scrapeSLP();
