document.addEventListener('DOMContentLoaded', () => {
    // --- TRANSLATION LOGIC ---
    let currentLang = localStorage.getItem('slpost_lang') || 'en';

    function translatePage(lang) {
        if (typeof translations === 'undefined' || !translations[lang]) return;
        currentLang = lang;
        localStorage.setItem('slpost_lang', lang);

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.innerHTML = translations[lang][key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });
    }

    // Initialize translations
    translatePage(currentLang);
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            translatePage(e.target.getAttribute('data-lang'));
        });
    });


    // --- CALCULATORS iframe SWITCHER ---
    const calcBtns = document.querySelectorAll('.calc-btn');
    const calcIframe = document.getElementById('calc-iframe');

    if (calcBtns.length > 0) {
        calcBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                calcBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                calcIframe.src = btn.getAttribute('data-src');
            });
        });
    }

    // --- UNIFIED TRACKING LOGIC ---
    const trackForm = document.getElementById('track-form');
    const trackBtn = document.getElementById('track-btn');
    const barcodeInput = document.getElementById('barcode');
    const errorMessage = document.getElementById('error-message');
    const multiResultsSection = document.getElementById('multi-results-section');

    // Captcha elements
    const captchaContainer = document.getElementById('dynamic-captcha-container');
    const captchaInput = document.getElementById('courier-captcha');
    const captchaImg = document.getElementById('captcha-img');
    const captchaLoader = document.getElementById('captcha-loader');
    const refreshCaptchaBtn = document.getElementById('refresh-captcha');

    let currentSessionCookie = '';
    let captchaLoaded = false;
    let needsCaptcha = false;

    // Standard UPU 13-char format for Registered(R), Parcel(C), EMS(E), Value(V)
    function isCourier(barcode) {
        return /^[RCEV][A-Z]\d{9}[A-Z]{2}$/i.test(barcode.trim());
    }

    // Auto-detect Couriers on Input
    if (barcodeInput) {
        barcodeInput.addEventListener('input', () => {
            const barcodes = barcodeInput.value.split(',').map(b => b.trim()).filter(b => b !== '');
            needsCaptcha = barcodes.some(b => isCourier(b));

            if (needsCaptcha) {
                captchaContainer.classList.remove('hidden');
                captchaInput.required = true;
                if (!captchaLoaded) {
                    loadCaptcha();
                }
            } else {
                captchaContainer.classList.add('hidden');
                captchaInput.required = false;
            }
        });
    }

    async function loadCaptcha() {
        if (!captchaLoader) return;
        captchaLoader.classList.remove('hidden');
        captchaImg.classList.add('hidden');
        captchaInput.value = '';
        captchaLoaded = true; // Set true immediately to prevent double fetching

        try {
            const res = await fetch('/api/courier/captcha');
            const data = await res.json();
            if (data.success) {
                captchaImg.src = data.image;
                currentSessionCookie = data.cookie;
                captchaImg.classList.remove('hidden');
            }
        } catch (e) {
            console.error('Failed to load captcha', e);
            captchaLoaded = false;
        } finally {
            captchaLoader.classList.add('hidden');
        }
    }

    if (refreshCaptchaBtn) {
        refreshCaptchaBtn.addEventListener('click', loadCaptcha);
    }

    // Form Submit
    if (trackForm) {
        trackForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const inputValue = barcodeInput.value.trim();
            if (!inputValue) return;

            // Reset UI state
            errorMessage.classList.add('hidden');
            multiResultsSection.innerHTML = '';
            multiResultsSection.classList.add('hidden');

            const barcodes = inputValue.split(',').map(b => b.trim()).filter(b => b !== '');
            const captchaStr = captchaInput ? captchaInput.value.trim() : '';

            trackBtn.classList.add('loading');
            trackBtn.disabled = true;

            try {
                // Process concurrently
                const promises = barcodes.map(barcode => {
                    if (isCourier(barcode)) {
                        return trackCourier(barcode, captchaStr);
                    } else {
                        return trackCOD(barcode);
                    }
                });

                const results = await Promise.all(promises);

                let hasCaptchaError = false;

                results.forEach(result => {
                    const cardHtml = generateTrackingCard(result.barcode, result.data, result.error);
                    multiResultsSection.insertAdjacentHTML('beforeend', cardHtml);
                    if (result.error && result.error.toLowerCase().includes('captcha')) {
                        hasCaptchaError = true;
                    }
                });

                multiResultsSection.classList.remove('hidden');

                // If any courier failed due to captcha, reload it
                if (hasCaptchaError) {
                    loadCaptcha();
                }

            } catch (error) {
                errorMessage.textContent = "An overall error occurred. Please try again.";
                errorMessage.classList.remove('hidden');
            } finally {
                trackBtn.classList.remove('loading');
                trackBtn.disabled = false;
            }
        });
    }

    async function trackCOD(barcode) {
        try {
            const response = await fetch('/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed');
            return { barcode, data: data.tracking, error: null };
        } catch (err) {
            return { barcode, data: null, error: err.message };
        }
    }

    async function trackCourier(barcode, captcha) {
        try {
            const response = await fetch('/api/courier/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode, captcha, cookie: currentSessionCookie })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to track courier');
            return { barcode, data: data.tracking, error: null };
        } catch (err) {
            return { barcode, data: null, error: err.message };
        }
    }

    function generateTrackingCard(barcode, events, error) {
        if (error) {
            return `<div class="tracking-card">
                        <div class="results-header"><div><h2>${barcode.toUpperCase()}</h2><p class="status-badge error">Error</p></div></div>
                        <div class="error-message">${error}</div>
                    </div>`;
        }

        if (!events || events.length === 0) {
            return `<div class="tracking-card">
                        <div class="results-header"><div><h2>${barcode.toUpperCase()}</h2><p class="status-badge error">No Record Found</p></div></div>
                        <div class="timeline"><div class="timeline-item"><div class="timeline-content"><div class="timeline-title">No tracking information found.</div></div></div></div>
                    </div>`;
        }

        // Determine if this is a COD key-value format (usually 2 columns, first column ends up as keys)
        let isKeyValueFormat = events.length > 0 && Object.keys(events[0]).length <= 2 && events.some(e => e.col_0 && e.col_0.toLowerCase().includes('status'));

        let statusText = "In Transit";
        let statusClass = "transit";
        let resolvedBarcode = barcode.toUpperCase();
        let timelineHtml = '';

        if (isKeyValueFormat) {
            // It's a Key-Value list (COD format)
            const dataMap = {};
            events.forEach(e => {
                const key = (e.col_0 || '').trim();
                const val = (e.col_1 || '').trim();
                if (key) dataMap[key.toLowerCase()] = val;
            });

            if (dataMap['status']) {
                statusText = dataMap['status'];
            }
            if (dataMap['barcode']) {
                resolvedBarcode = dataMap['barcode'];
            }

            // Generate a neat grid instead of a timeline
            let gridItems = '';

            const keyMap = {
                'acceptingpo': 'Accepting Post Office',
                'dateaccepted': 'Date Accepted',
                'deliverypo': 'Delivery Post Office',
                'receiveddate': 'Received Date',
                'posettled': 'Post Office Settled',
                'settleddate': 'Settled Date'
            };

            function formatKey(key) {
                const lowerKey = key.toLowerCase();
                if (keyMap[lowerKey]) return keyMap[lowerKey];

                // Fallback: split CamelCase and replace PO
                return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\bPO\b/g, 'Post Office');
            }

            function formatValue(val) {
                if (!val) return val;
                // Replace PO with Post Office, ensuring it matches exactly "PO Kandy" or cases where PO is a standalone word
                return val.replace(/\bPO\b/g, 'Post Office');
            }

            events.forEach(e => {
                const key = (e.col_0 || '').trim();
                const val = (e.col_1 || '').trim();
                if (key && key.toLowerCase() !== 'barcode' && key.toLowerCase() !== 'status') {
                    gridItems += `<div class="info-group">
                        <span class="info-label">${formatKey(key)}</span>
                        <span class="info-value">${formatValue(val) || '-'}</span>
                    </div>`;
                }
            });
            timelineHtml = `<div class="info-grid">${gridItems}</div>`;

        } else {
            // It's a chronological timeline (Courier format)
            const allText = JSON.stringify(events).toLowerCase();
            if (allText.includes('delivered') || allText.includes('successful delivery')) {
                statusText = "Delivered";
            } else if (allText.includes('returned') || allText.includes('return to sender')) {
                statusText = "Returned";
            }

            timelineHtml = events.map((event, index) => {
                const vals = Object.values(event).filter(v => v);
                if (vals.length === 0) return '';

                let dateStr = vals[0] || 'Unknown Date';
                let titleStr = vals[vals.length - 1] || 'Status Update';
                let descStr = vals.slice(1, -1).join(' - ');

                if (vals.length >= 3) {
                    dateStr = `${vals[0]} ${vals[1] || ''}`.trim();
                    titleStr = vals[vals.length - 1];
                    descStr = vals[vals.length - 2];
                }

                const activeClass = index === 0 ? 'active' : '';
                return `
                    <div class="timeline-item ${activeClass}">
                        <div class="timeline-date">${dateStr}</div>
                        <div class="timeline-content">
                            <div class="timeline-title">${titleStr}</div>
                            ${descStr ? `<div class="timeline-desc">${descStr}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            timelineHtml = `<div class="timeline">${timelineHtml}</div>`;
        }

        // Assign styling classes dynamically based on the final status string
        const slStatus = statusText.toLowerCase();
        if (slStatus.includes('delivered') || slStatus.includes('settled') || slStatus.includes('success')) {
            statusClass = "success";
        } else if (slStatus.includes('returned') || slStatus.includes('error') || slStatus.includes('fail') || slStatus.includes('not')) {
            statusClass = "error";
        }

        return `
            <div class="tracking-card">
                <div class="results-header">
                    <div>
                        <h2>${resolvedBarcode}</h2>
                        <p class="status-badge ${statusClass}">${statusText}</p>
                    </div>
                </div>
                ${timelineHtml}
            </div>
        `;
    }
});
