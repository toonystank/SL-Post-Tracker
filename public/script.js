document.addEventListener('DOMContentLoaded', () => {
    // --- TRANSLATION LOGIC ---
    let currentLang = localStorage.getItem('slpost_lang') || 'en';

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

    const recentSearchesContainer = document.getElementById('recent-searches-container');
    const recentChipsContainer = document.getElementById('recent-chips');

    // --- RECENT SEARCH LOGIC ---
    let recentSearches = [];
    try {
        recentSearches = JSON.parse(localStorage.getItem('slpost_recent_searches') || '[]');
    } catch {
        recentSearches = [];
    }

    function renderRecentSearches() {
        if (!recentSearchesContainer || !recentChipsContainer) return;

        if (recentSearches.length === 0) {
            recentSearchesContainer.classList.add('hidden');
            return;
        }

        recentSearchesContainer.classList.remove('hidden');
        recentChipsContainer.innerHTML = '';

        recentSearches.forEach(barcode => {
            const chip = document.createElement('div');
            chip.className = 'recent-chip';
            chip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> ${barcode}`;

            // Quick click to re-search
            chip.addEventListener('click', () => {
                barcodeInput.value = barcode;
                // Dispatch input event to trigger auto-detect
                barcodeInput.dispatchEvent(new Event('input', { bubbles: true }));

                // Add slight delay before submitting if captcha is needed and loading
                setTimeout(() => {
                    if (trackForm) {
                        trackForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                }, 100);
            });

            recentChipsContainer.appendChild(chip);
        });
    }

    // Expose save globally for track results
    window.saveRecentSearches = function (newBarcodes) {
        newBarcodes.forEach(code => {
            recentSearches = recentSearches.filter(b => b !== code);
            recentSearches.unshift(code);
        });

        if (recentSearches.length > 3) {
            recentSearches = recentSearches.slice(0, 3);
        }

        localStorage.setItem('slpost_recent_searches', JSON.stringify(recentSearches));
        renderRecentSearches();
    };

    renderRecentSearches();

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
                let successfulBarcodes = [];

                results.forEach(result => {
                    const cardHtml = generateTrackingCard(result.barcode, result.data, result.error);
                    multiResultsSection.insertAdjacentHTML('beforeend', cardHtml);

                    if (result.error && result.error.toLowerCase().includes('captcha')) {
                        hasCaptchaError = true;
                    } else if (!result.error && result.data && result.data.length > 0) {
                        successfulBarcodes.push(result.barcode.toUpperCase());
                    }
                });

                if (successfulBarcodes.length > 0) {
                    saveRecentSearches(successfulBarcodes);
                }

                multiResultsSection.classList.remove('hidden');

                // If any courier failed due to captcha, reload it
                if (hasCaptchaError) {
                    loadCaptcha();
                }

            } catch (error) {
                errorMessage.textContent = t('err_overall', 'An overall error occurred. Please try again.');
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
                        <div class="results-header"><div><h2>${barcode.toUpperCase()}</h2><p class="status-badge error">${t('err_status_error', 'Error')}</p></div></div>
                        <div class="error-message">${error}</div>
                    </div>`;
        }

        if (!events || events.length === 0) {
            return `<div class="tracking-card">
                        <div class="results-header"><div><h2>${barcode.toUpperCase()}</h2><p class="status-badge error">${t('err_no_record', 'No Record Found')}</p></div></div>
                        <div class="timeline"><div class="timeline-item"><div class="timeline-content"><div class="timeline-title">${t('err_no_tracking', 'No tracking information found.')}</div></div></div></div>
                    </div>`;
        }

        // Determine if this is a COD key-value format (usually 2 columns, first column ends up as keys)
        let isKeyValueFormat = events.length > 0 && Object.keys(events[0]).length <= 2 && events.some(e => e.col_0 && e.col_0.toLowerCase().includes('status'));

        let statusText = t('status_in_transit', 'In Transit');
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

        // Build progress stepper (for COD key-value results)
        let stepperHtml = '';
        if (isKeyValueFormat) {
            const steps = ['Accepted', 'In Transit', 'Arrived', 'Delivered'];
            let activeStep = 0;
            if (slStatus.includes('transit') || slStatus.includes('dispatched')) activeStep = 1;
            if (slStatus.includes('arrived') || slStatus.includes('received')) activeStep = 2;
            if (slStatus.includes('delivered') || slStatus.includes('settled') || slStatus.includes('success')) activeStep = 3;
            if (slStatus.includes('returned')) activeStep = -1; // special case

            stepperHtml = `<div class="progress-stepper">${steps.map((s, i) => {
                let cls = '';
                if (activeStep === -1) cls = i === 0 ? 'active error-step' : '';
                else if (i < activeStep) cls = 'completed';
                else if (i === activeStep) cls = 'active';
                return `<div class="step ${cls}"><div class="step-dot"></div><span class="step-label">${s}</span></div>`;
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

        shareText += `\n🔗 Track at: ${window.location.origin}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

        return `
            <div class="tracking-card">
                <div class="results-header">
                    <div>
                        <h2>${resolvedBarcode}</h2>
                        <p class="status-badge ${statusClass}">${statusText}</p>
                    </div>
                    <a href="${whatsappUrl}" target="_blank" rel="noopener" class="whatsapp-share-btn" title="Share on WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        <span data-i18n="share_whatsapp">Share</span>
                    </a>
                </div>
                ${stepperHtml}
                ${timelineHtml}
            </div>
        `;
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
        const hasCourier = barcodes.some(b => isCourier(b));
        if (!hasCourier) {
            // Auto-submit after a short delay for COD barcodes
            setTimeout(() => trackForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), 500);
        }
        // Scroll to the tracking section
        document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
    }
});
