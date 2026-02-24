const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/track', async (req, res) => {
    const { barcode } = req.body;

    if (!barcode) {
        return res.status(400).json({ error: 'Barcode is required' });
    }

    try {
        const response = await axios.post('https://bepost.lk/p/Search/', `barcode=${barcode}`, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://bepost.lk',
                'Referer': 'https://bepost.lk/p/Search/',
                'Cache-Control': 'max-age=0',
                'Connection': 'keep-alive',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000 // Add a timeout just in case it hangs
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Analyze the structure of the HTML
        // Looking for tracking history or a "No results found" message

        // If there's an error message somewhere in the DOM
        const noDataText = $('body').text();
        if (noDataText.toLowerCase().includes('no record found') || noDataText.toLowerCase().includes('invalid barcode')) {
            return res.json({ success: true, tracking: [] });
        }

        // Try to parse the tracking table
        // We will need to adjust these selectors based on the actual SL Post HTML structure if we can find a valid tracking number.
        // For now, let's extract all tables.
        const trackingData = [];

        $('table tr').each((i, row) => {
            if (i === 0) return; // Skip header normally
            const columns = $(row).find('td');
            if (columns.length > 0) {
                const step = {};
                columns.each((j, col) => {
                    const text = $(col).text().trim();
                    step[`col_${j}`] = text;
                });
                trackingData.push(step);
            }
        });

        // Basic heuristic: if we couldn't find a table but also no explicit error, just return empty with a warning
        res.json({
            success: true,
            tracking: trackingData
        });

    } catch (error) {
        console.error('Error fetching from SL Post:', error.message);
        res.status(500).json({ error: 'Failed to fetch tracking data' });
    }
});

// --- COURIER TRACKING PROXY ---

// Step 1: Fetch Captcha Image & Session Cookie
app.get('/api/courier/captcha', async (req, res) => {
    try {
        const response = await axios.get('https://slpmail.slpost.gov.lk/track/captcha.php', {
            responseType: 'arraybuffer',
            httpsAgent: new (require('https')).Agent({ rejectUnauthorized: false }), // Add this to bypass SLP SSL issues
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': 'https://slpmail.slpost.gov.lk/track/',
                'Connection': 'keep-alive'
            },
            timeout: 10000
        });

        const cookie = response.headers['set-cookie'] ? response.headers['set-cookie'][0] : '';
        const base64Image = Buffer.from(response.data, 'binary').toString('base64');
        const imgSrc = `data:image/png;base64,${base64Image}`;

        res.json({ success: true, image: imgSrc, cookie: cookie });
    } catch (error) {
        console.error('Error fetching captcha:', error.message);
        res.status(500).json({ error: 'Failed to fetch secure captcha' });
    }
});

// Step 2: Submit Courier Tracking Request
app.post('/api/courier/track', async (req, res) => {
    const { barcode, captcha, cookie } = req.body;

    if (!barcode || !captcha || !cookie) {
        return res.status(400).json({ error: 'Barcode, Captcha, and Session Cookie are required' });
    }

    try {
        const params = new URLSearchParams();
        params.append('barcode', barcode);
        params.append('input', captcha);
        params.append('Submit', 'Search');

        const response = await axios.post('https://slpmail.slpost.gov.lk/track/index.php', params, {
            httpsAgent: new (require('https')).Agent({ rejectUnauthorized: false }), // Add this to bypass SLP SSL issues
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Origin': 'https://slpmail.slpost.gov.lk',
                'Referer': 'https://slpmail.slpost.gov.lk/track/',
                'Cookie': cookie, // Pass the session cookie from the captcha request
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);

        // Handle invalid captcha or incorrect tracking number
        const errorText = $('.alert-danger, .error, body').text().toLowerCase();
        if (response.data.includes('Invalid Code') || errorText.includes('invalid code') || errorText.includes('incorrect verification')) {
            return res.status(400).json({ error: 'Invalid CAPTCHA code. Please try again.' });
        }

        if (response.data.includes('No Record Found') || errorText.includes('no record found') || errorText.includes('no tracking information is available')) {
            return res.json({ success: true, tracking: [] });
        }

        const trackingData = [];

        // The courier tracker uses tables similarly. Let's extract any tables found.
        $('table tr').each((i, row) => {
            // Skip headers mostly, or any rows containing form elements (search box, captcha)
            if (i === 0 || $(row).find('input, select, button, form, img').length > 0) return;

            const columns = $(row).find('td');
            if (columns.length > 0) {
                const step = {};
                let fullRowText = '';

                columns.each((j, col) => {
                    const cellText = $(col).text().trim();
                    step[`col_${j}`] = cellText;
                    fullRowText += ' ' + cellText.toLowerCase();
                });

                // Check if this row is actually an SLP error message instead of real tracking data
                if (fullRowText.includes('enter the code') || fullRowText.includes('not match') || fullRowText.includes('invalid') || fullRowText.includes('validation code')) {
                    return; // skip this row
                }

                // If a row is entirely empty or just whitespace, skip it
                if (fullRowText.trim().length === 0) return;

                trackingData.push(step);
            }
        });

        if (trackingData.length === 0) {
            // If we parsed no valid tracking steps but didn't hit the specific 'No Record' text,
            // assume it's an invalid captcha/error state from SLP.
            return res.status(400).json({ error: 'Invalid CAPTCHA code or Tracking Number. Please try again.' });
        }

        res.json({
            success: true,
            tracking: trackingData
        });

    } catch (error) {
        console.error('Error tracking courier:', error.message);
        res.status(500).json({ error: 'Failed to complete courier tracking request' });
    }
});

// --- START SERVER ---
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

// Export for serverless environments (like Vercel)
module.exports = app;
