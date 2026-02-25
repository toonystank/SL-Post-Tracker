document.addEventListener('DOMContentLoaded', () => {
    // --- TRANSLATION LOGIC ---
    let currentLang = localStorage.getItem('slpost_lang') || 'en';

    // Escape HTML to prevent XSS from user-supplied values
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    function t(key, fallback) {
        if (typeof translations !== 'undefined' && translations[currentLang] && translations[currentLang][key]) {
            return translations[currentLang][key];
        }
        return fallback || key;
    }

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

    // --- THEME TOGGLE (Light/Dark) ---
    const savedTheme = localStorage.getItem('slpost_theme') ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('slpost_theme', next);
        });
    }

    // --- CALCULATORS iframe SWITCHER (lazy-loaded) ---
    const calcBtns = document.querySelectorAll('.calc-btn');
    const calcIframe = document.getElementById('calc-iframe');
    let iframeLoaded = false;

    function loadIframe(src) {
        if (calcIframe) {
            calcIframe.src = src || calcIframe.dataset.src || 'https://bepost.lk/m/cal/';
            iframeLoaded = true;
        }
    }

    // Lazy-load iframe when it scrolls into view
    if (calcIframe && 'IntersectionObserver' in window) {
        const iframeObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !iframeLoaded) {
                loadIframe();
                iframeObserver.disconnect();
            }
        }, { rootMargin: '200px' });
        iframeObserver.observe(calcIframe);
    }

    if (calcBtns.length > 0) {
        calcBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                calcBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadIframe(btn.getAttribute('data-src'));
            });
        });
    }

    // --- UNIFIED TRACKING LOGIC ---
    const trackForm = document.getElementById('track-form');
    const trackBtn = document.getElementById('track-btn');
    const barcodeInput = document.getElementById('barcode');
    const errorMessage = document.getElementById('error-message');
    const multiResultsSection = document.getElementById('multi-results-section');

    // --- BARCODE SCANNER LOGIC ---
    const scanBtn = document.getElementById('scan-btn');
    const scannerModal = document.getElementById('scanner-modal');
    const closeScannerBtn = document.getElementById('close-scanner');
    let html5QrcodeScanner = null;

    if (scanBtn && scannerModal) {
        scanBtn.addEventListener('click', () => {
            scannerModal.classList.remove('hidden');

            if (!html5QrcodeScanner) {
                // Initialize scanner
                html5QrcodeScanner = new Html5QrcodeScanner(
                    "reader",
                    { fps: 10, qrbox: { width: 250, height: 100 } },
                    /* verbose= */ false
                );
            }

            html5QrcodeScanner.render((decodedText) => {
                // On success
                html5QrcodeScanner.clear();
                scannerModal.classList.add('hidden');

                // Auto-comma logic
                const currentVal = barcodeInput.value.trim();
                if (currentVal) {
                    if (currentVal.endsWith(',')) {
                        barcodeInput.value = currentVal + ' ' + decodedText + ', ';
                    } else {
                        barcodeInput.value = currentVal + ', ' + decodedText + ', ';
                    }
                } else {
                    barcodeInput.value = decodedText + ', ';
                }

                // Trigger input event to update captcha visibility
                barcodeInput.dispatchEvent(new Event('input', { bubbles: true }));
            }, (error) => {
                // Ignore errors (usually just "not found yet")
            });
        });

        closeScannerBtn.addEventListener('click', () => {
            if (html5QrcodeScanner) {
                try { html5QrcodeScanner.clear(); } catch (e) { }
            }
            scannerModal.classList.add('hidden');
        });
    }

    // Captcha elements
    const captchaContainer = document.getElementById('dynamic-captcha-container');
    const captchaInput = document.getElementById('courier-captcha');
    const captchaImg = document.getElementById('captcha-img');
    const captchaLoader = document.getElementById('captcha-loader');
    const refreshCaptchaBtn = document.getElementById('refresh-captcha');

    const historyContainer = document.getElementById('tracking-history-container');
    const historyCardsContainer = document.getElementById('history-cards');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // --- TRACKING HISTORY LOGIC ---
    let trackingHistory = [];
    try {
        trackingHistory = JSON.parse(localStorage.getItem('slpost_tracking_history') || '[]');
    } catch {
        trackingHistory = [];
    }

    function renderHistory() {
        if (!historyContainer || !historyCardsContainer) return;

        if (trackingHistory.length === 0) {
            historyContainer.classList.add('hidden');
            return;
        }

        historyContainer.classList.remove('hidden');
        historyCardsContainer.innerHTML = '';

        trackingHistory.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';

            // Re-search on click
            card.addEventListener('click', () => {
                barcodeInput.value = item.barcode;
                barcodeInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    if (trackForm) trackForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }, 100);
            });

            // Determine status color class
            let statusClass = 'transit';
            const statusLower = (item.statusText || '').toLowerCase();
            if (statusLower.includes('deliver') || statusLower.includes('success') || statusLower.includes('settled')) statusClass = 'success';
            else if (statusLower.includes('return') || statusLower.includes('fail') || statusLower.includes('error')) statusClass = 'error';

            // Format relative time
            const timeDiff = Date.now() - item.lastChecked;
            const diffMins = Math.floor(timeDiff / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);
            let timeStr = 'Just now';
            if (diffDays > 0) timeStr = `${diffDays}d ago`;
            else if (diffHours > 0) timeStr = `${diffHours}h ago`;
            else if (diffMins > 0) timeStr = `${diffMins}m ago`;

            card.innerHTML = `
                <div class="history-card-header">
                    <span class="history-barcode">${escapeHtml(item.barcode)}</span>
                    <span class="history-type-badge">${escapeHtml(item.type || 'COD')}</span>
                </div>
                <div class="history-card-body">
                    <span class="status-badge ${statusClass}">${escapeHtml(item.statusText || 'Unknown')}</span>
                    <span class="history-time">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${timeStr}
                    </span>
                </div>
            `;

            historyCardsContainer.appendChild(card);
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            trackingHistory = [];
            localStorage.setItem('slpost_tracking_history', '[]');
            renderHistory();
        });
    }

    function saveTrackingHistory(barcode, statusText, type, fullData) {
        // Remove if exists to move to top
        trackingHistory = trackingHistory.filter(i => i.barcode !== barcode);

        trackingHistory.unshift({
            barcode,
            statusText,
            type,
            lastChecked: Date.now(),
            data: fullData
        });

        // Keep last 10
        if (trackingHistory.length > 10) {
            trackingHistory = trackingHistory.slice(0, 10);
        }

        localStorage.setItem('slpost_tracking_history', JSON.stringify(trackingHistory));
        renderHistory();
    }

    renderHistory();

    let currentSessionCookie = '';
    let captchaLoaded = false;
    let needsCaptcha = false;

    // Classify barcode into 'cod', 'slp', or 'ambiguous'
    // BD = always COD, BF = always SLP courier
    // RA, BG = ambiguous (could be either), other UPU format = SLP
    function classifyBarcode(barcode) {
        const b = barcode.trim().toUpperCase();
        // BD prefix: always COD
        if (b.startsWith('BD')) return 'cod';
        // BF prefix: always SLP courier
        if (b.startsWith('BF')) return 'slp';
        // RA or BG with UPU 13-char format: ambiguous
        if (/^(RA|BG)\d{9}[A-Z]{2}$/i.test(b)) return 'ambiguous';
        // Other standard UPU 13-char format (R, C, E, V prefixes): SLP courier
        if (/^[RCEV][A-Z]\d{9}[A-Z]{2}$/i.test(b)) return 'slp';
        // Everything else: COD
        return 'cod';
    }

    // Backwards-compat helper: does this barcode need SLP courier (definite or possible)?
    function mightNeedCourier(barcode) {
        const type = classifyBarcode(barcode);
        return type === 'slp';
    }

    // Auto-detect Couriers on Input
    // Only show captcha upfront for definite SLP codes (BF, R*, C*, E*, V*)
    // Ambiguous codes (RA, BG) will request captcha lazily on fallback
    if (barcodeInput) {
        barcodeInput.addEventListener('input', () => {
            const barcodes = barcodeInput.value.split(',').map(b => b.trim()).filter(b => b !== '');
            needsCaptcha = barcodes.some(b => classifyBarcode(b) === 'slp');

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
    let pendingFallback = null; // Stores barcode waiting for SLP courier retry
    const trackBtnOriginalText = trackBtn ? (trackBtn.querySelector('span')?.textContent || trackBtn.textContent).trim() : 'Track Parcel';

    if (trackForm) {
        trackForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const inputValue = barcodeInput.value.trim();
            if (!inputValue) return;

            // Offline Check: If offline, try to load from history
            if (!navigator.onLine) {
                const searchBarcodes = inputValue.split(',').map(b => b.trim().toUpperCase());
                let foundOffline = false;
                multiResultsSection.innerHTML = '';

                searchBarcodes.forEach(b => {
                    const cached = trackingHistory.find(h => h.barcode.toUpperCase() === b);
                    if (cached) {
                        const cardResult = generateTrackingCard(cached.barcode, cached.data, null, cached.type || 'COD');
                        multiResultsSection.insertAdjacentHTML('beforeend', cardResult.html);
                        foundOffline = true;
                    }
                });

                if (foundOffline) {
                    multiResultsSection.classList.remove('hidden');
                    document.getElementById('offline-banner').classList.remove('hidden');
                } else {
                    errorMessage.textContent = 'You are offline and this tracking number is not cached.';
                    errorMessage.classList.remove('hidden');
                }
                trackBtn.classList.remove('loading');
                trackBtn.disabled = false;
                return;
            }
            const ob = document.getElementById('offline-banner');
            if (ob) ob.classList.add('hidden');

            // Clean up any existing fallback notices
            document.querySelectorAll('.fallback-captcha-notice').forEach(n => n.remove());

            // Check if we're in fallback mode (Track Parcel button acting as SLP retry)
            if (pendingFallback) {
                const captchaStr = captchaInput ? captchaInput.value.trim() : '';
                if (!captchaStr) {
                    alert('Please enter the CAPTCHA code first.');
                    return;
                }

                trackBtn.classList.add('loading');
                trackBtn.disabled = true;
                trackBtn.textContent = '';

                const slpResult = await trackCourier(pendingFallback.barcode, captchaStr);
                let finalResult = (slpResult.data && slpResult.data.length > 0) ? slpResult : pendingFallback.codResult;
                const finalType = (slpResult.data && slpResult.data.length > 0) ? 'SLP Courier' : 'COD';

                // Render the result
                const cardResult = generateTrackingCard(finalResult.barcode, finalResult.data, finalResult.error, finalType);
                multiResultsSection.innerHTML = cardResult.html;
                multiResultsSection.classList.remove('hidden');

                // Save tracking history if successful
                if (finalResult.data && finalResult.data.length > 0) {
                    saveTrackingHistory(finalResult.barcode.toUpperCase(), cardResult.statusText, finalType, finalResult.data);
                }

                // Reset fallback state and button
                pendingFallback.resolve(finalResult);
                pendingFallback = null;
                trackBtn.textContent = trackBtnOriginalText;
                trackBtn.classList.remove('loading');
                trackBtn.disabled = false;
                return;
            }

            // Reset UI state
            errorMessage.classList.add('hidden');
            multiResultsSection.innerHTML = '';
            multiResultsSection.classList.add('hidden');

            const barcodes = inputValue.split(',').map(b => b.trim()).filter(b => b !== '');
            const captchaStr = captchaInput ? captchaInput.value.trim() : '';

            trackBtn.classList.add('loading');
            trackBtn.disabled = true;

            // Show skeleton loading cards
            const skeletonHtml = barcodes.map(() => `
                <div class="skeleton-card">
                    <div class="skeleton-line title"></div>
                    <div class="skeleton-line badge"></div>
                    <div class="skeleton-grid">
                        <div class="skeleton-grid-item"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
                        <div class="skeleton-grid-item"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
                        <div class="skeleton-grid-item"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
                    </div>
                </div>
            `).join('');
            multiResultsSection.innerHTML = skeletonHtml;
            multiResultsSection.classList.remove('hidden');

            try {
                // Process concurrently, routing by barcode classification
                const promises = barcodes.map(barcode => {
                    const type = classifyBarcode(barcode);
                    if (type === 'slp') {
                        return trackCourier(barcode, captchaStr);
                    } else if (type === 'ambiguous') {
                        return trackWithFallback(barcode);
                    } else {
                        return trackCOD(barcode);
                    }
                });

                const results = await Promise.all(promises);

                // Clear skeleton loading cards before appending real results
                multiResultsSection.innerHTML = '';

                let hasCaptchaError = false;
                let successfulBarcodes = [];

                const isBulk = results.length >= 3;

                if (isBulk) {
                    // --- BULK DASHBOARD MODE ---
                    let totalCount = results.length;
                    let deliveredCount = 0, transitCount = 0, errorCount = 0;

                    const cardsHtml = results.map(result => {
                        const typeLabel = classifyBarcode(result.barcode) === 'slp' ? 'SLP Courier' : 'COD';
                        const cardResult = generateTrackingCard(result.barcode, result.data, result.error, typeLabel);

                        if (result.error && result.error.toLowerCase().includes('captcha')) {
                            hasCaptchaError = true;
                        } else if (!result.error && result.data && result.data.length > 0) {
                            successfulBarcodes.push({
                                barcode: result.barcode.toUpperCase(),
                                statusText: cardResult.statusText,
                                type: typeLabel,
                                data: result.data
                            });
                        }

                        const statusClass = cardResult.statusClass || 'transit';
                        const statusText = cardResult.statusText || 'Unknown';

                        // Count statuses
                        if (!result.error && result.data && result.data.length > 0) {
                            if (statusClass === 'success') deliveredCount++;
                            else if (statusClass === 'error') errorCount++;
                            else transitCount++;
                        } else {
                            errorCount++;
                        }

                        return `<div class="compact-card" onclick="this.classList.toggle('expanded')">
                            <div class="compact-card-header">
                                <div class="compact-card-info">
                                    <span class="compact-barcode">${escapeHtml(result.barcode.toUpperCase())}</span>
                                    <span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span>
                                </div>
                                <svg class="compact-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                            <div class="compact-card-body">${cardResult.html}</div>
                        </div>`;
                    }).join('');

                    const dashboardHtml = `
                        <div class="bulk-dashboard">
                            <div class="bulk-stats">
                                <div class="stat-card">
                                    <span class="stat-number">${totalCount}</span>
                                    <span class="stat-label">${t('bulk_total', 'Total')}</span>
                                </div>
                                <div class="stat-card stat-success">
                                    <span class="stat-number">${deliveredCount}</span>
                                    <span class="stat-label">${t('bulk_delivered', 'Delivered')}</span>
                                </div>
                                <div class="stat-card stat-transit">
                                    <span class="stat-number">${transitCount}</span>
                                    <span class="stat-label">${t('bulk_transit', 'In Transit')}</span>
                                </div>
                                <div class="stat-card stat-error">
                                    <span class="stat-number">${errorCount}</span>
                                    <span class="stat-label">${t('bulk_error', 'Error')}</span>
                                </div>
                            </div>
                            <div class="bulk-actions">
                                <button class="btn-expand-all" onclick="document.querySelectorAll('.compact-card').forEach(c => c.classList.add('expanded')); this.style.display='none'; this.nextElementSibling.style.display=''">
                                    ${t('expand_all', 'Expand All')}
                                </button>
                                <button class="btn-expand-all" style="display:none" onclick="document.querySelectorAll('.compact-card').forEach(c => c.classList.remove('expanded')); this.style.display='none'; this.previousElementSibling.style.display=''">
                                    ${t('collapse_all', 'Collapse All')}
                                </button>
                            </div>
                            <div class="compact-cards-grid">
                                ${cardsHtml}
                            </div>
                        </div>
                    `;
                    multiResultsSection.innerHTML = dashboardHtml;
                } else {
                    // --- STANDARD CARD MODE ---
                    results.forEach(result => {
                        const typeLabel = classifyBarcode(result.barcode) === 'slp' ? 'SLP Courier' : 'COD';
                        const cardResult = generateTrackingCard(result.barcode, result.data, result.error, typeLabel);
                        multiResultsSection.insertAdjacentHTML('beforeend', cardResult.html);

                        if (result.error && result.error.toLowerCase().includes('captcha')) {
                            hasCaptchaError = true;
                        } else if (!result.error && result.data && result.data.length > 0) {
                            successfulBarcodes.push({
                                barcode: result.barcode.toUpperCase(),
                                statusText: cardResult.statusText,
                                type: typeLabel,
                                data: result.data
                            });
                        }
                    });
                }

                if (successfulBarcodes.length > 0) {
                    successfulBarcodes.forEach(b => saveTrackingHistory(b.barcode, b.statusText, b.type, b.data));
                }

                multiResultsSection.classList.remove('hidden');

                // If any courier failed due to captcha, reload it
                if (hasCaptchaError) {
                    loadCaptcha();
                }

            } catch (error) {
                errorMessage.textContent = t('err_overall', 'An overall error occurred. Please try again.');
                errorMessage.classList.remove('hidden');
                multiResultsSection.classList.add('hidden');
                multiResultsSection.innerHTML = '';
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

    // Fallback tracker for ambiguous codes (RA, BG): Try COD first, SLP if no results
    async function trackWithFallback(barcode) {
        // Step 1: Try COD (fast, no captcha)
        const codResult = await trackCOD(barcode);
        if (codResult.data && codResult.data.length > 0) {
            return codResult; // COD had results, we're done
        }

        // Step 2: COD returned nothing — need SLP courier with captcha
        // Clean up: remove skeleton loading and reset Track button
        multiResultsSection.innerHTML = '';
        multiResultsSection.classList.add('hidden');
        trackBtn.classList.remove('loading');
        trackBtn.disabled = false;

        // Show captcha UI
        captchaContainer.classList.remove('hidden');
        captchaInput.required = true;

        // Load captcha if not already loaded
        if (!captchaLoaded) {
            await loadCaptcha();
        }

        // Transform the Track Parcel button into "Retry as SLP Courier"
        trackBtn.textContent = '🔄 Retry as SLP Courier';

        // Show a small info notice (no separate button)
        const fallbackNotice = document.createElement('div');
        fallbackNotice.className = 'fallback-captcha-notice';
        fallbackNotice.innerHTML = `
            <p>📬 <strong>${escapeHtml(barcode.toUpperCase())}</strong> was not found in the COD system. It may be an SLP Courier item.</p>
            <p>Please solve the CAPTCHA above and click <strong>Retry as SLP Courier</strong> to track.</p>
        `;
        const trackSection = trackForm.closest('.bento-card') || trackForm.parentElement;
        trackSection.appendChild(fallbackNotice);

        // Set fallback state — the form submit handler will pick this up on next submit
        return new Promise((resolve) => {
            pendingFallback = { barcode, codResult, resolve };
        });
    }

    function generateTrackingCard(barcode, events, error, typeStr = 'COD') {
        if (error) {
            const html = `<div class="tracking-card">
                        <div class="results-header"><div><h2 style="display:flex;align-items:center;gap:0.5rem">${escapeHtml(barcode.toUpperCase())}<span class="history-type-badge" style="vertical-align:middle;font-size:0.7rem">${escapeHtml(typeStr)}</span></h2><p class="status-badge error">${t('err_status_error', 'Error')}</p></div></div>
                        <div class="error-message">${escapeHtml(error)}</div>
                    </div>`;
            return { html, statusText: error, statusClass: 'error' };
        }

        if (!events || events.length === 0) {
            const html = `<div class="tracking-card">
                        <div class="results-header"><div><h2 style="display:flex;align-items:center;gap:0.5rem">${escapeHtml(barcode.toUpperCase())}<span class="history-type-badge" style="vertical-align:middle;font-size:0.7rem">${escapeHtml(typeStr)}</span></h2><p class="status-badge error">${t('err_no_record', 'No Record Found')}</p></div></div>
                        <div class="timeline"><div class="timeline-item"><div class="timeline-content"><div class="timeline-title">${t('err_no_tracking', 'No tracking information found.')}</div></div></div></div>
                    </div>`;
            return { html, statusText: 'No Record Found', statusClass: 'error' };
        }

        // Determine if this is a COD key-value format (usually 2 columns, first column ends up as keys)
        let isKeyValueFormat = events.length > 0 && Object.keys(events[0]).length <= 2 && events.some(e => e.col_0 && e.col_0.toLowerCase().includes('status'));

        let statusText = t('status_in_transit', 'In Transit');
        let statusClass = "transit";
        let resolvedBarcode = barcode.toUpperCase();
        let timelineHtml = '';
        let stepperHtml = '';

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
                        <span class="info-label">${escapeHtml(formatKey(key))}</span>
                        <span class="info-value">${escapeHtml(formatValue(val) || '-')}</span>
                    </div>`;
                }
            });
            timelineHtml = `<div class="info-grid">${gridItems}</div>`;

        } else {
            // Check if this is the SLP courier format from bepost.lk
            // Format: 5 columns — ID, Identification No, Event, Data/Time, Location
            const isSLPCourierViaBepost = events.length > 0 &&
                Object.keys(events[0]).length >= 5 &&
                events.some(e => /^\d{4}-\d{2}-\d{2}/.test(e.col_3 || ''));

            if (isSLPCourierViaBepost) {
                // Filter out header rows (col_0 is "ID" or non-numeric)
                const validEvents = events.filter(e => {
                    const id = (e.col_0 || '').trim();
                    return /^\d+$/.test(id); // Only keep rows with numeric ID
                });

                // Derive status from the latest event
                if (validEvents.length > 0) {
                    const latestEvent = (validEvents[validEvents.length - 1].col_2 || '').toLowerCase();
                    if (latestEvent.includes('deliver') && (latestEvent.includes('success') || latestEvent.includes('delivered to'))) {
                        statusText = 'Delivered';
                    } else if (latestEvent.includes('receive') && latestEvent.includes('delivery office')) {
                        statusText = 'Arrived at Delivery Office';
                    } else if (latestEvent.includes('send') && latestEvent.includes('delivery')) {
                        statusText = 'In Transit to Delivery Office';
                    } else if (latestEvent.includes('receive') && latestEvent.includes('customer')) {
                        statusText = 'Accepted';
                    } else if (latestEvent.includes('return')) {
                        statusText = 'Returned';
                    } else {
                        statusText = validEvents[validEvents.length - 1].col_2 || 'In Transit';
                    }
                }

                // Extract first and last locations for stepper tooltips
                const firstLocation = validEvents.length > 0 ? (validEvents[0].col_4 || '').trim() : '';
                const lastLocation = validEvents.length > 0 ? (validEvents[validEvents.length - 1].col_4 || '').trim() : '';

                // Build progress stepper for SLP courier
                const slpSteps = ['Accepted', 'In Transit', 'Arrived', 'Delivered'];
                let slpActiveStep = 0;
                let slpIsError = false;
                const slpStatus = statusText.toLowerCase();

                if (slpStatus.includes('transit') || slpStatus.includes('send')) {
                    slpActiveStep = Math.max(slpActiveStep, 1);
                }
                if (slpStatus.includes('arrived') || (slpStatus.includes('receive') && slpStatus.includes('delivery'))) {
                    slpActiveStep = Math.max(slpActiveStep, 2);
                }
                if (slpStatus.includes('delivered') || slpStatus.includes('success')) {
                    slpActiveStep = Math.max(slpActiveStep, 3);
                }
                if (slpStatus.includes('return')) {
                    slpSteps[3] = 'Returned';
                    slpActiveStep = 3;
                    slpIsError = true;
                }

                const slpStepTooltips = [
                    firstLocation ? `Accepted at ${firstLocation}` : 'Accepted',
                    firstLocation ? `Dispatched from ${firstLocation}` : 'In Transit',
                    lastLocation ? `Arrived at ${lastLocation}` : 'Arrived',
                    slpIsError
                        ? (lastLocation ? `Returned from ${lastLocation}` : 'Returned')
                        : (lastLocation ? `Delivered at ${lastLocation}` : 'Delivered')
                ];

                stepperHtml = `<div class="progress-stepper">${slpSteps.map((s, i) => {
                    let cls = '';
                    if (i < slpActiveStep) cls = 'completed';
                    else if (i === slpActiveStep) {
                        cls = slpIsError && i === 3 ? 'active error-step' : 'active';
                    }
                    const tooltipAttr = slpStepTooltips[i] ? ` data-tooltip="${slpStepTooltips[i]}"` : '';
                    return `<div class="step ${cls}"${tooltipAttr}><div class="step-dot"></div><span class="step-label">${s}</span></div>`;
                }).join('<div class="step-line"></div>')}</div>`;

                // Build COD-style info-grid by mapping events to structured fields
                let acceptingPO = '';
                let dateAccepted = '';
                let deliveryPO = '';
                let receivedDate = '';

                validEvents.forEach(event => {
                    const eventText = (event.col_2 || '').toLowerCase();
                    const location = (event.col_4 || '').trim();
                    const dateTime = (event.col_3 || '').trim();

                    if (eventText.includes('receive') && eventText.includes('customer')) {
                        // "Receive item from customer" → Accepting PO + Date Accepted
                        acceptingPO = location;
                        dateAccepted = dateTime;
                    } else if (eventText.includes('send') && eventText.includes('delivery')) {
                        // "Send Item To Delivery Office" → Delivery PO
                        deliveryPO = location;
                    } else if (eventText.includes('receive') && eventText.includes('delivery office')) {
                        // "Receive item at delivery office" → Received Date
                        if (!deliveryPO) deliveryPO = location;
                        receivedDate = dateTime;
                    }
                });

                let gridItems = '';
                if (acceptingPO) {
                    gridItems += `<div class="info-group">
                        <span class="info-label">Accepting Post Office</span>
                        <span class="info-value">${escapeHtml(acceptingPO)}</span>
                    </div>`;
                }
                if (dateAccepted) {
                    gridItems += `<div class="info-group">
                        <span class="info-label">Date Accepted</span>
                        <span class="info-value">${escapeHtml(dateAccepted)}</span>
                    </div>`;
                }
                if (deliveryPO) {
                    gridItems += `<div class="info-group">
                        <span class="info-label">Delivery Post Office</span>
                        <span class="info-value">${escapeHtml(deliveryPO)}</span>
                    </div>`;
                }
                if (receivedDate) {
                    gridItems += `<div class="info-group">
                        <span class="info-label">Received at Delivery Office</span>
                        <span class="info-value">${escapeHtml(receivedDate)}</span>
                    </div>`;
                }

                timelineHtml = `<div class="info-grid">${gridItems}</div>`;

            } else {
                // Generic chronological timeline (other courier formats)
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
        }

        // Assign styling classes dynamically based on the final status string
        const slStatus = statusText.toLowerCase();
        if (slStatus.includes('delivered') || slStatus.includes('settled') || slStatus.includes('success')) {
            statusClass = "success";
        } else if (slStatus.includes('returned') || slStatus.includes('error') || slStatus.includes('fail') || slStatus.includes('not')) {
            statusClass = "error";
        }

        let estimateHtml = '';
        if (statusClass !== 'success' && statusClass !== 'error') {
            let estimateText = '';
            if (slStatus.includes('arrived') && slStatus.includes('delivery')) {
                // Arrived at delivery office
                estimateText = 'Delivery expected today or tomorrow';
            } else if (slStatus.includes('transit') || slStatus.includes('accepted')) {
                // Check if Same District (Very naive check: if accepting PO == delivery PO)
                let isSamePO = false;
                if (isKeyValueFormat) {
                    const getMapVal = (key) => {
                        const e = events.find(ev => (ev.col_0 || '').trim().toLowerCase() === key);
                        return e ? (e.col_1 || '').trim().toLowerCase() : '';
                    };
                    const accPO = getMapVal('acceptingpo');
                    const delPO = getMapVal('deliverypo');
                    if (accPO && delPO && accPO === delPO) {
                        isSamePO = true;
                    }
                }

                if (isSamePO) {
                    estimateText = 'Estimated delivery in 1-2 business days';
                } else {
                    estimateText = 'Estimated delivery in 2-4 business days';
                }
            }

            if (estimateText) {
                estimateHtml = `<div style="padding: 0 1.5rem; margin-top: 1rem;"><div class="delivery-estimate-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span style="vertical-align: middle;">${estimateText}</span>
                </div></div>`;
            }
        }

        // Build progress stepper (for COD key-value results)
        if (isKeyValueFormat) {
            const steps = ['Accepted', 'In Transit', 'Arrived', 'Delivered'];
            let activeStep = 0;
            let isErrorFinished = false;

            if (slStatus.includes('transit') || slStatus.includes('dispatched')) {
                activeStep = Math.max(activeStep, 1);
            }

            const hasReceivedDate = events.some(e => {
                const k = (e.col_0 || '').trim().toLowerCase();
                return k === 'receiveddate' && (e.col_1 || '').trim() !== '';
            });

            if (slStatus.includes('arrived') || slStatus.includes('received') || slStatus.includes('pending') || hasReceivedDate) {
                activeStep = Math.max(activeStep, 2);
            }
            if (slStatus.includes('delivered') || slStatus.includes('settled') || slStatus.includes('success')) {
                activeStep = Math.max(activeStep, 3);
            }
            if (slStatus.includes('returned') || slStatus.includes('fail')) {
                steps[3] = 'Returned';
                activeStep = 3;
                isErrorFinished = true;
            }

            const getMapVal = (key) => {
                const e = events.find(ev => (ev.col_0 || '').trim().toLowerCase() === key);
                return e ? (e.col_1 || '').trim().replace(/\bPO\b/g, 'Post Office') : '';
            };
            const acceptingPo = getMapVal('acceptingpo');
            const deliveryPo = getMapVal('deliverypo');
            const settledPo = getMapVal('posettled');

            const stepTooltips = [
                acceptingPo ? `Accepted at ${acceptingPo}` : 'Accepted',
                acceptingPo ? `On transit from ${acceptingPo}` : 'In Transit',
                deliveryPo ? `Arrived at ${deliveryPo}` : 'Arrived',
                isErrorFinished
                    ? (deliveryPo ? `Returned from ${deliveryPo}` : 'Returned')
                    : (settledPo ? `Settled at ${settledPo}` : (deliveryPo ? `Delivered by ${deliveryPo}` : 'Delivered'))
            ];

            stepperHtml = `<div class="progress-stepper">${steps.map((s, i) => {
                let cls = '';
                if (i < activeStep) cls = 'completed';
                else if (i === activeStep) {
                    cls = isErrorFinished && i === 3 ? 'active error-step' : 'active';
                }
                const tooltipAttr = stepTooltips[i] ? ` data-tooltip="${stepTooltips[i]}"` : '';
                return `<div class="step ${cls}"${tooltipAttr}><div class="step-dot"></div><span class="step-label">${s}</span></div>`;
            }).join('<div class="step-line"></div>')}</div>`;
        }

        // Build a plain-text summary for WhatsApp sharing
        let shareText = `📦 *SL Post Tracker*\n\n`;
        shareText += `Tracking: *${resolvedBarcode}*\n`;
        shareText += `Status: *${statusText}*\n`;

        if (isKeyValueFormat) {
            events.forEach(e => {
                const key = (e.col_0 || '').trim();
                const val = (e.col_1 || '').trim();
                if (key && key.toLowerCase() !== 'barcode' && key.toLowerCase() !== 'status' && val) {
                    shareText += `${key}: ${val}\n`;
                }
            });
        } else {
            const latestEvent = events[0];
            if (latestEvent) {
                const vals = Object.values(latestEvent).filter(v => v);
                shareText += `Latest: ${vals.join(' • ')}\n`;
            }
        }

        shareText += `\n🔗 Track at: ${window.location.origin}/track/${resolvedBarcode}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

        const html = `
            <div class="tracking-card">
                <div class="results-header">
                    <div>
                        <h2 style="display:flex;align-items:center;gap:0.5rem">${escapeHtml(resolvedBarcode)}<span class="history-type-badge" style="vertical-align:middle;font-size:0.7rem">${escapeHtml(typeStr)}</span></h2>
                        <p class="status-badge ${statusClass}">${statusText}</p>
                    </div>
                    <div class="share-actions">
                        <button class="copy-link-btn" onclick="exportPdf(this)" title="Export PDF">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            <span data-i18n="export_pdf">${t('export_pdf', 'Export PDF')}</span>
                        </button>
                        <button class="copy-link-btn" onclick="copyToClipboard('${window.location.origin}/track/${resolvedBarcode}', this)" title="Copy Link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span data-i18n="share_link">${t('share_link', 'Copy Link')}</span>
                        </button>
                        <a href="${whatsappUrl}" target="_blank" rel="noopener" class="whatsapp-share-btn" title="Share on WhatsApp">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            <span data-i18n="share_whatsapp">${t('share_whatsapp', 'Share')}</span>
                        </a>
                    </div>
                </div>
                ${stepperHtml}
                ${estimateHtml}
                ${timelineHtml}
            </div>
        `;
        return { html, statusText, statusClass };
    }

    // --- SHAREABLE TRACKING URL ---
    // If URL is /track/BARCODE123, auto-fill and trigger tracking
    const pathMatch = window.location.pathname.match(/^\/track\/([A-Za-z0-9,]+)$/);
    if (pathMatch && barcodeInput && trackForm) {
        const autoBarcode = decodeURIComponent(pathMatch[1]);
        barcodeInput.value = autoBarcode;
        // Trigger input event so captcha detection fires
        barcodeInput.dispatchEvent(new Event('input', { bubbles: true }));

        // If it needs captcha, don't auto-submit — let the user fill captcha first
        const barcodes = autoBarcode.split(',').map(b => b.trim());
        const hasDefiniteCourier = barcodes.some(b => classifyBarcode(b) === 'slp');
        if (!hasDefiniteCourier) {
            // Auto-submit for COD and ambiguous barcodes (ambiguous tries COD first anyway)
            setTimeout(() => trackForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), 500);
        }
        // Scroll to the tracking section
        document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
    }
});

// --- GLOBAL HELPERS ---
window.copyToClipboard = function (text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const span = btn.querySelector('span');
        const origText = span.innerText;
        const origI18n = span.getAttribute('data-i18n');

        span.innerText = typeof t === 'function' ? t('copied', 'Copied!') : 'Copied!';
        span.removeAttribute('data-i18n');

        setTimeout(() => {
            span.innerText = origText;
            if (origI18n) span.setAttribute('data-i18n', origI18n);
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};

window.exportPdf = async function (btn) {
    // Find the closest tracking card
    const card = btn.closest('.tracking-card');
    if (!card) return;

    const origText = btn.innerHTML;

    // Lazy-load html2pdf.js on first use
    if (typeof html2pdf === 'undefined') {
        btn.innerHTML = '⏳ Loading...';
        btn.disabled = true;
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                script.crossOrigin = 'anonymous';
                script.referrerPolicy = 'no-referrer';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch (e) {
            btn.innerHTML = origText;
            btn.disabled = false;
            alert('Failed to load PDF library. Please check your connection and try again.');
            return;
        }
        btn.disabled = false;
    }

    // Hide share buttons temporarily so they don't appear in the PDF
    const shareActions = card.querySelector('.share-actions');
    if (shareActions) shareActions.style.display = 'none';

    // Get the barcode for the filename
    const h2 = card.querySelector('h2');
    const barcode = h2 ? h2.innerText.trim() : 'Tracking';

    // Configure PDF options
    const opt = {
        margin: 10,
        filename: `SL_Post_Tracking_${barcode}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#18181b' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Add a temporary wrapper class for PDF-specific styling (like text colors)
    card.classList.add('exporting-pdf');
    btn.innerHTML = '...';

    // Generate PDF
    html2pdf().set(opt).from(card).save().then(() => {
        // Restore UI
        if (shareActions) shareActions.style.display = '';
        card.classList.remove('exporting-pdf');
        btn.innerHTML = origText;
    }).catch(err => {
        console.error('PDF export failed:', err);
        if (shareActions) shareActions.style.display = '';
        card.classList.remove('exporting-pdf');
        btn.innerHTML = origText;
        alert('Failed to generate PDF. Check console for details.');
    });
};

// --- MOBILE BOTTOM NAVIGATION ---
(() => {
    const bottomNav = document.getElementById('bottom-nav');
    if (!bottomNav) return;

    const bottomItems = bottomNav.querySelectorAll('.bottom-nav-item[data-section]');
    const sections = ['home', 'tools', 'calculators'];

    // Scroll spy: highlight the bottom nav item matching the visible section
    const updateActiveBottomNav = () => {
        let current = 'home';
        for (const id of sections) {
            const section = document.getElementById(id);
            if (section && section.getBoundingClientRect().top <= 150) {
                current = id;
            }
        }
        bottomItems.forEach(item => {
            item.classList.toggle('active', item.dataset.section === current);
        });
    };

    window.addEventListener('scroll', updateActiveBottomNav, { passive: true });
    updateActiveBottomNav();

    // Theme toggle in bottom nav
    const bottomThemeBtn = document.getElementById('bottom-theme-toggle');
    if (bottomThemeBtn) {
        bottomThemeBtn.addEventListener('click', () => {
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) themeToggle.click();
        });
    }
})();
