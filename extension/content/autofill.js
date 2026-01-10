// Content Script - Autofill logic for job application forms
// Injected into Greenhouse and other job application pages

(function() {
  'use strict';

  // ==================== Configuration ====================
  
  // Set to false for production release
  const DEBUG = false;
  
  // Conditional logging - only logs when DEBUG is true
  const log = (...args) => { if (DEBUG) log('', ...args); };
  const logError = (...args) => { logError('', ...args); }; // Always log errors

  // Prevent multiple injections
  if (window.__jobAutofillLoaded) return;
  window.__jobAutofillLoaded = true;

  // ==================== In-Page Notification ====================
  
  /**
   * Check if current page is an actual job application page (not a listing page)
   * Application pages have /jobs/ followed by a job ID in the URL
   */
  function isApplicationPage() {
    const url = window.location.href;
    const path = window.location.pathname;
    
    // Greenhouse: must have /jobs/ followed by a number
    if (window.location.hostname.includes('greenhouse.io')) {
      return /\/jobs\/\d+/.test(path);
    }
    
    // Lever: must have a job ID in the path
    if (window.location.hostname.includes('lever.co')) {
      // Lever job pages look like: /company/job-id-uuid
      return path.split('/').length >= 3 && path.split('/')[2].length > 10;
    }
    
    // Workday: check for job apply page
    if (window.location.hostname.includes('workday.com')) {
      return url.includes('/job/') || url.includes('/apply');
    }
    
    // Generic: check for application form
    return document.querySelector('#application_form') !== null ||
           document.querySelector('form[action*="apply"]') !== null;
  }
  
  function showNotificationBanner() {
    if (document.getElementById('job-autofill-notif')) return;
    if (sessionStorage.getItem('job-autofill-dismissed')) return;

    // Only show on actual application pages, not listing pages
    if (!isApplicationPage()) return;
    
    const notif = document.createElement('div');
    notif.id = 'job-autofill-notif';
    notif.innerHTML = `
      <style>
        @keyframes popIn {
          0% { transform: scale(0.8) translateY(-10px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(37, 99, 235, 0.3); }
          50% { box-shadow: 0 4px 25px rgba(37, 99, 235, 0.5); }
        }
        #job-autofill-notif-card {
          animation: popIn 0.3s ease-out, pulse 2s ease-in-out infinite;
        }
        #job-autofill-notif-card:hover {
          transform: translateY(-2px);
        }
        #job-autofill-btn:hover {
          background: #1d4ed8 !important;
        }
        #job-autofill-close:hover {
          background: rgba(0,0,0,0.1) !important;
        }
      </style>
      
      <div id="job-autofill-notif-card" style="
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        background: white;
        border-radius: 12px;
        padding: 16px;
        width: 280px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(37, 99, 235, 0.3);
        border: 1px solid rgba(37, 99, 235, 0.2);
        transition: transform 0.2s ease;
      ">
        <div style="
          position: absolute;
          top: -8px;
          right: 24px;
          width: 16px;
          height: 16px;
          background: white;
          border-left: 1px solid rgba(37, 99, 235, 0.2);
          border-top: 1px solid rgba(37, 99, 235, 0.2);
          transform: rotate(45deg);
        "></div>
        
        <button id="job-autofill-close" style="
          position: absolute;
          top: 8px;
          right: 8px;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          transition: all 0.15s ease;
        " title="Dismiss">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
          ">
            🌿
          </div>
          <div>
            <div style="font-weight: 600; font-size: 14px; color: #1f2937;">
              Job Autofill
            </div>
            <div style="font-size: 11px; color: #6b7280;">
              Chrome Extension
            </div>
          </div>
        </div>
        
        <div style="font-size: 13px; color: #374151; margin-bottom: 14px; line-height: 1.4;">
          This page is supported! Click below to autofill.
        </div>
        
        <button id="job-autofill-btn" style="
          width: 100%;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Open Autofill Panel
        </button>
      </div>
    `;
    
    document.body.appendChild(notif);
    
    document.getElementById('job-autofill-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      notif.remove();
    });
    
    document.getElementById('job-autofill-close').addEventListener('click', () => {
      notif.remove();
      sessionStorage.setItem('job-autofill-dismissed', 'true');
    });
    
    setTimeout(() => {
      if (document.getElementById('job-autofill-notif')) {
        notif.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-10px)';
        setTimeout(() => notif.remove(), 300);
      }
    }, 10000);
    
    log(' Notification shown');
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
      // Specific: must contain "preferred" AND "name" together
      'input[name*="preferred_name"]',
      'input[name*="preferredName"]',
      'input[name*="preferred-name"]',
      'input[name*="preferred_first"]',
      'input[name*="preferredFirst"]',
      'input[id*="preferred_name"]',
      'input[id*="preferredName"]',
      'input[id*="preferred-name"]',
      'input[id*="preferred_first"]',
      'input[id*="preferredFirst"]',
      // Nickname variants
      'input[name*="nickname"]',
      'input[id*="nickname"]',
      'input[autocomplete="nickname"]',
      // Placeholder hints
      'input[placeholder*="Preferred Name" i]',
      'input[placeholder*="Preferred First" i]',
      'input[placeholder*="Nickname" i]'
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
    'linkedin': [
      'input[name*="linkedin" i]', 
      'input[id*="linkedin" i]', 
      'input[placeholder*="linkedin" i]',
      'input[aria-label*="linkedin" i]',
      'input[name*="linked_in" i]',
      'input[id*="linked_in" i]'
    ],
    'github': [
      'input[name*="github" i]', 
      'input[id*="github" i]', 
      'input[placeholder*="github" i]',
      'input[aria-label*="github" i]',
      'input[name*="git_hub" i]',
      'input[id*="git_hub" i]'
    ],
    'website': [
      'input[name*="website"]', 
      'input[name*="portfolio"]', 
      'input[id*="website"]',
      'input[placeholder*="Website" i]',
      'input[placeholder*="Portfolio" i]'
    ],
    'current_company': [
      'input[name*="current_company" i]',
      'input[name*="currentCompany" i]',
      'input[name*="current-company" i]',
      'input[id*="current_company" i]',
      'input[id*="currentCompany" i]',
      'input[id*="current-company" i]',
      'input[name*="company" i]',
      'input[id*="company" i]',
      'input[placeholder*="Current Company" i]',
      'input[placeholder*="Company" i]'
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

  // Label-based field detection (excluding EEO - handled separately)
  // Note: state/province handled separately by fillStateProvince() for React Select
  const LABEL_MAPPINGS = {
    'first_name': ['first name'],
    'last_name': ['last name', 'family name', 'surname'],
    'preferred_first_name': ['preferred name', 'preferred first name', 'nickname', 'goes by'],
    'email': ['email'],
    'phone': ['phone', 'telephone', 'mobile'],
    'current_company': ['current company', 'current employer', 'company'],
    'github': ['github', 'git hub'],
    'city': ['city'],
    'school': ['school'],
    'degree': ['degree'],
    'discipline': ['discipline', 'major', 'field of study'],
    'edu_start_year': ['start date year', 'start year'],
    'edu_end_year': ['end date year', 'end year', 'graduation'],
    'linkedin': ['linkedin']
  };

  // Work authorization selectors - both standard select and input for React Select
  const AUTHORIZED_SELECTORS = [
    'select[name*="authorized" i]', 
    'select[id*="authorized" i]',
    'select[name*="legally" i]',
    'select[id*="legally" i]',
    'select[name*="eligible" i]',
    'select[id*="eligible" i]',
    'select[name*="work_in" i]',
    'select[id*="work_in" i]'
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

  function detectFormType() {
    if (isGreenhousePage()) {
      return { type: 'greenhouse', detected: true };
    }
    
    if (window.location.hostname.includes('lever.co')) {
      return { type: 'lever', detected: true };
    }
    
    if (window.location.hostname.includes('workday.com')) {
      return { type: 'workday', detected: true };
    }
    
    const hasApplicationForm = document.querySelector('form[action*="apply"]') ||
                                document.querySelector('input[name*="resume"]');
    
    return { type: hasApplicationForm ? 'generic' : 'unknown', detected: hasApplicationForm };
  }

  // ==================== React Select Handler ====================
  
  /**
   * Fill a React Select (combobox) field by label text
   * 
   * Two modes:
   * - Search mode (typeToSearch=true): Type value, wait for results, click best match
   * - Select mode (typeToSearch=false): Open dropdown, find best match in options, click it
   */
  async function fillReactSelectByLabel(labelKeywords, value, options = {}) {
    if (!value) return false;
    
    const { waitForAsync = false, typeToSearch = true } = options;
    
    log(` React Select: keywords=[${labelKeywords.join(', ')}], value="${value}", typeToSearch=${typeToSearch}`);
    
    // First, close any open dropdowns
    document.body.click();
    await new Promise(r => setTimeout(r, 200));
    
    const labels = document.querySelectorAll('label');
    
    for (const label of labels) {
      const labelText = label.textContent?.toLowerCase() || '';
      
      // Check if label matches any keyword
      const matches = labelKeywords.some(kw => labelText.includes(kw.toLowerCase()));
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
        return false;
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
        // GENDER SPECIAL HANDLING - use word boundary matching
        // "Male" should match "Cisgender male" but NOT "Cisgender female"
        else if (valueLower === 'male') {
          // Check for whole word "male" at end or as separate word
          if (/\bmale\b/.test(textLower) && !/female/.test(textLower)) {
            score = 95;
          }
        }
        else if (valueLower === 'female') {
          // Check for "female" in text
          if (/\bfemale\b/.test(textLower)) {
            score = 95;
          }
        }
        else if (valueLower === 'non-binary' || valueLower === 'non binary') {
          if (textLower.includes('non-binary') || textLower.includes('non binary') || 
              textLower.includes('nonbinary') || textLower.includes('genderqueer') ||
              textLower.includes('genderfluid')) {
            score = 90;
          }
        }
        // Option contains our value (with word boundary check to avoid male/female issue)
        else if (textLower.includes(valueLower)) {
          // Penalize if it's a gender mismatch (e.g., "male" in "female")
          if (valueLower === 'male' && textLower.includes('female')) {
            score = 0; // Don't match
          } else {
            score = 70;
          }
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
          return true;
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
    
    return false;
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

  function fillInputField(element, value) {
    if (!element || !value) return false;
    
    // IMPORTANT: Only fill if the field is currently empty
    // This prevents overwriting user's manual input
    if (!isFieldEmpty(element)) {
      log(` Skipping non-empty field: ${element.name || element.id || 'unknown'}`);
      return false;
    }
    
    element.focus();
    element.value = value;
    
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    
    log(` Filled input: ${element.name || element.id || 'unknown'} = ${value}`);
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

  // ==================== Main Fill Functions ====================

  function fillField(fieldName, value, mappings) {
    if (!value) return false;
    
    const selectors = mappings[fieldName] || [];
    
    // Try standard selectors first
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
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
      { name: 'gender', keywords: ['gender'], value: userData.gender },
      { name: 'pronouns', keywords: ['pronoun'], value: userData.pronouns },
      { name: 'hispanic_latino', keywords: ['hispanic', 'latino'], value: userData.hispanic_latino },
      { name: 'veteran_status', keywords: ['veteran'], value: userData.veteran_status },
      { name: 'disability_status', keywords: ['disability'], value: userData.disability_status }
    ];
    
    for (const field of eeoFieldsConfig) {
      if (!field.value || field.value === 'Decline to Self Identify') {
        log(` Skipping ${field.name} (no value or decline)`);
        continue;
      }
      
      log(` Filling EEO: ${field.name} = ${field.value}`);
      
      // typeToSearch: false - don't type, just open dropdown and select best match
      if (await fillReactSelectByLabel(field.keywords, field.value, { typeToSearch: false })) {
        results.push(field.name);
        await new Promise(r => setTimeout(r, 400)); // Delay between fields
      }
    }
    
    return results;
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

  async function fillStateProvince(userData) {
    if (!userData.state) return false;
    
    log(` Filling State/Province: ${userData.state}`);
    
    // Keywords to identify state/province questions (must be specific)
    const stateKeywords = [
      'u.s. state or canadian province',
      'state or canadian province', 
      'state or province',
      'which u.s. state',
      'which state',
      'which province',
      'what state',
      'state do you reside',
      'province do you reside'
    ];
    
    // First, close any open dropdowns
    document.body.click();
    await new Promise(r => setTimeout(r, 200));
    
    // Strategy: Find all field containers first, then check which one has state question
    // This prevents accidentally finding the wrong select-shell
    const fieldContainers = document.querySelectorAll('.field, [class*="field-wrapper"], [class*="form-field"]');
    
    for (const fieldContainer of fieldContainers) {
      const fieldText = fieldContainer.textContent?.toLowerCase() || '';
      
      // Check if this field contains state/province keywords
      const isStateField = stateKeywords.some(kw => fieldText.includes(kw));
      if (!isStateField) continue;
      
      // Make sure it's not an authorization question that happens to contain "state"
      if (fieldText.includes('authorized') || fieldText.includes('sponsor') || 
          fieldText.includes('visa') || fieldText.includes('legally')) {
        continue;
      }
      
      log(` Found state/province field container`);
      
      // Find select-shell ONLY within this specific field container
      const selectShell = fieldContainer.querySelector('.select-shell, [class*="select-shell"]');
      
      if (!selectShell) {
        log(' No select-shell in this field container');
        continue;
      }
      
      // Verify this is a state dropdown by checking if options contain state names
      // First, check if already has a value
      const existingValue = selectShell.querySelector('.select__single-value');
      if (existingValue && existingValue.textContent && !existingValue.textContent.includes('Select')) {
        log(' Already has value:', existingValue.textContent);
        return false;
      }
      
      // Get input and control elements
      const input = selectShell.querySelector('input.select__input, input[role="combobox"]');
      const control = selectShell.querySelector('.select__control') || selectShell;
      
      // Focus first
      if (input) input.focus();
      await new Promise(r => setTimeout(r, 100));
      
      // Open dropdown with pointer events
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
          pointerType: 'mouse'
        });
        control.dispatchEvent(e);
      });
      
      await new Promise(r => setTimeout(r, 300));
      
      // Type to search (state list is long)
      if (input) {
        input.focus();
        
        // Clear existing value
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        
        // Type state name character by character
        for (const char of userData.state) {
          input.value += char;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 50));
        }
        
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Find and click matching option
      let menu = selectShell.querySelector('.select__menu');
      if (!menu) {
        const menuId = input?.getAttribute('aria-controls');
        if (menuId) {
          menu = document.getElementById(menuId);
        }
      }
      if (!menu) {
        menu = document.querySelector('.select__menu');
      }
      
      if (menu) {
        const options = menu.querySelectorAll('.select__option');
        const stateLower = userData.state.toLowerCase();
        
        for (const opt of options) {
          const optText = opt.textContent?.toLowerCase() || '';
          if (optText === stateLower || optText.includes(stateLower)) {
            // Click using pointer events
            const optRect = opt.getBoundingClientRect();
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
              const e = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: optRect.left + optRect.width / 2,
                clientY: optRect.top + optRect.height / 2,
                pointerId: 1,
                pointerType: 'mouse'
              });
              opt.dispatchEvent(e);
            });
            
            log(` ✓ State/Province filled: ${userData.state}`);
            await new Promise(r => setTimeout(r, 200));
            return true;
          }
        }
      }
      
      log(' Could not find matching state option');
    }
    
    return false;
  }

  async function fillAuthorizedField() {
    log(' Looking for work authorization fields...');
    
    // Keywords that indicate work authorization questions (NOT sponsorship)
    const authKeywords = [
      'legally authorized',
      'authorized to work',
      'legally eligible',
      'eligible to work',
      'legally permitted',
      'permitted to work',
      'work authorization',
      'right to work',
      'lawfully authorized',
      'legal right to work',
      'employment eligibility',
      'legally able to work'
    ];
    
    // Keywords that indicate it's a sponsorship question (should be handled separately)
    const sponsorshipKeywords = ['sponsor', 'visa', 'h1b', 'h-1b', 'immigration'];
    
    // Strategy 1: Try standard select elements first
    for (const selector of AUTHORIZED_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element) {
          // Find the label/question text for this field
          const container = element.closest('.field, .form-group, .question, [class*="field"]') || element.parentElement;
          const labelText = container ? container.textContent.toLowerCase() : '';
          
          // Skip if this is actually a sponsorship question
          if (sponsorshipKeywords.some(kw => labelText.includes(kw))) {
            log(' Skipping - this is a sponsorship question');
            continue;
          }
          
          // Check if already filled
          if (!isFieldEmpty(element)) {
            log(' Authorized field already filled, skipping');
            continue;
          }
          
          const options = Array.from(element.options);
          const yesOption = options.find(opt => 
            opt.text.toLowerCase().includes('yes') || opt.value.toLowerCase() === 'yes'
          );
          
          if (yesOption) {
            element.value = yesOption.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            log(' Authorized (standard select): Yes');
            return true;
          }
        }
      }
    }
    
    // Strategy 2: Find ALL labels that match authorization keywords
    const allLabels = document.querySelectorAll('label, .field-label, [class*="label"], [class*="question"]');
    
    for (const label of allLabels) {
      const labelText = label.textContent.toLowerCase();
      
      // Check if this label mentions authorization (but NOT sponsorship)
      const isAuthQuestion = authKeywords.some(kw => labelText.includes(kw));
      const isSponsorshipQuestion = sponsorshipKeywords.some(kw => labelText.includes(kw));
      
      if (isAuthQuestion && !isSponsorshipQuestion) {
        log(` Found authorization question: "${label.textContent.substring(0, 60)}..."`);
        
        // Look for React Select in the same container
        const container = label.closest('.field, .form-group, .question, [class*="field"]') || label.parentElement;
        if (!container) continue;
        
        const selectShell = container.querySelector('[class*="select__"], [class*="-control"], [class*="Select"]');
        
        if (selectShell) {
          // Use pointer events to open dropdown
          const control = selectShell.querySelector('[class*="-control"]') || selectShell;
          const rect = control.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          
          // Close any existing dropdowns first
          document.body.click();
          await new Promise(r => setTimeout(r, 200));
          
          // Open dropdown with pointer events
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            const event = new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x,
              clientY: y,
              pointerId: 1,
              pointerType: 'mouse'
            });
            control.dispatchEvent(event);
          });
          
          await new Promise(r => setTimeout(r, 300));
          
          // Find and click "Yes" option
          const menu = document.querySelector('[class*="select__menu"], [class*="-menu"]');
          if (menu) {
            const options = menu.querySelectorAll('[class*="option"]');
            for (const opt of options) {
              const optText = opt.textContent.toLowerCase();
              if (optText.includes('yes')) {
                opt.click();
                log(' Authorized (React Select): Yes');
                await new Promise(r => setTimeout(r, 200));
                return true;
              }
            }
          }
        }
        
        // Also check for standard select in container
        const standardSelect = container.querySelector('select');
        if (standardSelect && isFieldEmpty(standardSelect)) {
          const options = Array.from(standardSelect.options);
          const yesOption = options.find(opt => 
            opt.text.toLowerCase().includes('yes') || opt.value.toLowerCase() === 'yes'
          );
          if (yesOption) {
            standardSelect.value = yesOption.value;
            standardSelect.dispatchEvent(new Event('change', { bubbles: true }));
            log(' Authorized (found via label): Yes');
            return true;
          }
        }
      }
    }
    
    // Strategy 3: Fallback - try React Select with keywords
    for (const keyword of authKeywords.slice(0, 5)) { // Try first 5 keywords
      if (await fillReactSelectByLabel([keyword], 'Yes', { typeToSearch: false })) {
        log(` Authorized (React Select via "${keyword}"): Yes`);
        return true;
      }
    }
    
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
    
    // Prepare data
    const dataToFill = { ...userData };
    if (dataToFill.phone_full) {
      dataToFill.phone = dataToFill.phone_full;
    }
    
    // Fill standard fields (excluding phone - handled separately)
    // Note: Greenhouse typically doesn't have separate city/state/zip fields
    // They usually handle location differently, so we skip these to avoid wrong matches
    const standardFields = [
      'first_name', 'last_name', 'preferred_first_name', 'email',
      'current_company', 'linkedin', 'github', 'website'
    ];
    
    for (const fieldName of standardFields) {
      const value = dataToFill[fieldName];
      if (value) {
        if (fillField(fieldName, value, FIELD_MAPPINGS)) {
          results.filled.push(fieldName);
        }
        // Note: if fillField returns false, it might be because field was already filled
        // We don't add to failed in this case
      }
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
    
    // Fill state/province field (React Select)
    if (await fillStateProvince(dataToFill)) {
      results.filled.push('state');
    }
    
    // Fill EEO fields
    const eeoResults = await fillEEOFields(dataToFill);
    results.filled.push(...eeoResults);
    
    // Work authorization - always Yes
    if (await fillAuthorizedField()) {
      results.filled.push('authorized');
    }
    
    // Sponsorship - based on user's status
    const needsSponsorship = userData.needs_sponsorship !== false;
    if (await fillSponsorshipField(needsSponsorship)) {
      results.filled.push('sponsorship');
    }
    
    // Upload documents (won't re-upload if already uploaded)
    if (resumeData) {
      results.resumeUploaded = await uploadResume(resumeData);
    }
    if (coverLetterData) {
      results.coverLetterUploaded = await uploadCoverLetter(coverLetterData);
    }
    
    // Remove notification
    const notif = document.getElementById('job-autofill-notif');
    if (notif && results.filled.length > 0) {
      notif.remove();
    }
    
    log(' Results:', results);
    return results;
  }

  // ==================== Message Listener ====================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'DETECT_FORM':
        sendResponse(detectFormType());
        break;
        
      case 'AUTOFILL':
        performAutofill(message.userData, message.resumeData, message.coverLetterData).then(results => {
          sendResponse(results);
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
    setTimeout(showNotificationBanner, 500);
  }

  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href });
  log(' Content script loaded on:', window.location.href);
  
})();
