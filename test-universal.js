const axios = require('axios');
const cheerio = require('cheerio');

async function testTrack(barcode) {
    try {
        console.log(`Testing barcode: ${barcode}`);
        // Test bepost.lk/p/Search (Universal COD, no captcha)
        const response = await axios.post('https://bepost.lk/p/Search/', `barcode=${barcode}`, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://bepost.lk',
                'Referer': 'https://bepost.lk/p/Search/',
                'Connection': 'keep-alive',
            },
            timeout: 15000
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const noDataText = $('body').text().toLowerCase();
        let error = null;
        if (noDataText.includes('no record found')) {
            error = 'no record found';
        } else if (noDataText.includes('invalid barcode')) {
            error = 'invalid barcode';
        }

        let foundTable = false;
        $('table tr').each((i, tbl) => { foundTable = true; });
        console.log(`Result: ${error || (foundTable ? 'Found Table Data!' : 'Unknown error')}`);
        if (foundTable) {
            console.log("Success! Data can be extracted.");
        }
        console.log('---');

    } catch (e) {
        console.error(e.message);
    }
}

async function run() {
    await testTrack('BD004902491LK'); // Works (COD)
    await testTrack('CP004902491LK'); // Works?
    await testTrack('RR123456789LK'); // Registered?
}

run();
