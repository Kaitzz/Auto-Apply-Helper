// Content Script - Autofill logic for job application forms
// Injected into Greenhouse and other job application pages

(function() {
  'use strict';

  // ==================== Configuration ====================
  
  // Set to false for production release
  const DEBUG = true;
  
  // Conditional logging - only logs when DEBUG is true
  const log = (...args) => { if (DEBUG) console.log('[JobAutofill]', ...args); };
  const logError = (...args) => { console.error('[JobAutofill]', ...args); };

  // Prevent multiple injections
  if (window.__jobAutofillLoaded) return;
  window.__jobAutofillLoaded = true;

  // ==================== In-Page Notification ====================
  
  // Check if current page is an actual job application page (not a listing page)
  function isApplicationPage() {
    const url = window.location.href;
    const path = window.location.pathname;
    
    // Greenhouse: must have /jobs/ followed by a number
    if (window.location.hostname.includes('greenhouse.io')) {
      return /\/jobs\/\d+/.test(path);
    }
    
    // Generic: check for application form
    return document.querySelector('#application_form') !== null ||
           document.querySelector('form[action*="apply"]') !== null;
  }

  // ---------- Persistent “Supported” Banner (no auto-dismiss) ----------
  let __jobAutofillBannerState = 'supported'; // supported | running | success | error

  function bannerDismissKey() {
    // dismiss per job page (so closing one job doesn't hide all)
    return `job-autofill-banner-dismissed:${location.pathname}`;
  }
  function bannerDismissDuringRunKey() {
    return `job-autofill-banner-dismissed-during-run:${location.pathname}`;
  }

  function showNotificationBanner({ force = false } = {}) {
    const dismissed = sessionStorage.getItem(bannerDismissKey()) === '1';

    // If dismissed and not forcing, keep hidden (but still create if missing)
    let notif = document.getElementById('job-autofill-notif');
    if (notif) {
      notif.style.display = (force || !dismissed) ? 'block' : 'none';
      return notif;
    }

    // Create banner
    notif = document.createElement('div');
    notif.id = 'job-autofill-notif';
    notif.style.position = 'fixed';
    // ✅ top-right (instead of bottom-right)
    notif.style.top = '16px';
    notif.style.right = '16px';
    notif.style.bottom = 'auto';
    notif.style.left = 'auto';

    notif.style.padding = '12px 14px';
    notif.style.borderRadius = '12px';
    notif.style.border = '1px solid #3b82f6';
    notif.style.backgroundColor = '#eff6ff';
    notif.style.color = '#1e3a8a';
    notif.style.fontSize = '13px';
    notif.style.lineHeight = '1.35';
    notif.style.zIndex = '999999';
    notif.style.boxShadow = '0 10px 30px rgba(0,0,0,0.14)';
    notif.style.maxWidth = '340px';
    // modern system font stack
    notif.style.fontFamily =
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif';
    notif.style.webkitFontSmoothing = 'antialiased';
    notif.style.mozOsxFontSmoothing = 'grayscale';

    // Two-part layout: status + detail, plus actions
    notif.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div style="flex:1; min-width:0;">
          <div id="job-autofill-status" style="font-weight:700; margin-bottom:4px;">
            Auto-Apply supported!
          </div>
          <div id="job-autofill-detail" style="font-size:12px; opacity:0.95; line-height:1.35;">
            Ready. Open side panel to update info.
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <button id="job-autofill-open-panel"
            style="padding:5px 8px; font-size:12px; border:none; border-radius:8px; cursor:pointer;
                  background:#2563eb; color:white;">
            Update
          </button>
          <button id="job-autofill-close"
            style="padding:0 6px; font-size:16px; line-height:18px; border:none; border-radius:8px;
                  cursor:pointer; background:transparent; color:inherit;">
            ×
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(notif);

    // Open side panel
    const openBtn = notif.querySelector('#job-autofill-open-panel');
    openBtn?.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      } catch (_) {}
    });

    // Close (persist until tab close via sessionStorage)
    const closeBtn = notif.querySelector('#job-autofill-close');
    closeBtn?.addEventListener('click', () => {
      // If user closes WHILE RUNNING, remember it so we can re-show success once
      if (__jobAutofillBannerState === 'running') {
        sessionStorage.setItem(bannerDismissDuringRunKey(), '1');
      }
      sessionStorage.setItem(bannerDismissKey(), '1');
      notif.style.display = 'none';
    });

    // Respect dismiss state on first render
    notif.style.display = (force || !dismissed) ? 'block' : 'none';
    return notif;
  }

  function updateNotificationBanner(state, payload = {}) {
    if (state) __jobAutofillBannerState = state;

    // If user dismissed DURING RUN, we force-show SUCCESS once
    const dismissedDuringRun = sessionStorage.getItem(bannerDismissDuringRunKey()) === '1';
    const force = (__jobAutofillBannerState === 'success' && dismissedDuringRun);

    if (force) {
      // clear dismiss so success can show
      sessionStorage.removeItem(bannerDismissKey());
      sessionStorage.removeItem(bannerDismissDuringRunKey());
    }

    const notif = showNotificationBanner({ force });
    if (!notif) return;

    const statusEl = notif.querySelector('#job-autofill-status');
    const detailEl = notif.querySelector('#job-autofill-detail');

    const filledCount = payload.filledCount ?? 0;
    const resumeUploaded = !!payload.resumeUploaded;
    const coverLetterUploaded = !!payload.coverLetterUploaded;

    // Theme by state
    const theme = {
      supported: { border: '#3b82f6', bg: '#eff6ff', fg: '#1e3a8a' },
      running:   { border: '#3b82f6', bg: '#eff6ff', fg: '#1e3a8a' },
      success:   { border: '#22c55e', bg: '#f0fdf4', fg: '#14532d' },
      error:     { border: '#ef4444', bg: '#fef2f2', fg: '#7f1d1d' }
    }[__jobAutofillBannerState] || { border: '#3b82f6', bg: '#eff6ff', fg: '#1e3a8a' };

    notif.style.borderColor = theme.border;
    notif.style.backgroundColor = theme.bg;
    notif.style.color = theme.fg;

    if (__jobAutofillBannerState === 'running') {
      statusEl.textContent = 'Auto-Apply supported!';
      detailEl.textContent = 'Filling for you now…';
    } else if (__jobAutofillBannerState === 'success') {
      statusEl.textContent = 'Filling succeeded!';
      const parts = [`Autofilled ${filledCount} fields`];
      if (resumeUploaded) parts.push('Resume uploaded');
      if (coverLetterUploaded) parts.push('Cover letter uploaded');
      detailEl.textContent = parts.join(' • ');
    } else if (__jobAutofillBannerState === 'error') {
      statusEl.textContent = 'Auto-Apply supported!';
      detailEl.textContent = payload.message || 'Could not autofill. Open side panel to try again.';
    } else {
      statusEl.textContent = 'Auto-Apply supported!';
      detailEl.textContent = 'Ready. Open side panel to update info.';
    }
  }

  // ==================== Field Mappings ====================

  const FIELD_MAPPINGS = {
    // Personal Info
    'first_name': [
      'input[name*="first_name"]', 
      'input[id*="first_name"]', 
      'input[autocomplete="given-name"]',
      'input[placeholder*="First" i]',
      'input[aria-label*="First" i]'
    ],
    'last_name': [
      'input[name*="last_name"]', 
      'input[id*="last_name"]', 
      'input[autocomplete="family-name"]',
      'input[placeholder*="Last" i]',
      'input[aria-label*="Last" i]'
    ],
    'preferred_first_name': [
      'input[name*="preferred"]',
      'input[id*="preferred"]',
      'input[placeholder*="Preferred" i]',
      'input[name*="nickname"]'
    ],
    'email': [
      'input[name*="email"]', 
      'input[type="email"]', 
      'input[autocomplete="email"]'
    ],
    'phone': [
      'input[name*="phone"]', 
      'input[type="tel"]', 
      'input[autocomplete="tel"]'
    ],
    'phone_full': [
      'input[name*="phone"]', 
      'input[type="tel"]', 
      'input[autocomplete="tel"]'
    ],
    
    // Location
    'city': [
      'input[name*="city"]', 
      'input[id*="city"]',
      'input[placeholder*="City" i]'
    ],
    'state': [
      'input[name*="state"]', 
      'select[name*="state"]', 
      'input[id*="state"]',
      'input[placeholder*="State" i]'
    ],
    'zip': [
      'input[name*="zip"]', 
      'input[name*="postal"]', 
      'input[autocomplete="postal-code"]',
      'input[placeholder*="ZIP" i]',
      'input[placeholder*="Postal" i]'
    ],
    
    // Professional - improved LinkedIn detection
    'current_company': [
      'input[name="current_company"]',
      'input[name*="current_company" i]',
      'input[id*="current_company" i]',
      'input[aria-label*="current company" i]',
      'input[placeholder*="current company" i]'
    ],
    'linkedin': [
      'input[name*="linkedin" i]', 
      'input[id*="linkedin" i]', 
      'input[placeholder*="linkedin" i]',
      'input[aria-label*="linkedin" i]',
      'input[name*="linked_in" i]',
      'input[id*="linked_in" i]'
    ],
    'github': [
      'input[name*="github"]', 
      'input[id*="github"]', 
      'input[placeholder*="github" i]'
    ],
    'website': [
      'input[name*="website"]', 
      'input[name*="portfolio"]', 
      'input[id*="website"]',
      'input[placeholder*="Website" i]',
      'input[placeholder*="Portfolio" i]'
    ],
    
    // Education
    'school': [
      'input[name*="school"]',
      'input[id*="school"]',
      'input[placeholder*="School" i]',
      'input[aria-label*="School" i]'
    ],
    'degree': [
      'select[name*="degree"]',
      'input[name*="degree"]',
      'input[placeholder*="Degree" i]'
    ],
    'discipline': [
      'input[name*="discipline"]',
      'input[name*="major"]',
      'input[name*="field_of_study"]',
      'input[placeholder*="Discipline" i]',
      'input[placeholder*="Major" i]'
    ],
    'edu_start_year': [
      'input[name*="start_date_year"]',
      'input[name*="start_year"]',
      'input[placeholder*="Start" i][placeholder*="year" i]'
    ],
    'edu_end_year': [
      'input[name*="end_date_year"]',
      'input[name*="end_year"]',
      'input[placeholder*="End" i][placeholder*="year" i]'
    ]
  };

  // Label-based field detection (excluding EEO)
  const LABEL_MAPPINGS = {
    'preferred_first_name': ['preferred name', 'preferred first name'],
    'school': ['school'],
    'degree': ['degree'],
    'discipline': ['discipline', 'major', 'field of study'],
    'edu_start_year': ['start date year', 'start year'],
    'edu_end_year': ['end date year', 'end year', 'graduation'],
    'current_company': ['current company', 'current employer', 'most recent company'],
    'linkedin': ['linkedin'],
    'github': ['github', 'github profile', 'github url'],
    'website': ['website', 'portfolio', 'portfolio website', 'personal website', 'personal site', 'portfolio url'],
    'lgbtq': ['lgbtq', 'lgbtq+', 'identify as lgbtq', 'sexual orientation', 'lgbt'],
    'race_ethnicity': ['race', 'ethnicity', 'race/ethnicity', 'identify your race']
  };

  // Work authorization selectors
  const AUTHORIZED_SELECTORS = [
    'select[name*="authorized"]', 
    'select[id*="authorized"]',
    'select[name*="legally"]',
    'select[name*="eligible"]'
  ];

  const SPONSORSHIP_SELECTORS = [
    'select[name*="sponsor" i]', 
    'select[id*="sponsor" i]',
    'select[name*="visa" i]',
    'select[id*="visa" i]'
  ];
  
  // Label keywords for sponsorship detection
  const SPONSORSHIP_LABEL_KEYWORDS = [
    'visa sponsorship',
    'sponsorship',
    'require sponsor',
    'need sponsor',
    'immigration sponsor'
  ];

  // ==================== Detection ====================

  function isGreenhousePage() {
    return window.location.hostname.includes('greenhouse.io') ||
           document.querySelector('#application_form') !== null;
  }

  function isGreenhouseApplicationPage() {
    // strongest signal: application form exists
    return location.hostname.includes('greenhouse.io') && !!document.querySelector('#application_form');
    // OR if you already have isApplicationPage() that correctly detects /jobs/\d+,
    // you can just return isGreenhouseHost() && isApplicationPage();
  }

  function detectFormType() {
    if (isGreenhousePage()) {
      return { type: 'greenhouse', detected: true };
    }
    
    if (window.location.hostname.includes('workday.com')) {
      return { type: 'workday', detected: true };
    }
    
    const hasApplicationForm = document.querySelector('form[action*="apply"]') ||
                                document.querySelector('input[name*="resume"]');
    
    return { type: hasApplicationForm ? 'generic' : 'unknown', detected: hasApplicationForm };
  }

  // ==================== React Select Handler ====================
  function cleanLabelText(s) {
    return (s || "")
      .replace(/\*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function labelTextForInput(el) {
    if (!el) return "";

    // 1) aria-label
    const ariaLabel = el.getAttribute?.("aria-label");
    if (ariaLabel) return cleanLabelText(ariaLabel);

    // 2) aria-labelledby (can be multiple ids)
    const labelledBy = el.getAttribute?.("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || "")
        .map(cleanLabelText)
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }

    // 3) <label for="...">
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.textContent) return cleanLabelText(lab.textContent);
    }

    // 4) nearest container label
    const container =
      el.closest(".select__container, .input-wrapper, .field, .question, .form-group") ||
      el.parentElement;
    if (container) {
      const lab = container.querySelector("label");
      if (lab?.textContent) return cleanLabelText(lab.textContent);
    }

    return "";
  }

  function matchesAnyKeyword(labelText, keywords) {
    const t = (labelText || '').toLowerCase();
    return keywords.some(k => t.includes(k.toLowerCase()));
  }

  function getInputGroupByName(name) {
    return Array.from(document.querySelectorAll(`input[name="${CSS.escape(name)}"]`));
  }

  function clickRadioByText(radios, desired) {
    const d = (desired || '').toLowerCase();
    for (const r of radios) {
      const id = r.id;
      const lab = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const txt = (lab?.textContent || '').toLowerCase();
      if (txt.includes(d)) {
        r.click();
        return true;
      }
    }
    return false;
  }

  function reactSelectHasAnySelection(inputEl) {
    const root =
      inputEl.closest('.select__control') ||
      inputEl.closest('.select__container') ||
      inputEl.closest('.select') ||
      inputEl.parentElement;

    if (!root) return false;

    // react-select single-value:
    const single = root.querySelector('.select__single-value');
    if (single && (single.textContent || '').trim()) return true;

    // react-select multi-value chips:
    const multi = root.querySelectorAll('.select__multi-value, .select__multi-value__label');
    for (const el of multi) {
      if ((el.textContent || '').trim()) return true;
    }

    return false;
  }

  async function fillByLabelKeywords(keywords, desiredValue, opts = {}) {
    if (!desiredValue) return false;
    const { skipIfSelected = false } = opts;

    // A) react-select combobox
    const comboInputs = Array.from(document.querySelectorAll('input.select__input[role="combobox"]'));
    for (const input of comboInputs) {
      const lab = labelTextForInput(input);
      if (!matchesAnyKeyword(lab, keywords)) continue;

      if (skipIfSelected && reactSelectHasAnySelection(input)) {
        continue;
      }

      const ok = await selectReactSelectValue(input, [desiredValue]);
      if (ok) return true;
    }

    // B) native select
    const selects = Array.from(document.querySelectorAll('select'));
    for (const sel of selects) {
      const lab = labelTextForInput(sel);
      if (!matchesAnyKeyword(lab, keywords)) continue;
      if (!isFieldEmpty(sel)) continue;
      const ok = fillSelectField(sel, desiredValue);
      if (ok) return true;
    }

    // C) radio group (common for yes/no)
    // heuristic: find radios in same "field" container whose label matches keywords
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const r of allRadios) {
      const container = r.closest('.field, .form-group, .question, [class*="field"], [class*="question"]') || r.parentElement;
      const containerText = (container?.innerText || '').toLowerCase();
      if (!matchesAnyKeyword(containerText, keywords)) continue;

      const group = getInputGroupByName(r.name);
      if (group.length) {
        if (clickRadioByText(group, desiredValue)) return true;
      }
    }

    // D) text input fallback
    const textInputs = Array.from(document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="url"], input:not([type])'
    ));
    for (const input of textInputs) {
      const lab = labelTextForInput(input);
      if (!matchesAnyKeyword(lab, keywords)) continue;
      if (!isFieldEmpty(input)) continue;
      const ok = fillInputField(input, desiredValue);
      if (ok) return true;
    }

    return false;
  }

  
  /**
   * Fill a React Select (combobox) field by label text
   * Two modes:
   * - Search mode (typeToSearch=true): Type value, wait for results, click best match
   * - Select mode (typeToSearch=false): Open dropdown, find best match in options, click it
   */
  async function fillReactSelectByLabel(labelKeywords, value, options = {}) {
    if (!value) return false;
    
    const { waitForAsync = false, typeToSearch = true, labelExcludes = [] } = options;
    
    log(` React Select: keywords=[${labelKeywords.join(', ')}], value="${value}", typeToSearch=${typeToSearch}`);
    
    // First, close any open dropdowns
    document.body.click();
    await new Promise(r => setTimeout(r, 200));
    
    const labels = document.querySelectorAll('label');
    let filledCount = 0;
    for (const label of labels) {
      const labelText = (label.textContent || '').toLowerCase();

      // Patch 4 (inside the loop, after labelText exists)
      if (labelExcludes.some(ex => labelText.includes((ex || '').toLowerCase()))) {
        continue;
      }

      // Check if label matches any keyword
      const matches = labelKeywords.some(kw => labelText.includes((kw || '').toLowerCase()));
      if (!matches) continue;

      log(` Found label: "${labelText.substring(0, 60)}"`);
      
      // Greenhouse: label is inside select__container, select-shell is sibling
      const selectContainer = label.parentElement;
      if (!selectContainer) continue;
      
      // Find the select-shell sibling
      const selectShell = selectContainer.querySelector('.select-shell, [class*="select-shell"]');
      
      if (!selectShell) {
        log(' No select-shell found');
        continue;
      }
      
      // Check if already has a value
      const existingValue = selectShell.querySelector('.select__single-value');
      if (existingValue && existingValue.textContent && !existingValue.textContent.includes('Select')) {
        log(' Already has value:', existingValue.textContent);
        continue;
      }
      
      // Get input for later use
      const input = selectShell.querySelector('input.select__input, input[role="combobox"]');
      const inputId = input?.id;
      log(' Input ID:', inputId);
      
      // Open dropdown using Pointer Events sequence (required for React Select)
      const control = selectShell.querySelector('.select__control') || selectShell;
      log(' Opening dropdown with pointer events');
      
      // Focus first
      if (input) input.focus();
      await new Promise(r => setTimeout(r, 100));
      
      // Get coordinates for realistic events
      const rect = control.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      // Dispatch pointer events sequence
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        const e = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse'
        });
        control.dispatchEvent(e);
      });
      
      // Wait for menu to appear
      await new Promise(r => setTimeout(r, 300));
      
      // Find the menu - it should be INSIDE our selectShell
      let menu = selectShell.querySelector('.select__menu');
      let menuOptions = menu?.querySelectorAll('.select__option') || [];
      
      log(` Menu in shell: ${!!menu}, options: ${menuOptions.length}`);
      
      // If not in shell, check if it's a portal (some React Select configs render menu outside)
      if (!menu || menuOptions.length === 0) {
        // Wait a bit more and try to find via aria
        await new Promise(r => setTimeout(r, 200));
        
        // Check aria-controls attribute
        const menuId = input?.getAttribute('aria-controls');
        if (menuId) {
          const portalMenu = document.getElementById(menuId);
          if (portalMenu) {
            menu = portalMenu.closest('.select__menu') || portalMenu;
            menuOptions = menu.querySelectorAll('.select__option');
            log(` Found via aria-controls: ${menuOptions.length} options`);
          }
        }
        
        // If still not found, look for the most recently added menu
        if (!menu || menuOptions.length === 0) {
          const allMenus = document.querySelectorAll('.select__menu');
          // Find menu that's NOT in phone-input area
          for (const m of allMenus) {
            if (m.closest('.phone-input') || m.closest('.iti')) continue;
            const opts = m.querySelectorAll('.select__option');
            // Skip if it looks like country codes
            const firstOpt = opts[0]?.textContent || '';
            if (firstOpt.includes('+') && /\+\d+$/.test(firstOpt)) continue;
            
            menu = m;
            menuOptions = opts;
            log(` Found global menu: ${menuOptions.length} options`);
            break;
          }
        }
      }
      
      // Type to search if needed
      if (typeToSearch && input && menu) {
        log(' Typing to search:', value);
        input.focus();
        
        // Clear and type
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        
        // Type value
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Wait for search results
        log(' Waiting for search results...');
        await new Promise(r => setTimeout(r, 1000));
        
        // Re-find menu options after search
        menu = selectShell.querySelector('.select__menu');
        if (!menu) {
          const allMenus = document.querySelectorAll('.select__menu');
          for (const m of allMenus) {
            if (m.closest('.phone-input') || m.closest('.iti')) continue;
            menu = m;
            break;
          }
        }
        menuOptions = menu?.querySelectorAll('.select__option') || [];
        log(` After search: ${menuOptions.length} options`);
      }
      
      // Check for no options
      const noOptionsNotice = menu?.querySelector('.select__menu-notice--no-options');
      if (noOptionsNotice || menuOptions.length === 0) {
        log(' No options available');
        // Close dropdown
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.body.click();
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      
      // Log available options
      const optionTexts = Array.from(menuOptions).map(o => o.textContent?.trim());
      log(' Options:', optionTexts.slice(0, 8));
      
      // Find best matching option
      const valueLower = value.toLowerCase().trim();
      let bestMatch = null;
      let bestScore = 0;
      
      for (const opt of menuOptions) {
        const text = opt.textContent?.trim() || '';
        const textLower = text.toLowerCase();
        
        if (!text) continue;
        
        let score = 0;
        
        // Exact match
        if (textLower === valueLower) {
          score = 100;
        }
        // Yes/No exact
        else if ((valueLower === 'yes' && textLower === 'yes') ||
                 (valueLower === 'no' && textLower === 'no')) {
          score = 100;
        }
        // Option starts with our value
        else if (textLower.startsWith(valueLower)) {
          score = 90;
        }
        // Value starts with option
        else if (valueLower.startsWith(textLower)) {
          score = 85;
        }
        // Prevent male/female substring collision (male ⊂ feMALE)
        else if (valueLower === 'male' && /\bfemale\b/i.test(textLower)) {
          score = 0; // or `continue;` if you're inside a for-loop over options
        }
        else if (valueLower === 'female' && /\bmale\b/i.test(textLower)) {
          score = 0;
        }
        // Option contains our value
        else if (textLower.includes(valueLower)) {
          score = 70;
        }
        // Gender matching
        else if (valueLower === 'female' && textLower === 'female') {
          score = 100;
        }
        else if (valueLower === 'male' && textLower === 'male') {
          score = 100;
        }
        // Key word matching for EEO fields
        else if (valueLower.includes('not') && valueLower.includes('veteran') && 
                 textLower.includes('not') && textLower.includes('veteran')) {
          score = 80;
        }
        else if (valueLower.includes('decline') && 
                 (textLower.includes('decline') || textLower.includes("don't wish") || textLower.includes('do not want'))) {
          score = 85;
        }
        else if (valueLower.includes('no') && valueLower.includes('disability') &&
                 textLower.includes('no') && textLower.includes('disability')) {
          score = 80;
        }
        // Partial word matching
        else {
          const valueWords = valueLower.split(/\s+/).filter(w => w.length > 2);
          const textWords = textLower.split(/\s+/).filter(w => w.length > 2);
          const matchCount = valueWords.filter(vw => textWords.some(tw => tw.includes(vw) || vw.includes(tw))).length;
          if (matchCount >= 2) {
            score = 40 + matchCount * 10;
          }
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = opt;
        }
      }
      
      if (bestMatch && bestScore >= 40) {
        log(` ✓ Best match: "${bestMatch.textContent?.substring(0, 50)}" (score: ${bestScore})`);
        
        // Scroll option into view
        bestMatch.scrollIntoView({ block: 'nearest' });
        await new Promise(r => setTimeout(r, 100));
        
        // Click using pointer events
        const optRect = bestMatch.getBoundingClientRect();
        const optX = optRect.left + optRect.width / 2;
        const optY = optRect.top + optRect.height / 2;
        
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
          const e = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: optX,
            clientY: optY,
            pointerId: 1,
            pointerType: 'mouse'
          });
          bestMatch.dispatchEvent(e);
        });
        
        await new Promise(r => setTimeout(r, 300));
        
        // Verify selection
        const newValue = selectShell.querySelector('.select__single-value');
        if (newValue && newValue.textContent && !newValue.textContent.includes('Select')) {
          log(' ✓ Confirmed:', newValue.textContent);
          // Close any remaining dropdowns
          document.body.click();
          await new Promise(r => setTimeout(r, 200));
          filledCount++;
          continue;
        } else {
          log(' Selection not confirmed');
        }
      } else {
        log(` ✗ No good match (best: ${bestScore})`);
      }
      
      // Close dropdown before next field
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.body.click();
      await new Promise(r => setTimeout(r, 300));
    }
    
    return filledCount > 0;
  }
  
  // ==================== Helper: Check if field is empty ====================
  
  function isFieldEmpty(element) {
    if (!element) return true;
    
    if (element.tagName === 'SELECT') {
      // For select, check if it's on the default/placeholder option
      const value = element.value;
      const selectedOption = element.options[element.selectedIndex];
      const selectedText = selectedOption ? selectedOption.text.toLowerCase() : '';
      
      // Consider empty if: no value, empty string, or placeholder-like text
      return !value || 
             value === '' || 
             selectedText.includes('select') ||
             selectedText.includes('choose') ||
             selectedText.includes('--') ||
             selectedText === '';
    } else {
      // For input/textarea
      return !element.value || element.value.trim() === '';
    }
  }

  // ==================== Phone Input Handler ====================
  
  /**
   * Fill phone input with country code selection
   * Greenhouse uses intl-tel-input library for phone, not React Select
   */
  async function fillPhoneWithCountry(phoneValue) {
    if (!phoneValue) return false;
    
    log(' Filling phone with country code:', phoneValue);
    
    // Parse phone number - extract country code and number
    let countryCode = 'us'; // default
    let phoneNumber = phoneValue;
    
    // Handle +1 format
    if (phoneValue.startsWith('+1')) {
      countryCode = 'us';
      phoneNumber = phoneValue.substring(2).trim();
    } else if (phoneValue.startsWith('+')) {
      // Other country codes - for now just strip the +
      phoneNumber = phoneValue.substring(1).trim();
    }
    
    // Remove any remaining + or leading spaces
    phoneNumber = phoneNumber.replace(/^\+/, '').trim();
    
    log(' Country:', countryCode, 'Number:', phoneNumber);
    
    // Find the phone input container
    const phoneContainer = document.querySelector('.phone-input');
    if (!phoneContainer) {
      log(' No phone-input container found, using standard fill');
      return false;
    }
    
    // Step 1: Select country using intl-tel-input
    const countryInput = phoneContainer.querySelector('input#country, input[id*="country"]');
    const countryShell = phoneContainer.querySelector('.select-shell');
    
    if (countryShell) {
      log(' Found country selector');
      
      // Check if country already selected
      const existingValue = countryShell.querySelector('.select__single-value');
      if (!existingValue || !existingValue.textContent || existingValue.textContent.includes('Select')) {
        // Open the country dropdown
        const control = countryShell.querySelector('.select__control');
        if (control && countryInput) {
          countryInput.focus();
          await new Promise(r => setTimeout(r, 100));
          
          // Use pointer events to open
          const rect = control.getBoundingClientRect();
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            control.dispatchEvent(new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
              pointerId: 1,
              pointerType: 'mouse'
            }));
          });
          
          await new Promise(r => setTimeout(r, 300));
          
          // Type to search for US
          countryInput.value = 'United States';
          countryInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          await new Promise(r => setTimeout(r, 500));
          
          // Find and click US option
          const menu = countryShell.querySelector('.select__menu') || document.querySelector('.select__menu');
          if (menu) {
            const options = menu.querySelectorAll('.select__option');
            for (const opt of options) {
              const text = opt.textContent?.toLowerCase() || '';
              if (text.includes('united states') || text.includes('+1')) {
                log(' Selecting US');
                const optRect = opt.getBoundingClientRect();
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                  opt.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: optRect.left + optRect.width / 2,
                    clientY: optRect.top + optRect.height / 2,
                    pointerId: 1,
                    pointerType: 'mouse'
                  }));
                });
                break;
              }
            }
          }
          
          await new Promise(r => setTimeout(r, 300));
          document.body.click();
          await new Promise(r => setTimeout(r, 200));
        }
      } else {
        log(' Country already selected:', existingValue.textContent);
      }
    }
    
    // Step 2: Fill the phone number
    const phoneInput = phoneContainer.querySelector('input#phone, input[name*="phone"]:not([id="country"])');
    if (phoneInput) {
      if (!phoneInput.value || phoneInput.value.trim() === '') {
        phoneInput.focus();
        phoneInput.value = phoneNumber;
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
        log(' Filled phone:', phoneNumber);
        return true;
      } else {
        log(' Phone already has value:', phoneInput.value);
      }
    }
    
    return false;
  }

  // ==================== Form Filling Helpers ====================

  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;

    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = desc && desc.set;

    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function setReactInputValue(el, value) {
    const lastValue = el.value;

    // React 16+ tracks value changes
    if (el._valueTracker) {
      el._valueTracker.setValue(lastValue);
    }

    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(el, value);

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillInputField(element, value) {
    if (!element || value == null || value === "") return false;
    if (!isFieldEmpty(element)) return false;

    element.focus();
    setReactInputValue(element, value);
    // (Optional) avoid blur if it triggers validation/reset:
    // element.blur();

    console.log(`[JobAutofill] Filled input: ${element.name || element.id || 'unknown'} = ${value}`);
    return true;
  }

  function fillSelectField(element, value) {
    if (!element || !value) return false;
    
    // IMPORTANT: Only fill if the field is currently empty/default
    if (!isFieldEmpty(element)) {
      log(` Skipping non-empty select: ${element.name || element.id || 'unknown'}`);
      return false;
    }
    
    const options = Array.from(element.options);
    const valueLower = value.toLowerCase();
    
    // Try exact match
    let match = options.find(opt => 
      opt.value.toLowerCase() === valueLower || 
      opt.text.toLowerCase() === valueLower
    );
    
    // Try partial match
    if (!match) {
      match = options.find(opt => 
        opt.value.toLowerCase().includes(valueLower) || 
        opt.text.toLowerCase().includes(valueLower) ||
        valueLower.includes(opt.value.toLowerCase()) ||
        valueLower.includes(opt.text.toLowerCase())
      );
    }
    
    // Yes/No handling
    if (!match && (valueLower === 'yes' || valueLower === 'true')) {
      match = options.find(opt => opt.text.toLowerCase().includes('yes'));
    }
    if (!match && (valueLower === 'no' || valueLower === 'false')) {
      match = options.find(opt => opt.text.toLowerCase().includes('no'));
    }
    
    // Decline handling
    if (!match && valueLower.includes('decline')) {
      match = options.find(opt => 
        opt.text.toLowerCase().includes('decline') || 
        opt.text.toLowerCase().includes('prefer not')
      );
    }
    
    if (match) {
      element.value = match.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      log(` Selected: ${match.text}`);
      return true;
    }
    return false;
  }

  // ============== Greenhouse React-Select Helpers ==================
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function normText(s) {
    return (s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/g, ' ')
      .trim();
  }

  function escapeRegExp(s) {
    return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function hasWholeWord(text, word) {
    const w = (word || '').toLowerCase().trim();
    if (!w) return false;
    return new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i').test(text);
  }

  function normalizeToken(s) {
    return (s || "").toLowerCase().trim();
  }

  function hasReactInternals(node) {
    if (!node) return false;

    // React 18/17 常见：__reactFiber$xxxx / __reactContainer$xxxx / __reactProps$xxxx
    const names = Object.getOwnPropertyNames(node);
    return names.some(k =>
      k.startsWith('__reactFiber$') ||
      k.startsWith('__reactContainer$') ||
      k.startsWith('__reactProps$') ||
      k.startsWith('__reactEvents$')
    );
  }

  async function waitForDomStable(root, { timeoutMs = 12000, stableMs = 700, pollMs = 200 } = {}) {
    const start = Date.now();
    let lastMutation = Date.now();
    let observer;

    try {
      observer = new MutationObserver(() => { lastMutation = Date.now(); });
      observer.observe(root, { subtree: true, childList: true, attributes: true });
    } catch (_) {}

    while (Date.now() - start < timeoutMs) {
      // “Stable” means: no mutations for stableMs
      if (Date.now() - lastMutation >= stableMs) {
        observer && observer.disconnect();
        return true;
      }
      await sleep(pollMs);
    }

    observer && observer.disconnect();
    return false;
  }

  async function waitForGreenhouseHydration(
    { timeoutMs = 12000, stableMs = 700, pollMs = 200 } = {}
  ) {
    const form =
      document.querySelector('#application_form') ||
      document.querySelector('form[action*="apply"]');

    if (!form) return false;

    // Wait until the form stops changing (hydration finished enough)
    const ok = await waitForDomStable(form, { timeoutMs, stableMs, pollMs });
    return ok;
  }

  function setNativeInputValue(el, value) {
    const v = String(value ?? '');

    if (!el) return;
    const tag = (el.tagName || '').toUpperCase();

    let proto = null;
    if (tag === 'TEXTAREA') proto = HTMLTextAreaElement.prototype;
    else if (tag === 'SELECT') proto = HTMLSelectElement.prototype;
    else proto = HTMLInputElement.prototype;

    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = desc && desc.set;
    if (setter) setter.call(el, v);
    else el.value = v;
  }

  function dispatchMouseLikeClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse'
      }));
    });
  }

  function isReactSelectComboboxInput(inputEl) {
    return inputEl &&
      inputEl.tagName === 'INPUT' &&
      inputEl.getAttribute('role') === 'combobox' &&
      inputEl.classList.contains('select__input');
  }

  function getReactSelectListbox(inputEl) {
    const id = inputEl?.id;
    if (!id) return null;
    return document.getElementById(`react-select-${id}-listbox`);
  }

  function getReactSelectOptions(inputEl) {
    const lb = getReactSelectListbox(inputEl);
    return lb ? Array.from(lb.querySelectorAll('[role="option"]')) : [];
  }

  function findBestOption(options, desiredValue) {
    const search = (desiredValue || '').toLowerCase().trim();
    if (!search) return { best: options[0] || null, bestScore: 0 };

    let best = null;
    let bestScore = -1;

    for (const opt of options) {
      const text = (opt.textContent || '').toLowerCase().trim();
      if (!text) continue;

      // HARD BLOCKS for male/female substring collisions
      if (search === 'male' && /\bfemale\b/i.test(text)) continue;
      if (search === 'female' && /\bmale\b/i.test(text)) continue;

      let score = 0;

      // 1) Exact
      if (text === search) score = 100;

      // 2) Whole-word match (best for "cisgender male" when searching "male")
      else if (hasWholeWord(text, search)) score = 90;

      // 3) Starts with
      else if (text.startsWith(search)) score = 80;

      // 4) Loose substring ONLY if the search is not a tiny token
      else if (search.length >= 5 && text.includes(search)) score = 50;

      if (score > bestScore) {
        bestScore = score;
        best = opt;
      } else if (score === bestScore && best) {
        // tie-breaker: prefer shorter text
        if (text.length < (best.textContent || '').length) best = opt;
      }
    }

    return { best: best || options[0] || null, bestScore: best ? bestScore : 0 };
  }

  function genderCandidates(genderValue) {
    const g = (genderValue || '').toLowerCase().trim();
    if (!g) return [];

    // Normalize common values from your side panel
    if (g === 'male' || g === 'man') {
      return ['cisgender male', 'cis male', 'male', 'man'];
    }

    if (g === 'female' || g === 'woman') {
      return ['cisgender female', 'cis female', 'female', 'woman'];
    }

    if (g.includes('non') && g.includes('binary')) {
      return ['non-binary', 'nonbinary', 'non binary'];
    }

    if (g.includes('trans')) {
      // best-effort; different companies label this differently
      return ['transgender', 'trans', genderValue];
    }

    // fallback: try the raw value first
    return [genderValue];
  }
  function getReactSelectShellFromInput(inputEl) {
    return inputEl.closest('.select-shell, [class*="select-shell"]')
        || inputEl.closest('.select__container')
        || inputEl.closest('.select')
        || inputEl.parentElement;
  }

  function reactSelectHasAnySelectionFromShell(shell) {
    if (!shell) return false;

    // single select value
    const single = shell.querySelector('.select__single-value');
    if (single && (single.textContent || '').trim() && !/select/i.test(single.textContent)) return true;

    // multi-select chips
    const chips = shell.querySelectorAll('.select__multi-value__label, .select__multi-value');
    for (const c of chips) {
      const t = (c.textContent || '').trim();
      if (t && !/select/i.test(t)) return true;
    }

    return false;
  }

  function reactSelectLooksMulti(shell) {
    // react-select commonly adds this class for multi
    if (shell?.querySelector('.select__value-container--is-multi')) return true;
    // if chips exist, it's definitely multi
    if (shell?.querySelector('.select__multi-value')) return true;
    return false;
  }

  function raceCandidates(raceValue) {
    const v = (raceValue || '').toLowerCase().trim();
    if (!v) return [];

    // If user chose an Asian subgroup, allow fallback to generic "Asian"
    if (v === 'east asian' || v === 'south asian' || v === 'southeast asian') {
      return [raceValue, 'asian'];
    }

    // Otherwise just try exact (plus common synonyms if you want later)
    return [raceValue];
  }

  async function openReactSelect(inputEl) {
    inputEl.focus();
    dispatchMouseLikeClick(inputEl);
    await sleep(40);
  }

  async function selectReactSelectValue(inputEl, candidates) {
    if (!isReactSelectComboboxInput(inputEl)) return false;
    if (!candidates?.some(Boolean)) return false;

    await openReactSelect(inputEl);

    for (const cand of candidates.filter(Boolean)) {
      setNativeInputValue(inputEl, '');
      await sleep(10);
      setNativeInputValue(inputEl, cand);
      await sleep(90);

      const options = getReactSelectOptions(inputEl);
      if (!options.length) continue;

      const { best, bestScore } = findBestOption(options, cand);
      if (!best || bestScore < 80) continue;

      best.scrollIntoView({ block: 'nearest' });
      dispatchMouseLikeClick(best);
      await sleep(80);

      if (!getReactSelectListbox(inputEl)) return true;
      if (inputEl.getAttribute('aria-expanded') === 'false') return true;
    }

    return false;
  }

  // Find field by label text
  function findFieldByLabel(labelTexts) {
    const labels = document.querySelectorAll('label, .field-label, [class*="label"]');
    
    for (const label of labels) {
      const labelText = label.textContent.toLowerCase();
      
      for (const searchText of labelTexts) {
        if (labelText.includes(searchText.toLowerCase())) {
          // Look for input/select near the label
          let container = label.closest('.field, .form-group, .question, [class*="field"]') || label.parentElement;
          
          if (container) {
            const input = container.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea');
            if (input) return input;
          }
          
          const forId = label.getAttribute('for');
          if (forId) {
            const input = document.getElementById(forId);
            if (input) return input;
          }
        }
      }
    }
    return null;
  }

  const US_STATE_CODE_BY_NAME = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO',
    'connecticut':'CT','delaware':'DE','district of columbia':'DC','florida':'FL','georgia':'GA','hawaii':'HI',
    'idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME',
    'maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY',
    'north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI',
    'south carolina':'SC','south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA',
    'washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
  };

  const CA_PROVINCE_CODE_BY_NAME = {
    'alberta':'AB','british columbia':'BC','manitoba':'MB','new brunswick':'NB','newfoundland and labrador':'NL',
    'northwest territories':'NT','nova scotia':'NS','nunavut':'NU','ontario':'ON','prince edward island':'PE','quebec':'QC',
    'saskatchewan':'SK','yukon':'YT'
  };

  function deriveStateProvinceCode(country, nameOrCode) {
    if (!nameOrCode) return '';
    const raw = String(nameOrCode).trim();
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    const key = normText(raw);
    if (country === 'Canada') return CA_PROVINCE_CODE_BY_NAME[key] || '';
    return US_STATE_CODE_BY_NAME[key] || '';
  }

  function looksLikeStateProvinceQuestion(labelText) {
    const t = normText(labelText);
    const hasRegion = t.includes('state') || t.includes('province') || t.includes('territor');
    const hasResidence = t.includes('reside') || t.includes('live') || t.includes('located') || t.includes('location');
    return hasRegion && (hasResidence || t.includes('canadian') || t.includes('u s'));
  }

  async function fillStateProvinceQuestion(userData) {
    const country = userData?.country || 'US';
    const desiredName = userData?.state || userData?.state_province || userData?.stateProvinceName;
    if (!desiredName) return false;

    const desiredCode = deriveStateProvinceCode(country, desiredName);

    // 1) Greenhouse react-select combobox inputs
    const inputs = Array.from(document.querySelectorAll('input.select__input[role="combobox"]'));
    for (const input of inputs) {
      const labelId = input.getAttribute('aria-labelledby');
      const labelEl = labelId ? document.getElementById(labelId) : null;
      const labelText = labelEl?.textContent || '';
      if (!looksLikeStateProvinceQuestion(labelText)) continue;

      // 如果已经选过，Greenhouse 会显示 .select__single-value
      const hasSelectedValue = Boolean(input.closest('.select__value-container')?.querySelector('.select__single-value'));
      if (hasSelectedValue) return false;

      const ok = await selectReactSelectValue(input, [desiredName, desiredCode]);
      if (ok) return true;
    }

    return false;
  }

  function isVisibleInteractive(el) {
    if (!el) return false;
    if (el.disabled) return false;

    // input type=hidden
    const type = (el.getAttribute?.('type') || '').toLowerCase();
    if (type === 'hidden') return false;

    // hidden by attributes
    if (el.closest?.('[hidden], [aria-hidden="true"]')) return false;

    // hidden by CSS
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    // zero-size
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width < 2 || rect.height < 2) return false;

    return true;
  }

  function elementArea(el) {
    const r = el.getBoundingClientRect?.();
    return (r?.width || 0) * (r?.height || 0);
  }

  // ==================== Main Fill Functions ====================

  function fillField(fieldName, value, mappings) {
    if (!value) return false;
    
    const selectors = mappings[fieldName] || [];
    
    // Try standard selectors first
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        // Prefer visible/interactive elements (Greenhouse often has hidden duplicates)
        const uniq = Array.from(new Set(elements));
        const visibles = uniq
          .filter(isVisibleInteractive)
          .sort((a, b) => elementArea(b) - elementArea(a));

        const candidates = visibles.length ? visibles : uniq;
        for (const element of candidates) {
          if (element) {
            if (element.tagName === 'SELECT') {
              if (fillSelectField(element, value)) return true;
            } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
              if (fillInputField(element, value)) return true;
            }
          }
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
        
    // Try label-based detection
    const labelTexts = LABEL_MAPPINGS[fieldName];
    if (labelTexts) {
      const field = findFieldByLabel(labelTexts);
      if (field) {
        if (field.tagName === 'SELECT') {
          return fillSelectField(field, value);
        } else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
          return fillInputField(field, value);
        }
      }
    }
    
    return false;
  }

  async function fillEEOFields(userData) {
    const results = [];
    
    log(' Filling EEO fields...');
    
    // EEO fields config: name, label keywords, value
    // EEO fields have fixed options, so we DON'T type to search - just open and select
    const eeoFieldsConfig = [
      { name: 'gender', keywords: ['gender'], exclude: ['gender identity', 'identify your gender'], candidates: genderCandidates(userData.gender) },
      { name: 'gender_identity', keywords: ['gender identity', 'identify your gender'], candidates: genderCandidates(userData.gender) },
      { name: 'hispanic_latino', keywords: ['hispanic', 'latino'], value: userData.hispanic_latino },
      { name: 'veteran_status', keywords: ['veteran'], value: userData.veteran_status },
      { name: 'disability_status', keywords: ['disability'], value: userData.disability_status }
    ];
    
    for (const field of eeoFieldsConfig) {
      const valuesToTry = field.candidates?.length ? field.candidates : [field.value];
      if (!valuesToTry.some(Boolean)) continue;

      for (const v of valuesToTry.filter(Boolean)) {
        // IMPORTANT: pass exclude phrases down (next patch)
        const ok = await fillReactSelectByLabel(field.keywords, v, {
          typeToSearch: false,
          labelExcludes: field.exclude || []
        });
        if (ok) { results.push(field.name); break; }
      }

      await new Promise(r => setTimeout(r, 300));
    }
    
    return results;
  }

  async function fillSimpleGenderSelect(userData) {
    const gender = userData?.gender;
    if (!gender) return false;

    const input = document.getElementById('gender');
    if (!input) return false;

    // Don’t overwrite if already selected
    const hasSelected = Boolean(
      input.closest('.select__value-container')?.querySelector('.select__single-value')
    );
    if (hasSelected) return false;

    return await selectReactSelectValue(input, genderCandidates([gender]));
  }

    async function fillRaceEthnicityAll(userData) {
    const raceVal = (userData.race_ethnicity || '').trim();
    if (!raceVal) return false;
    if (raceVal.toLowerCase() === 'prefer not to say') return false;

    const candidates = raceCandidates(raceVal); // e.g. ["East Asian", "Asian"]
    const keywords = ['race', 'ethnicity', 'race/ethnicity', 'identify your race'];

    let filledCount = 0;

    // React-select comboboxes
    const comboInputs = Array.from(document.querySelectorAll('input.select__input[role="combobox"], input[role="combobox"]'));

    for (const input of comboInputs) {
      const lab = labelTextForInput(input);
      if (!matchesAnyKeyword(lab, keywords)) continue;

      const shell = getReactSelectShellFromInput(input);

      // Rule: never touch a MULTI-select race field again once it has any selection
      if (reactSelectLooksMulti(shell) && reactSelectHasAnySelectionFromShell(shell)) {
        continue;
      }

      // also skip any already-filled single-select (safe)
      if (!reactSelectLooksMulti(shell) && reactSelectHasAnySelectionFromShell(shell)) {
        continue;
      }

      // Per-widget fallback: try East Asian, then Asian (within this SAME widget)
      const ok = await selectReactSelectValue(input, candidates);
      if (ok) filledCount++;
    }

    return filledCount > 0;
  }

  async function fillEducationFields(userData) {
    const results = [];
    
    log(' Filling Education fields...');
    
    // School field - async API, type to search
    if (userData.school) {
      log(` Filling School: ${userData.school}`);
      if (await fillReactSelectByLabel(['school'], userData.school, { 
        waitForAsync: true,
        typeToSearch: true  // Type to search API
      })) {
        results.push('school');
        await new Promise(r => setTimeout(r, 400));
      }
    }
    
    // Degree field - fixed options, don't type
    if (userData.degree) {
      log(` Filling Degree: ${userData.degree}`);
      if (await fillReactSelectByLabel(['degree'], userData.degree, {
        typeToSearch: false  // Fixed options
      })) {
        results.push('degree');
        await new Promise(r => setTimeout(r, 400));
      }
    }
    
    // Discipline field - may be async
    if (userData.discipline) {
      log(` Filling Discipline: ${userData.discipline}`);
      if (await fillReactSelectByLabel(['discipline', 'major'], userData.discipline, {
        waitForAsync: true,
        typeToSearch: true  // Type to search API
      })) {
        results.push('discipline');
        await new Promise(r => setTimeout(r, 400));
      }
    }
    
    // Standard input fields (Start year, End year)
    const standardFields = {
      'edu_start_year': userData.edu_start_year,
      'edu_end_year': userData.edu_end_year
    };
    
    for (const [fieldName, value] of Object.entries(standardFields)) {
      if (!value) continue;
      
      if (fillField(fieldName, value, FIELD_MAPPINGS)) {
        results.push(fieldName);
      } else {
        // Try React Select for year fields too (fixed options)
        const keywords = fieldName.includes('start') ? ['start date year', 'start year'] : ['end date year', 'end year'];
        if (await fillReactSelectByLabel(keywords, value, { typeToSearch: false })) {
          results.push(fieldName);
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
    
    return results;
  }

  function fillAuthorizedField() {
    // Strategy 1: native <select>
    for (const selector of AUTHORIZED_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (!isFieldEmpty(element)) return false;

        const options = Array.from(element.options);
        const yesOption = options.find(opt =>
          (opt.text || '').toLowerCase().includes('yes') || (opt.value || '').toLowerCase() === 'yes'
        );

        if (yesOption) {
          element.value = yesOption.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          log(' Authorized: Yes (native select)');
          return true;
        }
      }
    }

    // Strategy 2: Greenhouse react-select (combobox)
    // Note: this is async, but we can “fire and forget” if you keep function sync,
    // OR (better) make the caller await it. I recommend the await approach below.
    return false;
  }

  async function fillSponsorshipField(needsSponsorship) {
    log(` Filling sponsorship field, needs sponsorship: ${needsSponsorship}`);
    
    // Strategy 1: Try standard select elements first
    for (const selector of SPONSORSHIP_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element) {
          if (!isFieldEmpty(element)) {
            log(' Sponsorship field already filled, skipping');
            return false;
          }
          
          const options = Array.from(element.options);
          const targetValue = needsSponsorship ? 'yes' : 'no';
          
          let match = options.find(opt => opt.text.toLowerCase().includes(targetValue));
          
          if (match) {
            element.value = match.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            log(` Sponsorship (standard select): ${needsSponsorship ? 'Yes' : 'No'}`);
            return true;
          }
        }
      }
    }
    
    // Strategy 2: Use React Select handler (Yes/No are fixed options)
    const sponsorshipKeywords = ['visa sponsor', 'sponsorship', 'require sponsor'];
    const value = needsSponsorship ? 'Yes' : 'No';
    
    return await fillReactSelectByLabel(sponsorshipKeywords, value, { typeToSearch: false });
  }

  // ==================== File Upload ====================

  async function uploadFile(fileData, inputElement) {
    if (!fileData || !fileData.content) {
      log(' No file data to upload');
      return false;
    }
    if (!inputElement) {
      log(' No input element provided');
      return false;
    }
    
    // Check if file already uploaded
    if (inputElement.files && inputElement.files.length > 0) {
      log(' File already uploaded to this input, skipping');
      return false;
    }
    
    try {
      log(` Attempting to upload: ${fileData.filename}`);
      
      const byteCharacters = atob(fileData.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: fileData.mimeType || 'application/pdf' });
      const file = new File([blob], fileData.filename || 'document.pdf', { 
        type: fileData.mimeType || 'application/pdf' 
      });
      
      log(` Created file object: ${file.name}, size: ${file.size}`);
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      // Set files
      inputElement.files = dataTransfer.files;
      
      log(` Set files on input, now has ${inputElement.files.length} file(s)`);
      
      // Trigger events
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Small delay then verify
      await new Promise(r => setTimeout(r, 100));
      
      if (inputElement.files && inputElement.files.length > 0) {
        log(` SUCCESS: Uploaded ${fileData.filename}`);
        return true;
      } else {
        log(' Upload may have failed - input.files is empty after setting');
        return false;
      }
    } catch (error) {
      logError(' Upload error:', error);
      return false;
    }
  }

  async function uploadResume(resumeData) {
    if (!resumeData || !resumeData.content) return false;
    
    log(' Starting resume upload...');
    
    const fileInputs = document.querySelectorAll('input[type="file"]');
    log(` Found ${fileInputs.length} file input(s)`);
    
    // Find the resume file input by walking up the DOM
    for (const input of fileInputs) {
      // Skip if already has file
      if (input.files && input.files.length > 0) {
        log(' Input already has file, skipping');
        continue;
      }
      
      // Walk up the DOM to find context (up to 10 levels now)
      let parent = input.parentElement;
      let isResumeInput = false;
      let isCoverLetterInput = false;
      
      for (let depth = 0; depth < 10 && parent; depth++) {
        const parentText = (parent.textContent || '').toLowerCase();
        
        // Check for resume/cv keywords
        if (parentText.includes('resume') || parentText.includes('cv')) {
          isResumeInput = true;
          log(` Found resume/cv at depth ${depth}`);
        }
        
        // Check if this is actually a cover letter section
        if (parentText.includes('cover letter')) {
          isCoverLetterInput = true;
        }
        
        parent = parent.parentElement;
      }
      
      // If this input is in resume section (and not cover letter), use it
      if (isResumeInput && !isCoverLetterInput) {
        log(' Uploading resume to detected input');
        if (await uploadFile(resumeData, input)) {
          return true;
        }
      }
    }
    
    // Fallback: if only one file input exists, try it for resume
    const availableInputs = Array.from(fileInputs).filter(input => 
      !input.files || input.files.length === 0
    );
    
    if (availableInputs.length >= 1) {
      // Check if first input is NOT in cover letter section
      let firstInput = availableInputs[0];
      let parent = firstInput.parentElement;
      let isCoverLetter = false;
      
      for (let depth = 0; depth < 10 && parent; depth++) {
        const parentText = (parent.textContent || '').toLowerCase();
        // Only mark as cover letter if it explicitly says "cover letter" and NOT resume
        if (parentText.includes('cover letter') && !parentText.includes('resume')) {
          isCoverLetter = true;
          break;
        }
        parent = parent.parentElement;
      }
      
      if (!isCoverLetter) {
        log(' Using first available file input for resume');
        if (await uploadFile(resumeData, firstInput)) {
          return true;
        }
      }
    }
    
    log(' Failed to find suitable input for resume');
    return false;
  }

  async function uploadCoverLetter(coverLetterData) {
    if (!coverLetterData || !coverLetterData.content) return false;
    
    log(' Starting cover letter upload...');
    
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    // Find the cover letter file input by walking up the DOM
    for (const input of fileInputs) {
      if (input.files && input.files.length > 0) {
        continue;
      }
      
      let parent = input.parentElement;
      let isCoverLetterInput = false;
      let isResumeInput = false;
      
      for (let depth = 0; depth < 10 && parent; depth++) {
        const parentText = (parent.textContent || '').toLowerCase();
        
        if (parentText.includes('cover letter') || parentText.includes('cover_letter')) {
          isCoverLetterInput = true;
        }
        
        // Check if this is specifically a resume section (not cover letter)
        if ((parentText.includes('resume') || parentText.includes('cv')) && 
            !parentText.includes('cover')) {
          isResumeInput = true;
        }
        
        parent = parent.parentElement;
      }
      
      // If this input is in cover letter section (and not resume-only), use it
      if (isCoverLetterInput && !isResumeInput) {
        log(' Uploading cover letter to detected input');
        if (await uploadFile(coverLetterData, input)) {
          return true;
        }
      }
    }
    
    log(' Failed to find suitable input for cover letter');
    return false;
  }

  // ==================== Main Autofill ====================

  async function performAutofill(userData, resumeData, coverLetterData) {
    const results = {
      filled: [],
      skipped: [],  // Fields that were already filled
      failed: [],
      resumeUploaded: false,
      coverLetterUploaded: false
    };
    
    log(' Starting autofill (will not overwrite existing values)');

    console.log("[AUTOFILL] performAutofill start", {
      url: location.href,
      userKeys: Object.keys(userData || {}),
    });
    
    // Prepare data
    const dataToFill = { ...userData };
    if (dataToFill.phone_full) {
      dataToFill.phone = dataToFill.phone_full;
    }
    
    // Fill standard fields (excluding phone - handled separately)
    const standardFields = [
      'first_name', 'last_name', 'preferred_first_name', 'email',
      'current_company',
      'linkedin', 'github', 'website'
    ];

    const BASIC_LABEL_KEYWORDS = {
      first_name: ['first name'],
      last_name: ['last name'],
      preferred_first_name: ['preferred first', 'preferred name'],
      email: ['email'],
      linkedin: ['linkedin'],
      github: ['github'],
      website: ['portfolio', 'website', 'personal website'],
      current_company: ['current company', 'company'],
    };
    
    for (const fieldName of standardFields) {
      const value = dataToFill[fieldName];
      if (!value) continue;

      let ok = fillField(fieldName, value, FIELD_MAPPINGS);

      // Fallback: fill by label text (more robust on Greenhouse)
      if (!ok && BASIC_LABEL_KEYWORDS[fieldName]) {
        ok = await fillByLabelKeywords(BASIC_LABEL_KEYWORDS[fieldName], value);
      }

      if (ok) results.filled.push(fieldName);
    }
    
    // Handle phone separately with country code
    if (dataToFill.phone) {
      if (await fillPhoneWithCountry(dataToFill.phone)) {
        results.filled.push('phone');
      }
    }
    
    // Fill education fields
    const eduResults = await fillEducationFields(dataToFill);
    results.filled.push(...eduResults);
    
    // Fill EEO fields
    const eeoResults = await fillEEOFields(dataToFill);
    results.filled.push(...eeoResults);
    
    // Work authorization - always Yes
    if (fillAuthorizedField()) {
      results.filled.push('authorized');
    } else {
      const ok = await fillReactSelectByLabel(
        ['legally authorized to work', 'authorized to work', 'eligible to work'],
        'Yes',
        { typeToSearch: false }
      );
      if (ok) results.filled.push('authorized');
    }

    // Sponsorship - based on user's status
    const needsSponsorship = userData.needs_sponsorship !== false;
    if (await fillSponsorshipField(needsSponsorship)) {
      results.filled.push('sponsorship');
    }

    if (await fillStateProvinceQuestion(userData)) {
      results.filled.push('state_province');
    }

    if (await fillSimpleGenderSelect(userData)) {
      results.filled.push('gender');
    }

    // Pronouns (often a custom question at the top, react-select)
    if (userData.pronouns) {
      const ok = await fillReactSelectByLabel(['pronouns'], userData.pronouns, { typeToSearch: false });
      if (ok) results.filled.push('pronouns');
    }

    // LGBTQ+
    if (userData.lgbtq) {
      const ok = await fillByLabelKeywords(
        ['lgbtq', 'lgbtq+', 'sexual orientation', 'identify as lgbtq', 'lgbt'],
        userData.lgbtq
      );
      if (ok) results.filled.push('lgbtq');
    }

    // Race / Ethnicity
    await fillRaceEthnicityAll(userData);
    
    // Upload documents (won't re-upload if already uploaded)
    if (resumeData) {
      results.resumeUploaded = await uploadResume(resumeData);
    }
    if (coverLetterData) {
      results.coverLetterUploaded = await uploadCoverLetter(coverLetterData);
    }
    
    log(' Results:', results);
    return results;
  }
  
  // Expose for AutoRun / debug (scope-safe)
  try {
    window.__JOB_AUTOFILL__ = window.__JOB_AUTOFILL__ || {};
    Object.assign(window.__JOB_AUTOFILL__, {
      performAutofill,
      uploadResume,
      uploadCoverLetter,
      fillInputField,
      fillReactSelectByLabel,
      fillByLabelKeywords,
      showNotificationBanner,
      updateNotificationBanner,
    });
  } catch (e) {}

  // ==================== Message Listener ====================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'DETECT_FORM':
        sendResponse(detectFormType());
        break;
        
      case 'AUTOFILL':
        performAutofill(message.userData, message.resumeData, message.coverLetterData).then(results => {
          sendResponse(results);
        }).catch(err => {
          console.error("[JobAutofill] performAutofill crashed:", err);
          sendResponse({ filled: [], error: String(err?.message || err) });
        });
        return true;
        
      case 'PING':
        sendResponse({ status: 'ready', formType: detectFormType() });
        break;
        
      default:
        log(' Unknown message:', message.type);
    }
  });

  // ==================== Initialize ====================

  const formType = detectFormType();
  if (formType.detected) {
    setTimeout(showNotificationBanner('supported'), 500);
  }

  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href });
  log(' Content script loaded on:', window.location.href);
  


