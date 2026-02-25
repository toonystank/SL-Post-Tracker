const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://postage.lk';
const DELAY_MS = 400;
const OUTPUT_FILE = path.join(__dirname, 'public', 'post-offices.json');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractPageData(html) {
    const $ = cheerio.load(html);
    const dataPage = $('[id="app"]').attr('data-page');
    if (!dataPage) return null;
    try {
        return JSON.parse(dataPage);
    } catch (e) {
        return null;
    }
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
                timeout: 15000
            });
            return data;
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`  Retry ${i + 1}/${retries} for ${url}`);
            await sleep(1000);
        }
    }
}

async function main() {
    console.log('=== SL Post Office Data Scraper ===\n');
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let allOffices = [];

    // Check if index already exists to resume
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            allOffices = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Loaded ${allOffices.length} offices from existing ${OUTPUT_FILE}`);

            // Deduplicate retroactive index
            const unique = [];
            for (const o of allOffices) {
                if (!unique.find(existing => existing.id === o.id)) {
                    unique.push(o);
                }
            }
            if (unique.length < allOffices.length) {
                console.log(`Deduplicated index from ${allOffices.length} to ${unique.length} unique offices`);
                allOffices = unique;
            }
        } catch (e) { }
    }

    if (allOffices.length === 0) {
        // Step 1: Collect basic info from A-Z listing pages
        console.log('Step 1: Fetching office listings A-Z (handling pagination)...\n');
        for (const letter of letters) {
            let currentPage = 1;
            let lastPage = 1;

            while (currentPage <= lastPage) {
                const url = `${BASE_URL}/locations-all?q=${letter}&page=${currentPage}`;
                console.log(`  [${letter}] Fetching page ${currentPage}/${lastPage || '?'}`);
                try {
                    const html = await fetchWithRetry(url);
                    const pageData = extractPageData(html);

                    if (pageData && pageData.props && pageData.props.offices) {
                        // Update last page from the response
                        if (pageData.props.offices.meta && pageData.props.offices.meta.last_page) {
                            lastPage = pageData.props.offices.meta.last_page;
                        }

                        if (pageData.props.offices.data) {
                            const offices = pageData.props.offices.data;
                            for (const o of offices) {
                                // Deduplicate by ID
                                if (!allOffices.find(existing => existing.id === o.id)) {
                                    allOffices.push({
                                        id: o.id,
                                        name: (o.name || '').trim(),
                                        type: o.type || '',
                                        division: o.division || '',
                                        postcode: o.po_code || '',
                                        shortCode: o.short_code || '',
                                        grade: o.grade || '',
                                        slug: o.key || '',
                                        // Detail fields (populated in step 2)
                                        fetchedDetails: false,
                                        delivery: '',
                                        phone: '',
                                        fax: '',
                                        dpmgDivision: '',
                                        dsDivision: '',
                                        controllingOffice: '',
                                        numberOfSPOs: null
                                    });
                                }
                            }
                            console.log(`  [${letter} pg ${currentPage}] Unique offices so far: ${allOffices.length}`);
                        }
                    } else {
                        console.log(`  [${letter} pg ${currentPage}] No offices data found`);
                        break;
                    }
                } catch (err) {
                    console.error(`  [${letter} pg ${currentPage}] Error:`, err.message);
                    break;
                }
                currentPage++;
                await sleep(DELAY_MS);
            }
        }

        // Save the index immediately
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allOffices, null, 2));
        console.log(`\nSaved index of ${allOffices.length} distinct offices to ${OUTPUT_FILE}`);
    } else {
        console.log(`\nSkipping Step 1 - found existing index with ${allOffices.length} offices.`);
    }

    console.log(`\nTotal unique offices: ${allOffices.length}`);
    console.log('\nStep 2: Fetching detail pages for phone/fax/delivery...\n');

    // Step 2: Fetch each office's detail page (resume if fetchedDetails is false)
    let count = 0;
    let fetchedThisRun = 0;
    let failed = 0;

    for (const office of allOffices) {
        count++;
        if (office.fetchedDetails) continue; // Skip already fetched

        const slug = office.slug || `${office.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${office.id}`;
        const url = `${BASE_URL}/location/${slug}`;

        try {
            const html = await fetchWithRetry(url);
            const pageData = extractPageData(html);

            if (pageData && pageData.props && pageData.props.po) {
                const po = pageData.props.po;
                office.delivery = po.delivery || '';
                office.phone = po.phone || '';
                office.fax = po.fax || '';
                office.dpmgDivision = (po.col1 && po.col1['DPMG division']) || '';
                office.dsDivision = (po.col1 && po.col1['DS division']) || '';
                office.controllingOffice = (po.col1 && po.col1['Controlling office']) || '';
                office.numberOfSPOs = (po.col2 && po.col2['Number of SPOs']) || null;

                if (po.code) office.postcode = po.code;
                if (po.short_code) office.shortCode = po.short_code;
                if (po.grade) office.grade = po.grade;
                if (po.type) office.type = po.type;

                office.fetchedDetails = true;
                fetchedThisRun++;
            } else {
                failed++;
            }
        } catch (err) {
            console.error(`  [${count}/${allOffices.length}] Error for ${office.name}: ${err.message}`);
            failed++;
        }

        if (fetchedThisRun > 0 && fetchedThisRun % 20 === 0) {
            console.log(`  Progress: ${count}/${allOffices.length} (Fetched ${fetchedThisRun} this run, ${failed} failed)`);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allOffices, null, 2));
        }

        await sleep(DELAY_MS);
    }

    // Final clean save (remove internal fetchedDetails tracking flag but keep slug for potential future use)
    const cleanData = allOffices.map(({ fetchedDetails, ...rest }) => rest);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleanData, null, 2));

    console.log(`\n✅ Done! Saved complete data for ${cleanData.length} offices to ${OUTPUT_FILE}`);
    console.log(`   Failed detail fetches: ${failed}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
