// Background Service Worker
// Handles side panel, message passing, and page detection

// Greenhouse URL patterns
const GREENHOUSE_PATTERNS = [
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.greenhouse.io'
];

// Other job board patterns
const JOB_BOARD_PATTERNS = [
  'jobs.lever.co',
  'myworkday.com',
  'icims.com',
  'jobvite.com',
  'smartrecruiters.com'
];

// Check if URL matches job application patterns
function isJobApplicationPage(url) {
  if (!url) return { isJobPage: false, type: null };
  
  const urlLower = url.toLowerCase();
  
  for (const pattern of GREENHOUSE_PATTERNS) {
    if (urlLower.includes(pattern)) {
      return { isJobPage: true, type: 'greenhouse' };
    }
  }
  
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
    await chrome.action.setBadgeBackgroundColor({ tabId, color: type === 'greenhouse' ? '#22c55e' : '#3b82f6' });
    await chrome.action.setTitle({ 
      tabId, 
      title: type === 'greenhouse' 
        ? 'Greenhouse form detected! Click to autofill.' 
        : 'Job application detected! Click to autofill.'
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
    console.log('Could not get tab info:', error);
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
      
    case 'TRIGGER_AUTOFILL':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            type: 'AUTOFILL',
            userData: message.userData,
            resumeData: message.resumeData,
            coverLetterData: message.coverLetterData
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Could not send message to content script:', chrome.runtime.lastError);
              sendResponse({ error: 'Content script not available. Try refreshing the page.' });
            } else {
              sendResponse(response);
            }
          });
        } else {
          sendResponse({ error: 'No active tab found' });
        }
      });
      return true;
      
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
      console.log('Content script ready on:', message.url);
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Job Application Autofill extension installed');
});

console.log('Job Application Autofill background service worker loaded');
