// Background Service Worker
// Handles side panel, message passing, page detection, and AI integration

// ==================== Configuration ====================
const DEBUG = true;
const log = (...args) => { if (DEBUG) console.log('[Background]', ...args); };

// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Load API key from config.local.js (gitignored)
// To use: create config.local.js with: const CLAUDE_API_KEY_LOCAL = 'your-key';
let CLAUDE_API_KEY = 'YOUR_API_KEY_HERE';
try {
  importScripts('config.local.js');
  if (typeof CLAUDE_API_KEY_LOCAL !== 'undefined') {
    CLAUDE_API_KEY = CLAUDE_API_KEY_LOCAL;
    log('API key loaded from config.local.js');
  }
} catch (e) {
  log('config.local.js not found, using placeholder. Create config.local.js with your API key.');
}

// ==================== Claude AI Service ====================

/**
 * Call Claude API to answer job application questions
 * @param {Array} questions - Array of unanswered questions with options
 * @param {Object} userContext - User data (profile, resume, etc.)
 * @returns {Promise<Array>} - Array of {label, answer} pairs
 */
async function askClaudeForAnswers(questions, userContext) {
  if (!CLAUDE_API_KEY || CLAUDE_API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY in background.js');
  }

  // Build the prompt
  const systemPrompt = buildSystemPrompt(userContext);
  const userPrompt = buildUserPrompt(questions);

  log('Calling Claude API with', questions.length, 'questions');

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    
    log('Claude response received, parsing...');
    
    // Parse the JSON response
    const answers = parseClaudeResponse(content, questions);
    return answers;

  } catch (error) {
    log('Claude API error:', error);
    throw error;
  }
}

/**
 * Build system prompt with user context
 */
function buildSystemPrompt(userContext) {
  const { userData, resumeText } = userContext;
  
  return `You are an AI assistant helping a job applicant fill out job application forms.

## Applicant Profile:
- Name: ${userData?.first_name || ''} ${userData?.last_name || ''}
- Email: ${userData?.email || ''}
- Phone: ${userData?.phone || ''}
- Location: ${userData?.city || ''}, ${userData?.state || ''}
- Current Company: ${userData?.current_company || 'Not specified'}
- LinkedIn: ${userData?.linkedin || ''}
- GitHub: ${userData?.github || ''}
- Website: ${userData?.website || ''}

## Education:
- School: ${userData?.school || ''}
- Degree: ${userData?.degree || ''}
- Major: ${userData?.discipline || ''}
- Graduation: ${userData?.edu_end_year || ''}

## Work Authorization:
- Authorized to work: ${userData?.authorized_to_work || 'Yes'}
- Needs sponsorship: ${userData?.needs_sponsorship ? 'Yes' : 'No'}

## EEO Information (if provided):
- Gender: ${userData?.gender || 'Prefer not to say'}
- Race/Ethnicity: ${userData?.race_ethnicity || 'Prefer not to say'}
- Veteran Status: ${userData?.veteran_status || 'Prefer not to say'}
- Disability Status: ${userData?.disability_status || 'Prefer not to say'}

${resumeText ? `## Resume Content:\n${resumeText}` : ''}

## Your Task:
Answer job application questions based on the applicant's profile. 
- For multiple choice questions, select the EXACT option text from the provided options
- For text questions, write professional, concise answers
- If information is not available, make reasonable assumptions or use "Prefer not to say" for sensitive questions
- Keep answers authentic and relevant to the applicant's background

IMPORTANT: Respond ONLY with a valid JSON array, no other text.`;
}

/**
 * Build user prompt with questions
 */
function buildUserPrompt(questions) {
  const questionList = questions.map((q, i) => {
    let questionText = `${i + 1}. "${q.label}" (${q.kind}${q.required ? ', REQUIRED' : ''})`;
    
    if (q.options && q.options.length > 0) {
      questionText += `\n   Options: ${JSON.stringify(q.options)}`;
    }
    
    if (q.placeholder) {
      questionText += `\n   Placeholder: "${q.placeholder}"`;
    }
    
    return questionText;
  }).join('\n\n');

  return `Please answer the following job application questions:

${questionList}

Respond with a JSON array in this exact format:
[
  {"label": "Question label here", "answer": "Your answer here"},
  ...
]

For multiple choice questions, the answer MUST be one of the exact option texts provided.
For text questions, provide a professional and relevant answer.`;
}

/**
 * Parse Claude's response into structured answers
 */
function parseClaudeResponse(content, questions) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log('Could not find JSON array in response:', content);
      return [];
    }

    const answers = JSON.parse(jsonMatch[0]);
    
    // Validate and map answers to questions
    return answers.map(a => ({
      label: a.label,
      answer: a.answer
    }));

  } catch (error) {
    log('Error parsing Claude response:', error, content);
    return [];
  }
}

/**
 * Extract text from resume PDF (base64)
 */
async function extractResumeText(resumeData) {
  if (!resumeData?.content) return '';
  
  // For now, just return a placeholder - PDF text extraction would need a library
  // In production, you might use pdf.js or send to a backend service
  return `[Resume: ${resumeData.filename || 'uploaded'}]`;
}

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
    
    case 'ANSWER_QUESTIONS':
      // AI-powered question answering
      handleAnswerQuestions(message.questions, sender.tab?.id)
        .then(answers => sendResponse({ success: true, answers }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // async response
    
    case 'SAVE_API_KEY':
      chrome.storage.local.set({ claudeApiKey: message.apiKey }, () => {
        sendResponse({ success: true });
      });
      return true;
    
    case 'GET_API_KEY_STATUS':
      chrome.storage.local.get(['claudeApiKey'], (result) => {
        sendResponse({ hasKey: !!result.claudeApiKey });
      });
      return true;
      
    default:
      log('Unknown message type:', message.type);
  }
});

/**
 * Handle AI question answering request from content script
 */
async function handleAnswerQuestions(questions, tabId) {
  if (!questions || questions.length === 0) {
    return [];
  }

  log(`Processing ${questions.length} questions for tab ${tabId}`);

  // Get user data from storage
  const { userData, resumeData, coverLetterData } = await chrome.storage.local.get([
    'userData', 
    'resumeData', 
    'coverLetterData'
  ]);

  // Extract text from resume if available
  const resumeText = await extractResumeText(resumeData);

  // Build context for Claude
  const userContext = {
    userData: userData || {},
    resumeText,
    coverLetterData
  };

  // Call Claude API
  const answers = await askClaudeForAnswers(questions, userContext);
  
  log(`Received ${answers.length} answers from Claude`);
  
  return answers;
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  log('Job Application Autofill extension installed');
});

log('Background service worker loaded');
