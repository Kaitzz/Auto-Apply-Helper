// Background Service Worker
// Handles side panel, message passing, and page detection

// ==================== Configuration ====================
const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[Background]', ...args); };

// Other job board patterns (for future support)
const JOB_BOARD_PATTERNS = [
  'jobs.lever.co',
  'myworkday.com',
  'icims.com',
  'jobvite.com',
  'smartrecruiters.com'
];

/**
 * Check if URL is an actual job application page (not a listing page)
 * Application pages have /jobs/ followed by a job ID
 */
function isJobApplicationPage(url) {
  if (!url) return { isJobPage: false, type: null };
  
  const urlLower = url.toLowerCase();
  
  // Greenhouse: must have /jobs/ followed by a number
  if (urlLower.includes('greenhouse.io')) {
    const isApplicationPage = /\/jobs\/\d+/.test(urlLower);
    return { isJobPage: isApplicationPage, type: isApplicationPage ? 'greenhouse' : null };
  }

  // Workday: check for job/apply page
  if (urlLower.includes('workday.com')) {
    const isApplicationPage = urlLower.includes('/job/') || urlLower.includes('/apply');
    return { isJobPage: isApplicationPage, type: isApplicationPage ? 'workday' : null };
  }
  
  // Other job boards
  for (const pattern of JOB_BOARD_PATTERNS) {
    if (urlLower.includes(pattern)) {
      return { isJobPage: true, type: 'other' };
    }
  }
  
  return { isJobPage: false, type: null };
}

// Update badge based on current tab
async function updateBadgeForTab(tabId, url) {
  const { isJobPage, type } = isJobApplicationPage(url);
  
  if (isJobPage) {
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#34cd6c' });
    await chrome.action.setTitle({ 
      tabId, 
      title: 'Application page detected! Click to autofill.'
    });
  } else {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: 'Job Autofill' });
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await updateBadgeForTab(tabId, tab.url);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await updateBadgeForTab(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    log('Could not get tab info:', error);
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_SIDE_PANEL':
      // Open side panel from content script request (banner button click)
      if (sender.tab) {
        chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      break;
      
    case 'GET_USER_DATA':
      chrome.storage.local.get(['userData', 'resumeData', 'coverLetterData'], (result) => {
        sendResponse(result);
      });
      return true;
      
    case 'SAVE_USER_DATA':
      chrome.storage.local.set({ userData: message.data }, () => {
        sendResponse({ success: true });
      });
      return true;
      
    case "TRIGGER_AUTOFILL": {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab?.id) {
          sendResponse({ filled: null, error: "No active tab" });
          return;
        }

        chrome.storage.local.get(["userData", "resumeData", "coverLetterData"], (result) => {
          const userData = message.userData ?? result.userData ?? {};
          const resumeData = message.resumeData ?? result.resumeData ?? null;
          const coverLetterData = message.coverLetterData ?? result.coverLetterData ?? null;

          // IMPORTANT: your content script expects type: "AUTOFILL"
          chrome.tabs.sendMessage(
            tab.id,
            { type: "AUTOFILL", userData, resumeData, coverLetterData },
            (response) => {
              if (chrome.runtime.lastError) {
                sendResponse({ filled: null, error: chrome.runtime.lastError.message });
                return;
              }
              sendResponse(response);
            }
          );
        });
      });

      return true; // async response
    }

    case 'DETECT_FORM':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const urlCheck = isJobApplicationPage(tabs[0].url);
          if (urlCheck.isJobPage) {
            sendResponse({ type: urlCheck.type, detected: true });
            return;
          }
          
          chrome.tabs.sendMessage(tabs[0].id, { type: 'DETECT_FORM' }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ type: 'unknown', detected: false });
            } else {
              sendResponse(response);
            }
          });
        } else {
          sendResponse({ type: 'unknown', detected: false });
        }
      });
      return true;
      
    case 'CONTENT_SCRIPT_READY':
      log('Content script ready on:', message.url);
      break;
      
    default:
      log('Unknown message type:', message.type);
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  log('Job Application Autofill extension installed');
});

log('Background service worker loaded');
