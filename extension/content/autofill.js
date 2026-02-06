// Content Script - Autofill logic for job application forms
// Injected into Greenhouse and other job application pages

(function() {
  'use strict';

  // ==================== Configuration ====================
  
  // Set to false for production
  const DEBUG = true;
  
  // Conditional logging - only logs when DEBUG is true
  const log = (...args) => { if (DEBUG) console.log('[JobAutofill]', ...args); };
  const logError = (...args) => { console.error('[JobAutofill]', ...args); };

  // Prevent multiple injections
  if (window.__jobAutofillLoaded) return;
  window.__jobAutofillLoaded = true;

  // Global upload state - once true, stays true (survives retries)
  let __resumeUploadedOnce = false;
  let __coverLetterUploadedOnce = false;

  // ==================== In-Page Notification ====================
  
  // Persistent "Supported" Banner (no auto-dismiss) ----------
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
    // top-right (instead of bottom-right)
    notif.style.top = '16px';
    notif.style.right = '16px';
    notif.style.bottom = 'auto';
    notif.style.left = 'auto';

    notif.style.padding = '12px 14px';
    notif.style.borderRadius = '12px';
    notif.style.border = '1px solid #558ae0';
    notif.style.backgroundColor = '#ecf3ff';
    notif.style.color = '#1e3a5f';
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
                  background:#558ae0; color:white;">
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

    // Theme by state - all use same light blue background for consistency
    const theme = {
      supported: { border: '#558ae0', bg: '#ecf3ff', fg: '#1e3a5f' },
      running:   { border: '#8faee0', bg: '#ecf3ff', fg: '#1e3a5f' },
      success:   { border: '#558ae0', bg: '#ecf3ff', fg: '#1e3a5f' },
      error:     { border: '#ef4444', bg: '#fef2f2', fg: '#7f1d1d' }
    }[__jobAutofillBannerState] || { border: '#558ae0', bg: '#ecf3ff', fg: '#1e3a5f' };

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
  // ==================== Phase 0: Scan unanswered questions ====================

  function isVisibleElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function reactSelectMetaFromShell(shell) {
    const isMulti = !!shell.querySelector('.select__multi-value');
    const single = shell.querySelector('.select__single-value');
    const placeholder = shell.querySelector('.select__placeholder');
    const selectedText =
      isMulti
        ? Array.from(shell.querySelectorAll('.select__multi-value__label')).map(x => cleanText(x.textContent)).filter(Boolean)
        : (single ? cleanText(single.textContent) : '');
    const hasSelection = isMulti ? selectedText.length > 0 : (!!selectedText && !/select/i.test(selectedText));
    const placeholderText = cleanText(placeholder?.textContent || '');
    return { isMulti, hasSelection, selectedText, placeholderText };
  }

  // --- helpers ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return !!(rect.width && rect.height) && getComputedStyle(el).visibility !== "hidden";
  }

  function getReactSelectRows(results) {
    return (results || []).map((q, idx) => ({
      label: q.label,
      value: q.key || `${idx}|${q.label}`,
      data: q,
    }));
  }

  // Open a specific react-select and collect options via aria-controls
  async function collectReactSelectOptionsFromShell(shell, { maxPreview = 30, timeoutMs = 1500, pollMs = 80 } = {}) {
    try {
      const input =
        shell?.querySelector('input.select__input[role="combobox"]') ||
        shell?.querySelector('input[role="combobox"]') ||
        null;

      if (!input) {
        return { optionsCount: 0, optionsPreview: [], optionsHint: 'no-combobox-input' };
      }

      // 打开 dropdown(pointer sequence 更稳定)
      const control =
        shell.querySelector('.select__control') ||
        shell.querySelector('[class*="select__control"]') ||
        shell;

      // focus
      input.focus();
      await new Promise(r => setTimeout(r, 30));

      // click (pointer events)
      const rect = control.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        const e = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
        });
        control.dispatchEvent(e);
      });

      // 等待 options 出现(很多网站打开后异步渲染)
      // React-Select may render menu as a portal to <body>, not inside shell
      const start = Date.now();
      let options = [];
      let listbox = null;

      while (Date.now() - start < timeoutMs) {
        // Strategy 1: aria-controls points to listbox
        const listboxId = input.getAttribute('aria-controls');
        if (listboxId) {
          listbox = document.getElementById(listboxId);
        }
        
        // Strategy 2: menu inside shell
        if (!listbox) {
          listbox = shell.querySelector('[role="listbox"]') ||
                    shell.querySelector('.select__menu');
        }
        
        // Strategy 3: portal - find the most recently rendered menu in body
        // (React-Select often portals to body for z-index reasons)
        if (!listbox) {
          const allMenus = document.querySelectorAll('.select__menu, [role="listbox"]');
          for (const menu of allMenus) {
            // Skip menus that are inside phone-input (country selector)
            if (menu.closest('.phone-input, .iti')) continue;
            // Check if menu is visible
            const rect = menu.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              listbox = menu;
              break;
            }
          }
        }

        if (listbox) {
          options = Array.from(
            listbox.querySelectorAll('[role="option"], .select__option')
          )
            .map(o => (o.textContent || '').trim())
            .filter(Boolean);
        }

        if (options.length > 0) break;
        await new Promise(r => setTimeout(r, pollMs));
      }

      // 一些 React-Select 会渲染 no-options notice
      let hint = '';
      const noOpt =
        (listbox && listbox.querySelector('.select__menu-notice--no-options')) ||
        (listbox && listbox.querySelector('[class*="menu-notice"]')) ||
        null;
      if (noOpt) hint = (noOpt.textContent || '').trim();

      // 去重 + 截断 preview
      const uniq = [];
      const seen = new Set();
      for (const t of options) {
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(t);
        if (uniq.length >= maxPreview) break;
      }

      // 关闭 dropdown
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.body.click();

      return {
        optionsCount: options.length,
        optionsPreview: uniq,
        optionsHint: hint || (options.length ? 'ok' : 'no-options'),
        optionsListboxId: listbox?.id || null,
      };
    } catch (e) {
      return { optionsCount: 0, optionsPreview: [], optionsHint: `error:${String(e?.message || e)}` };
    }
  }

  // ==================== Scan Unanswered Questions ====================
  // Strategy: directly iterate all control types (like fillReactSelectByLabel does)
  // instead of relying on .field/.question block structure
  
  async function scanUnansweredQuestions({ includeOptions = true, maxOptionsPreview = 30, asReactSelectRows = true } = {}) {
    const results = [];
    const seenLabels = new Set();
    
    // Note: We no longer skip labels based on keywords like "country", "city" etc.
    // The function already checks if fields are empty/unanswered, so only truly
    // unanswered questions will be included. This fixes the bug where questions
    // like "Which country in the UK do you reside in?" were skipped because
    // they contained "country", even though they weren't filled.
    
    // Helper: check if label should be skipped (only skip file upload labels)
    const SKIP_LABELS = ['resume', 'cover letter'];
    function shouldSkipLabel(label) {
      const l = (label || '').toLowerCase();
      return SKIP_LABELS.some(skip => l.includes(skip));
    }
    
    // Helper: extract clean label and check required
    function processLabel(rawLabel) {
      const label = (rawLabel || '').replace(/\*\s*$/, '').trim();
      const required = (rawLabel || '').includes('*');
      return { label, required };
    }
    
    log(' Scanning unanswered questions...');
    
    // ========== 1. Scan all React-Select comboboxes ==========
    const comboboxes = document.querySelectorAll('input.select__input[role="combobox"], input[role="combobox"]');
    log(` Found ${comboboxes.length} combobox inputs`);
    
    for (const input of comboboxes) {
      if (!isVisibleElement(input)) continue;
      
      // Get label using the proven method
      const rawLabel = labelTextForInput(input);
      if (!rawLabel) continue;
      
      const { label, required: requiredFromLabel } = processLabel(rawLabel);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      if (shouldSkipLabel(label)) continue;
      
      // Check if already answered
      const shell = getReactSelectShellFromInput(input);
      if (reactSelectHasAnySelectionFromShell(shell)) continue;
      
      seenLabels.add(label.toLowerCase());
      
      const required = requiredFromLabel || 
                       input.getAttribute('aria-required') === 'true' ||
                       input.required === true;
      const isMulti = reactSelectLooksMulti(shell);
      
      // Collect options by opening the dropdown (the proven method)
      let options = [];
      if (includeOptions) {
        const optMeta = await collectReactSelectOptionsFromShell(shell, {
          maxPreview: maxOptionsPreview,
        });
        options = optMeta.optionsPreview || [];
      }
      
      results.push({
        label,
        kind: 'react-select',
        required,
        isMulti,
        options,
        optionsCount: options.length,
        elementId: input.id || null,
        elementName: input.name || null,
      });
      
      log(` [react-select] "${label}" - ${options.length} options`);
    }
    
    // ========== 2. Scan all textareas (main target for AI answers) ==========
    const textareas = document.querySelectorAll('textarea');
    log(` Found ${textareas.length} textareas`);
    
    for (const ta of textareas) {
      if (!isVisibleElement(ta)) continue;
      if (ta.value && ta.value.trim()) continue; // Already filled
      
      const rawLabel = labelTextForInput(ta);
      if (!rawLabel) continue;
      
      const { label, required: requiredFromLabel } = processLabel(rawLabel);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      if (shouldSkipLabel(label)) continue;
      
      seenLabels.add(label.toLowerCase());
      
      const required = requiredFromLabel ||
                       ta.getAttribute('aria-required') === 'true' ||
                       ta.required === true;
      
      results.push({
        label,
        kind: 'textarea',
        required,
        placeholder: ta.placeholder || null,
        elementId: ta.id || null,
        elementName: ta.name || null,
      });
      
      log(` [textarea] "${label}"`);
    }
    
    // ========== 3. Scan native <select> elements ==========
    const selects = document.querySelectorAll('select');
    log(` Found ${selects.length} native selects`);
    
    for (const sel of selects) {
      if (!isVisibleElement(sel)) continue;
      if (!isFieldEmpty(sel)) continue;
      
      const rawLabel = labelTextForInput(sel);
      if (!rawLabel) continue;
      
      const { label, required: requiredFromLabel } = processLabel(rawLabel);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      if (shouldSkipLabel(label)) continue;
      
      seenLabels.add(label.toLowerCase());
      
      const required = requiredFromLabel ||
                       sel.getAttribute('aria-required') === 'true' ||
                       sel.required === true;
      
      // Collect options from native select
      const options = Array.from(sel.options)
        .map(o => o.text.trim())
        .filter(t => t && !/^(select|choose|--|please)/i.test(t))
        .slice(0, maxOptionsPreview);
      
      results.push({
        label,
        kind: 'select',
        required,
        options,
        optionsCount: options.length,
        elementId: sel.id || null,
        elementName: sel.name || null,
      });
      
      log(` [select] "${label}" - ${options.length} options`);
    }
    
    // ========== 4. Scan text inputs (excluding react-select internal inputs) ==========
    const textInputs = document.querySelectorAll(
      'input[type="text"], input[type="url"], input:not([type])'
    );
    log(` Found ${textInputs.length} text inputs`);
    
    for (const inp of textInputs) {
      // Skip react-select internal inputs
      if (inp.classList.contains('select__input')) continue;
      if (inp.getAttribute('role') === 'combobox') continue;
      
      if (!isVisibleElement(inp)) continue;
      if (inp.value && inp.value.trim()) continue;
      
      const rawLabel = labelTextForInput(inp);
      if (!rawLabel) continue;
      
      const { label, required: requiredFromLabel } = processLabel(rawLabel);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      if (shouldSkipLabel(label)) continue;
      
      seenLabels.add(label.toLowerCase());
      
      const required = requiredFromLabel ||
                       inp.getAttribute('aria-required') === 'true' ||
                       inp.required === true;
      
      results.push({
        label,
        kind: 'input',
        inputType: inp.type || 'text',
        required,
        placeholder: inp.placeholder || null,
        elementId: inp.id || null,
        elementName: inp.name || null,
      });
      
      log(` [input] "${label}"`);
    }
    
    // ========== 5. Scan radio groups ==========
    const radioGroups = new Map(); // name -> first radio element
    const radios = document.querySelectorAll('input[type="radio"]');
    
    for (const radio of radios) {
      if (!radio.name) continue;
      if (radioGroups.has(radio.name)) continue;
      radioGroups.set(radio.name, radio);
    }
    
    for (const [name, radio] of radioGroups) {
      // Check if any option in group is selected
      const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
      const isAnswered = Array.from(group).some(r => r.checked);
      if (isAnswered) continue;
      
      if (!isVisibleElement(radio)) continue;
      
      const rawLabel = labelTextForInput(radio);
      if (!rawLabel) continue;
      
      const { label, required: requiredFromLabel } = processLabel(rawLabel);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      if (shouldSkipLabel(label)) continue;
      
      seenLabels.add(label.toLowerCase());
      
      // Collect radio options
      const options = [];
      for (const r of group) {
        const optLabel = r.labels?.[0]?.textContent?.trim() ||
                         document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent?.trim() ||
                         r.value;
        if (optLabel) options.push(optLabel);
      }
      
      const required = requiredFromLabel ||
                       radio.getAttribute('aria-required') === 'true' ||
                       radio.required === true;
      
      results.push({
        label,
        kind: 'radio',
        required,
        options: options.slice(0, maxOptionsPreview),
        optionsCount: options.length,
        groupName: name,
      });
      
      log(` [radio] "${label}" - ${options.length} options`);
    }
    
    log(` Scan complete: ${results.length} unanswered questions found`);
    
    if (!asReactSelectRows) return results;
    return getReactSelectRows(results);
  }

  // ==================== Fill Answer from AI ====================
  /**
   * Fill a single question with an AI-generated answer
   * @param {Object} questionData - Question object from scanUnansweredQuestions
   * @param {string} answer - The answer from AI
   * @returns {Promise<boolean>} - Whether the fill succeeded
   */
  async function fillAnswer(questionData, answer) {
    if (!answer || !questionData) return false;
    
    const { kind, label, elementId, elementName, groupName, options } = questionData;
    log(` Filling answer for "${label}" (${kind}): "${answer}"`);
    
    try {
      switch (kind) {
        case 'react-select':
          return await fillReactSelectAnswer(questionData, answer);
          
        case 'textarea':
          return fillTextareaAnswer(questionData, answer);
          
        case 'select':
          return fillNativeSelectAnswer(questionData, answer);
          
        case 'input':
          return fillInputAnswer(questionData, answer);
          
        case 'radio':
          return fillRadioAnswer(questionData, answer);
          
        case 'checkbox':
          return fillCheckboxAnswer(questionData, answer);
          
        default:
          log(` Unknown question kind: ${kind}`);
          return false;
      }
    } catch (e) {
      log(` Error filling ${kind} question "${label}":`, e);
      return false;
    }
  }
  
  /**
   * Fill a React-Select dropdown with the given answer
   * Uses the proven selectReactSelectValue approach
   */
  async function fillReactSelectAnswer(questionData, answer) {
    const { label, elementId } = questionData;
    
    log(` [AI Fill] React-Select "${label}" with answer "${answer}"`);
    
    // CRITICAL: Close ALL open dropdowns first
    document.activeElement?.blur();
    document.body.click();
    await sleep(200);
    
    // Find the input by elementId or by label text
    let input = null;
    
    if (elementId) {
      input = document.getElementById(elementId);
    }
    
    if (!input) {
      // Search by label - find the EXACT label first
      const labels = document.querySelectorAll('label');
      for (const lab of labels) {
        const labText = (lab.textContent || '').replace(/\*\s*$/, '').trim();
        // Check for exact or close match
        if (labText.toLowerCase() === label.toLowerCase() ||
            labText.toLowerCase().includes(label.toLowerCase()) ||
            label.toLowerCase().includes(labText.toLowerCase())) {
          
          const selectContainer = lab.parentElement;
          const selectShell = selectContainer?.querySelector('.select-shell, [class*="select-shell"]');
          
          if (selectShell) {
            input = selectShell.querySelector('input.select__input, input[role="combobox"]');
            if (input) {
              log(` Found input via label: "${labText.substring(0, 40)}"`);
              break;
            }
          }
        }
      }
    }
    
    if (!input) {
      log(` Could not find React-Select input for "${label}"`);
      return false;
    }
    
    // Verify it's a react-select combobox
    if (!isReactSelectComboboxInput(input)) {
      log(` Input is not a React-Select combobox`);
      return false;
    }
    
    // Get the select shell for verification later
    const selectShell = input.closest('.select-shell') || 
                        input.closest('[class*="select-shell"]') ||
                        input.closest('.select__container');
    
    // Check if already has a value
    if (selectShell) {
      const existingValue = selectShell.querySelector('.select__single-value');
      if (existingValue && existingValue.textContent && !existingValue.textContent.includes('Select')) {
        log(` Already has value: ${existingValue.textContent}`);
        return true;
      }
    }
    
    // Use the proven selectReactSelectValue function with our answer as candidates
    const candidates = [answer];
    const success = await selectReactSelectValue(input, candidates);
    
    if (success) {
      log(` ✓ Successfully selected "${answer}" for "${label}"`);
      return true;
    }
    
    // If exact match failed, try with the first few words
    const shortAnswer = answer.split(' ').slice(0, 2).join(' ');
    if (shortAnswer !== answer && shortAnswer.length >= 3) {
      log(` Trying shorter match: "${shortAnswer}"`);
      const shortSuccess = await selectReactSelectValue(input, [shortAnswer]);
      if (shortSuccess) {
        log(` ✓ Successfully selected via short match for "${label}"`);
        return true;
      }
    }
    
    log(` Failed to select for "${label}"`);
    return false;
  }
  
  /**
   * Fill a textarea with the given answer
   */
  function fillTextareaAnswer(questionData, answer) {
    const { elementId, elementName, label } = questionData;
    
    // Find the textarea
    let ta = null;
    if (elementId) ta = document.getElementById(elementId);
    if (!ta && elementName) ta = document.querySelector(`textarea[name="${CSS.escape(elementName)}"]`);
    if (!ta) {
      // Fallback: find by label text
      const textareas = document.querySelectorAll('textarea');
      for (const t of textareas) {
        const tLabel = labelTextForInput(t);
        if (tLabel && tLabel.toLowerCase().includes(label.toLowerCase())) {
          ta = t;
          break;
        }
      }
    }
    
    if (!ta) {
      log(` Could not find textarea for "${label}"`);
      return false;
    }
    
    // Fill it
    ta.focus();
    ta.value = answer;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.blur();
    
    log(` ✓ Textarea "${label}" filled`);
    return true;
  }
  
  /**
   * Fill a native <select> with the given answer
   */
  function fillNativeSelectAnswer(questionData, answer) {
    const { elementId, elementName, label, options } = questionData;
    
    let sel = null;
    if (elementId) sel = document.getElementById(elementId);
    if (!sel && elementName) sel = document.querySelector(`select[name="${CSS.escape(elementName)}"]`);
    
    if (!sel) {
      log(` Could not find select for "${label}"`);
      return false;
    }
    
    // Find best matching option
    const answerLower = answer.toLowerCase();
    let bestOption = null;
    let bestScore = -1;
    
    for (const opt of sel.options) {
      const optText = opt.text.toLowerCase();
      // Exact match
      if (optText === answerLower) {
        bestOption = opt;
        bestScore = 100;
        break;
      }
      // Partial match
      if (optText.includes(answerLower) || answerLower.includes(optText)) {
        const score = Math.max(optText.length, answerLower.length);
        if (score > bestScore) {
          bestScore = score;
          bestOption = opt;
        }
      }
    }
    
    if (!bestOption) {
      log(` No matching option found for "${answer}" in select "${label}"`);
      return false;
    }
    
    sel.value = bestOption.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    
    log(` ✓ Select "${label}" set to "${bestOption.text}"`);
    return true;
  }
  
  /**
   * Fill a text input with the given answer
   */
  function fillInputAnswer(questionData, answer) {
    const { elementId, elementName, label } = questionData;
    
    let inp = null;
    if (elementId) inp = document.getElementById(elementId);
    if (!inp && elementName) inp = document.querySelector(`input[name="${CSS.escape(elementName)}"]`);
    
    if (!inp) {
      log(` Could not find input for "${label}"`);
      return false;
    }
    
    inp.focus();
    inp.value = answer;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
    
    log(` ✓ Input "${label}" filled`);
    return true;
  }
  
  /**
   * Fill a radio group with the given answer
   */
  function fillRadioAnswer(questionData, answer) {
    const { groupName, label, options } = questionData;
    
    if (!groupName) {
      log(` No groupName for radio question "${label}"`);
      return false;
    }
    
    const radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(groupName)}"]`);
    const answerLower = answer.toLowerCase();
    
    // Find best matching radio
    for (const radio of radios) {
      const optLabel = radio.labels?.[0]?.textContent?.trim() ||
                       document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)?.textContent?.trim() ||
                       radio.value;
      
      if (!optLabel) continue;
      
      const optLower = optLabel.toLowerCase();
      if (optLower === answerLower || optLower.includes(answerLower) || answerLower.includes(optLower)) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        log(` ✓ Radio "${label}" selected: "${optLabel}"`);
        return true;
      }
    }
    
    log(` No matching radio option found for "${answer}" in "${label}"`);
    return false;
  }
  
  /**
   * Fill a checkbox with the given answer
   */
  function fillCheckboxAnswer(questionData, answer) {
    const { elementId, elementName, label } = questionData;
    
    let cb = null;
    if (elementId) cb = document.getElementById(elementId);
    if (!cb && elementName) cb = document.querySelector(`input[type="checkbox"][name="${CSS.escape(elementName)}"]`);
    
    if (!cb) {
      log(` Could not find checkbox for "${label}"`);
      return false;
    }
    
    // Interpret answer as boolean
    const shouldCheck = /^(yes|true|1|checked|agree)$/i.test(answer.trim());
    
    if (cb.checked !== shouldCheck) {
      cb.click();
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    log(` ✓ Checkbox "${label}" set to ${shouldCheck}`);
    return true;
  }
  
  /**
   * Fill multiple answers from AI response
   * Fills ONE question at a time with proper delays
   * @param {Array} unansweredQuestions - From scanUnansweredQuestions
   * @param {Array} aiAnswers - Array of {label, answer} from AI
   * @returns {Object} - { filled: [], failed: [] }
   */
  async function fillAIAnswers(unansweredQuestions, aiAnswers) {
    const results = { filled: [], failed: [] };
    
    if (!aiAnswers || !Array.isArray(aiAnswers)) {
      log(' No AI answers to fill');
      return results;
    }
    
    log(` Filling ${aiAnswers.length} AI answers one by one...`);
    
    for (let i = 0; i < aiAnswers.length; i++) {
      const aiAnswer = aiAnswers[i];
      log(`\n--- [${i + 1}/${aiAnswers.length}] Processing: "${aiAnswer.label}" ---`);
      
      // Find matching question by label
      const question = unansweredQuestions.find(q => 
        q.label.toLowerCase() === aiAnswer.label.toLowerCase() ||
        q.label.toLowerCase().includes(aiAnswer.label.toLowerCase()) ||
        aiAnswer.label.toLowerCase().includes(q.label.toLowerCase())
      );
      
      if (!question) {
        log(` Could not find question matching label "${aiAnswer.label}"`);
        results.failed.push({ label: aiAnswer.label, reason: 'question not found' });
        continue;
      }
      
      log(` Question found: kind=${question.kind}, answer="${aiAnswer.answer}"`);
      
      // Close any open dropdowns before starting
      document.body.click();
      await sleep(300);
      
      const success = await fillAnswer(question, aiAnswer.answer);
      
      if (success) {
        results.filled.push(question.label);
        log(` ✓ Successfully filled "${question.label}"`);
      } else {
        results.failed.push({ label: question.label, reason: 'fill failed' });
        log(` ✗ Failed to fill "${question.label}"`);
      }
      
      // Longer delay between fills to ensure UI settles
      await sleep(500);
    }
    
    log(`\n AI fill complete: ${results.filled.length} filled, ${results.failed.length} failed`);
    return results;
  }
  
  /**
   * Request AI answers for unanswered questions and fill them
   * @param {Array} unansweredQuestions - From scanUnansweredQuestions
   * @returns {Promise<Object>} - Fill results
   */
  async function requestAndFillAIAnswers(unansweredQuestions) {
    if (!unansweredQuestions || unansweredQuestions.length === 0) {
      log(' No unanswered questions to send to AI');
      return { filled: [], failed: [], skipped: true };
    }
    
    // Only send REQUIRED questions to AI
    const requiredQuestions = unansweredQuestions.filter(q => q.required);
    
    if (requiredQuestions.length === 0) {
      log(' No required unanswered questions - skipping AI');
      return { filled: [], failed: [], skipped: true };
    }
    
    log(` Requesting AI answers for ${requiredQuestions.length} REQUIRED questions (skipping ${unansweredQuestions.length - requiredQuestions.length} optional)...`);
    
    try {
      // Send to background script for AI processing
      const response = await chrome.runtime.sendMessage({
        type: 'ANSWER_QUESTIONS',
        questions: requiredQuestions
      });
      
      if (!response.success) {
        log(' AI request failed:', response.error);
        return { filled: [], failed: requiredQuestions.map(q => ({ label: q.label, reason: response.error })) };
      }
      
      const aiAnswers = response.answers;
      log(` Received ${aiAnswers.length} answers from AI`);
      
      // Fill the answers (use requiredQuestions for matching)
      return await fillAIAnswers(requiredQuestions, aiAnswers);
      
    } catch (e) {
      log(' Error requesting AI answers:', e);
      return { filled: [], failed: requiredQuestions.map(q => ({ label: q.label, reason: e.message })) };
    }
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
   * Fill a React Select (combobox) field by label text. Two modes:
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
  
  // Fill phone input with country code selection
  // Greenhouse uses intl-tel-input library for phone, not React Select
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

  async function waitForDomStable(root, { timeoutMs = 12000, stableMs = 700, pollMs = 200 } = {}) {
    const start = Date.now();
    let lastMutation = Date.now();
    let observer;

    try {
      observer = new MutationObserver(() => { lastMutation = Date.now(); });
      observer.observe(root, { subtree: true, childList: true, attributes: true });
    } catch (_) {}

    while (Date.now() - start < timeoutMs) {
      // "Stable" means: no mutations for stableMs
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
    // Accept: "Male" (string), {label,value}, or accidental [gender]
    const raw = (() => {
      if (Array.isArray(genderValue)) {
        const v0 = genderValue[0];
        if (typeof v0 === 'string') return v0;
        if (v0 && typeof v0 === 'object') return v0.value ?? v0.label ?? '';
        return v0 ?? '';
      }
      if (typeof genderValue === 'string') return genderValue;
      if (genderValue && typeof genderValue === 'object') return genderValue.value ?? genderValue.label ?? '';
      if (genderValue == null) return '';
      return String(genderValue);
    })();

    const g = raw.toLowerCase().trim();
    if (!g) return [];

    if (g.includes('prefer') && g.includes('not')) {
      return ['prefer not to say', "i don't wish to answer", 'decline to answer', raw];
    }

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
      return ['transgender', 'trans', raw];
    }

    return [raw];
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

  /**
   * Specialized react-select handler for location/city fields.
   * Prefers US/Canada cities based on user's state or country.
   */
  async function selectLocationReactSelectValue(inputEl, cityName, userState) {
    if (!isReactSelectComboboxInput(inputEl)) return false;
    if (!cityName) return false;

    // Open the react-select dropdown
    await openReactSelect(inputEl);
    await sleep(50);

    // Clear and type the city name, dispatching input event to trigger search
    setNativeInputValue(inputEl, '');
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    
    setNativeInputValue(inputEl, cityName);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Wait longer for location API to return results (async search)
    await sleep(400);

    let options = getReactSelectOptions(inputEl);
    
    // If no options yet, wait a bit more (location APIs can be slow)
    if (!options.length) {
      await sleep(300);
      options = getReactSelectOptions(inputEl);
    }
    
    if (!options.length) return false;

    // Build preference patterns for US/Canada
    const usCanadaPatterns = [
      'united states', 'usa', ', us', ', u.s.',
      'canada', ', ca,', // ", CA," for Canadian provinces
    ];
    
    // Add user's state to preference if available (e.g., "California", "CA")
    if (userState) {
      const stateNorm = userState.toLowerCase().trim();
      usCanadaPatterns.push(stateNorm);
      // Also add state code if we have the full name
      const stateCode = US_STATE_CODE_BY_NAME[stateNorm];
      if (stateCode) {
        usCanadaPatterns.push(`, ${stateCode.toLowerCase()},`);
        usCanadaPatterns.push(`, ${stateCode.toLowerCase()}`);
      }
      // Check Canadian provinces too
      const provCode = CA_PROVINCE_CODE_BY_NAME[stateNorm];
      if (provCode) {
        usCanadaPatterns.push(`, ${provCode.toLowerCase()},`);
        usCanadaPatterns.push(`, ${provCode.toLowerCase()}`);
      }
    }

    const cityNorm = cityName.toLowerCase().trim();
    let bestOption = null;
    let bestScore = -1;

    for (const opt of options) {
      const text = (opt.textContent || '').toLowerCase().trim();
      if (!text) continue;

      let score = 0;

      // Base score: does it contain the city name?
      if (!text.includes(cityNorm) && !hasWholeWord(text, cityNorm)) continue;
      score = 10;

      // Bonus for US/Canada match
      for (const pattern of usCanadaPatterns) {
        if (text.includes(pattern)) {
          score += 50;
          break;
        }
      }

      // Extra bonus if user's state matches exactly
      if (userState) {
        const stateNorm = userState.toLowerCase().trim();
        const stateCode = US_STATE_CODE_BY_NAME[stateNorm] || CA_PROVINCE_CODE_BY_NAME[stateNorm];
        if (stateCode && text.includes(`, ${stateCode.toLowerCase()}`)) {
          score += 30; // Strong preference for user's exact state
        } else if (text.includes(stateNorm)) {
          score += 20;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestOption = opt;
      }
    }

    // If no US/Canada match found, fall back to first matching option
    if (!bestOption) {
      for (const opt of options) {
        const text = (opt.textContent || '').toLowerCase().trim();
        if (text.includes(cityNorm) || hasWholeWord(text, cityNorm)) {
          bestOption = opt;
          break;
        }
      }
    }

    if (!bestOption) return false;

    bestOption.scrollIntoView({ block: 'nearest' });
    dispatchMouseLikeClick(bestOption);
    await sleep(80);

    if (!getReactSelectListbox(inputEl)) return true;
    if (inputEl.getAttribute('aria-expanded') === 'false') return true;

    return false;
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

      // 如果已经选过,Greenhouse 会显示 .select__single-value
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

    return await selectReactSelectValue(input, genderCandidates(gender));
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
    // Note: this is async, but we can "fire and forget" if you keep function sync,
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
    
    // First pass: check if resume is already uploaded
    for (const input of fileInputs) {
      if (input.files && input.files.length > 0) {
        // Check if this is a resume input
        let parent = input.parentElement;
        for (let depth = 0; depth < 10 && parent; depth++) {
          const parentText = (parent.textContent || '').toLowerCase();
          if ((parentText.includes('resume') || parentText.includes('cv')) && 
              !parentText.includes('cover letter')) {
            log(' Resume already uploaded, returning true');
            return true;  // File already there = success
          }
          parent = parent.parentElement;
        }
      }
    }
    
    // Second pass: find and upload to resume input
    for (const input of fileInputs) {
      // Skip if already has file
      if (input.files && input.files.length > 0) {
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
    
    // First pass: check if cover letter is already uploaded
    for (const input of fileInputs) {
      if (input.files && input.files.length > 0) {
        let parent = input.parentElement;
        for (let depth = 0; depth < 10 && parent; depth++) {
          const parentText = (parent.textContent || '').toLowerCase();
          if (parentText.includes('cover letter') || parentText.includes('cover_letter')) {
            log(' Cover letter already uploaded, returning true');
            return true;  // File already there = success
          }
          parent = parent.parentElement;
        }
      }
    }
    
    // Second pass: find and upload to cover letter input
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
      'city', 'state', 'zip',
      'current_company',
      'linkedin', 'github', 'website'
    ];

    const BASIC_LABEL_KEYWORDS = {
      first_name: ['first name'],
      last_name: ['last name'],
      preferred_first_name: ['preferred first', 'preferred name'],
      email: ['email'],
      city: ['city', 'location (city)', 'location'],
      state: ['state', 'province'],
      zip: ['zip', 'postal', 'postcode'],
      linkedin: ['linkedin'],
      github: ['github'],
      website: ['portfolio', 'website', 'personal website'],
      current_company: ['current company', 'company'],
    };
    
    for (const fieldName of standardFields) {
      const value = dataToFill[fieldName];
      if (!value) continue;

      let ok = fillField(fieldName, value, FIELD_MAPPINGS);

      // Special handling for city react-select: prefer US/Canada cities
      if (!ok && fieldName === 'city') {
        const cityKeywords = BASIC_LABEL_KEYWORDS.city;
        const comboInputs = Array.from(document.querySelectorAll('input.select__input[role="combobox"]'));
        for (const input of comboInputs) {
          const lab = labelTextForInput(input);
          if (!matchesAnyKeyword(lab, cityKeywords)) continue;
          if (reactSelectHasAnySelection(input)) continue;
          ok = await selectLocationReactSelectValue(input, value, dataToFill.state);
          if (ok) break;
        }
      }

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
      const uploaded = await uploadResume(resumeData);
      if (uploaded) __resumeUploadedOnce = true;
    }
    if (coverLetterData) {
      const uploaded = await uploadCoverLetter(coverLetterData);
      if (uploaded) __coverLetterUploadedOnce = true;
    }
    
    // Use global state - once true, stays true across retries
    results.resumeUploaded = __resumeUploadedOnce;
    results.coverLetterUploaded = __coverLetterUploadedOnce;
    log(` Resume uploaded: ${results.resumeUploaded}, Cover letter uploaded: ${results.coverLetterUploaded}`);

    const unanswered = await scanUnansweredQuestions({
      includeOptions: true,      // 会尝试打开 react-select 下拉并抓 optionsPreview
      maxOptionsPreview: 30,
      asReactSelectRows: false,  // Keep original format with required flag intact
    });

    results.skippedDetails = unanswered;              // 保留完整对象方便 debug
    results.skipped = unanswered.map(q => q.label);   // 维持你 log 里 skipped: [...] 的期望
    results.skippedRequired = unanswered
      .filter(q => q.required)
      .map(q => q.label);
    
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
      scanUnansweredQuestions,
      fillAnswer,
      fillAIAnswers,
      requestAndFillAIAnswers,
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
      
      case 'SCAN_UNANSWERED': {
        (async () => {
          const payload = message.payload || {};
          const unanswered = await scanUnansweredQuestions({
            includeOptions: payload.includeOptions ?? true,
            maxOptionsPreview: payload.maxOptionsPreview ?? 30,
            asReactSelectRows: payload.asReactSelectRows ?? true,
          });
          sendResponse({ ok: true, count: unanswered.length, unanswered });
        })().catch(e => {
          sendResponse({ ok: false, error: String(e?.message || e), stack: e?.stack });
        });
        return true;
      }
      
      case 'FILL_AI_ANSWERS': {
        // Receive AI answers and fill them
        (async () => {
          const { unansweredQuestions, aiAnswers } = message;
          const results = await fillAIAnswers(unansweredQuestions, aiAnswers);
          sendResponse({ ok: true, ...results });
        })().catch(e => {
          sendResponse({ ok: false, error: String(e?.message || e) });
        });
        return true;
      }
      
      case 'REQUEST_AI_FILL': {
        // Full flow: scan unanswered → ask AI → fill answers
        (async () => {
          const payload = message.payload || {};
          
          // 1. Scan unanswered questions
          const unanswered = await scanUnansweredQuestions({
            includeOptions: true,
            maxOptionsPreview: 30,
            asReactSelectRows: true,
          });
          
          if (unanswered.length === 0) {
            sendResponse({ ok: true, message: 'No unanswered questions found', filled: [], failed: [] });
            return;
          }
          
          // 2. Request AI answers and fill them
          const results = await requestAndFillAIAnswers(unanswered);
          sendResponse({ ok: true, ...results, totalQuestions: unanswered.length });
        })().catch(e => {
          sendResponse({ ok: false, error: String(e?.message || e) });
        });
        return true;
      }

      default:
        log(' Unknown message:', message.type);
    }
  });

  // ==================== Initialize ====================

  const formType = detectFormType();
  if (formType.detected) {
    setTimeout(() => updateNotificationBanner('supported'), 500);
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
    if (!isAutofillTargetPage()) {
      console.log('[JobAutofill][AutoRun] Not a target page, skipping');
      return;
    }

    const key = pageRunKey();
    if (sessionStorage.getItem(key) === '1') {
      console.log('[JobAutofill][AutoRun] Already ran on this page (sessionStorage), skipping');
      return;
    }

    const { autoFillEnabled = true, userData, resumeData, coverLetterData } =
      await chrome.storage.local.get(['autoFillEnabled', 'userData', 'resumeData', 'coverLetterData']);

    // 只有明确设置为 false 才禁用;undefined 视为开启(兼容旧数据)
    if (autoFillEnabled === false) {
      console.log('[JobAutofill][AutoRun] autoFillEnabled is false, skipping');
      return;
    }
    if (!userData) {
      console.log('[JobAutofill][AutoRun] No userData found, skipping');
      return;
    }

    const ready = await waitForFormReady();
    if (!ready) return;
    updateNotificationBanner('running');

    // Greenhouse React hydration guard (prevents "filled then erased" + hydration errors)
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
    
    // Use the unanswered questions already scanned by performAutofill
    // This has correct required flags
    const unanswered = result?.skippedDetails || [];
    console.log(`[JobAutofill] Using ${unanswered.length} unanswered questions from performAutofill`);
    const requiredCount = unanswered.filter(q => q.required).length;
    console.log(`[JobAutofill] Of which ${requiredCount} are required`);

    await chrome.storage.local.set({
      lastUnanswered: { url: location.href, ts: Date.now(), unanswered }
    });

    // ========== AI Fill Phase ==========
    // Only call AI if there are unanswered questions AND AI is enabled
    let aiFillResult = { filled: [], failed: [] };
    console.log(`[JobAutofill] Checking AI phase: ${unanswered.length} unanswered questions`);
    if (unanswered.length > 0) {
      try {
        const { aiEnabled = true } = await chrome.storage.local.get(['aiEnabled']);
        console.log(`[JobAutofill] aiEnabled = ${aiEnabled}`);
        
        if (aiEnabled !== false) {
          const requiredQuestions = unanswered.filter(q => q.required);
          console.log(`[JobAutofill] Calling AI for ${requiredQuestions.length} REQUIRED questions (skipping ${unanswered.length - requiredQuestions.length} optional)...`);
          updateNotificationBanner('running', { message: 'AI is answering custom questions...' });
          
          aiFillResult = await requestAndFillAIAnswers(unanswered);
          console.log('[JobAutofill] AI fill result:', aiFillResult);
        } else {
          console.log('[JobAutofill] AI is disabled');
        }
      } catch (aiErr) {
        console.warn('[JobAutofill] AI fill failed:', aiErr);
        aiFillResult.error = aiErr.message;
      }
    } else {
      console.log('[JobAutofill] No unanswered questions, skipping AI');
    }

    // Combine results
    const totalFilled = filledCount + (aiFillResult.filled?.length || 0);
    const remainingUnanswered = unanswered.length - (aiFillResult.filled?.length || 0);

    // Wait for page to settle before showing success banner
    // This ensures all scroll/fill animations are complete
    if (totalFilled > 0 || resumeOk) {
      // Wait up to 3 seconds for DOM to stabilize (500ms of no changes)
      await waitForDomStable(document.body, { timeoutMs: 3000, stableMs: 500, pollMs: 100 });
      
      window.__JOB_AUTOFILL__?.updateNotificationBanner?.('success', {
        filledCount: totalFilled,
        resumeUploaded: !!result?.resumeUploaded,
        coverLetterUploaded: !!result?.coverLetterUploaded,
        unansweredCount: remainingUnanswered,
        aiFilledCount: aiFillResult.filled?.length || 0,
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