// ====================  AUTO-RUN on Greenhouse pages
function pageRunKey() {
  // One run per URL (prevents repeated uploads/fills on same page)
  return `jobautofill_done:${location.href}`;
}

async function waitForFormReady({ maxTries = 30, delayMs = 400 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const hasSomethingToFill =
      document.querySelector('#application_form') ||
      document.querySelector('form[action*="apply"]') ||
      document.querySelector('input[id^="question_"]') ||
      document.querySelector('input.select__input[role="combobox"]') ||
      document.querySelector('input[type="file"]');

    if (hasSomethingToFill) return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

function isAutofillTargetPage() {
  const host = window.location.hostname;
  const path = window.location.pathname;

  // Greenhouse: URL contains /jobs/<number>
  if (host.includes('greenhouse.io') && /\/jobs\/\d+/.test(path)) return true;

  // Generic: application form exists
  return document.querySelector('#application_form') !== null ||
         document.querySelector('form[action*="apply"]') !== null;
}

function basicFieldsStillEmpty(userData) {
  if (!userData) return false;

  const checks = [
    ['first_name', 'input#first_name, input[name="first_name"]'],
    ['last_name',  'input#last_name,  input[name="last_name"]'],
    ['email',      'input#email,      input[name="email"]'],
  ];

  return checks.some(([k, sel]) => {
    const want = userData[k];
    if (!want) return false;
    const el = document.querySelector(sel);
    return el && isFieldEmpty(el);
  });
}

function installOneShotPostHydrationRetry({ userData, resumeData, coverLetterData, delayMs = 1800 } = {}) {
  if (window.__JOB_AUTOFILL_POST_RETRY_DONE__) return;
  window.__JOB_AUTOFILL_POST_RETRY_DONE__ = true;

  const run = async (reason) => {
    if (!basicFieldsStillEmpty(userData)) return;
    log(`[JobAutofill][AutoRun] post-hydration retry (${reason})...`);
    try {
      await performAutofill(userData, resumeData, coverLetterData);
    } catch (e) {
      console.warn('[JobAutofill][AutoRun] post-hydration retry failed', e);
    }
  };

  // timer retry
  setTimeout(() => run('timer'), delayMs);

  // first user gesture retry
  const handler = () => {
    window.removeEventListener('pointerdown', handler, true);
    window.removeEventListener('keydown', handler, true);
    window.removeEventListener('scroll', handler, true);
    run('user-gesture');
  };

  window.addEventListener('pointerdown', handler, true);
  window.addEventListener('keydown', handler, true);
  window.addEventListener('scroll', handler, true);
}


async function autoRunIfEnabled() {
  console.log('[JobAutofill][AutoRun] entered', location.href);
  try {
    if (!isAutofillTargetPage()) return;

    const key = pageRunKey();
    if (sessionStorage.getItem(key) === '1') return;

    const { autoFillEnabled = true, userData, resumeData, coverLetterData } =
      await chrome.storage.local.get(['autoFillEnabled', 'userData', 'resumeData', 'coverLetterData']);

    // 只有明确设置为 false 才禁用；undefined 视为开启（兼容旧数据）
    if (autoFillEnabled === false) return;
    if (!userData) return;

    const ready = await waitForFormReady();
    if (!ready) return;
    updateNotificationBanner('running');

    // Greenhouse React hydration guard (prevents “filled then erased” + hydration errors)
    if (isGreenhouseApplicationPage()) {
      const ok = await waitForGreenhouseHydration({ timeoutMs: 20000, stableMs: 1000, pollMs: 200 });
      if (!ok) {
        if (DEBUG) console.debug('[JobAutofill][AutoRun] form not settled in time; continue in safe mode');
      }
      await sleep(400); // small buffer
    }

    // Mark as done BEFORE running to avoid double-runs
    sessionStorage.setItem(key, '1');

    console.log('[JobAutofill] Auto-run starting...', location.href);
    const result = await performAutofill(userData, resumeData, coverLetterData);

    if (location.hostname.includes('greenhouse.io')) {
      installOneShotPostHydrationRetry({ userData, resumeData, coverLetterData });
    }

    const filledCount = Array.isArray(result?.filled) ? result.filled.length : 0;
    const resumeOk = !!result?.resumeUploaded;

    if (filledCount > 0 || resumeOk) {
      window.__JOB_AUTOFILL__?.updateNotificationBanner?.('success', {
        filledCount,
        resumeUploaded: !!result?.resumeUploaded,
        coverLetterUploaded: !!result?.coverLetterUploaded
      });
    } else {
      window.__JOB_AUTOFILL__?.updateNotificationBanner?.('error', {
        message: 'Auto-fill ran, but nothing was filled.'
      });
    }
  } catch (err) {
    console.error('[JobAutofill] Auto-run failed:', err);
    window.__JOB_AUTOFILL__?.updateNotificationBanner?.('error', {
      message: `Auto-run failed: ${String(err?.message || err)}`
    });
  }
}

// Run once on initial load
console.log('[JobAutofill][AutoRun] calling...');
autoRunIfEnabled().catch(e => console.error('[JobAutofill][AutoRun] crashed', e));

// Handle URL changes (SPA-ish navigation / consecutive job pages in same tab)
(function watchUrlChanges() {
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      autoRunIfEnabled().catch(e =>
        console.error('[JobAutofill][AutoRun] crashed (url change)', e)
      );
    }
  }, 800);
})();
})();
