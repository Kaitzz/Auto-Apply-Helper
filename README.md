# Auto-Apply Helper (BETA) - v0.9.7.3

A Chrome extension that helps you **autofill job application forms** (Greenhouse-first), including **basic fields + resume/attachments upload + AI-powered custom question answering**.

> Status: **BETA** — works best on Greenhouse job application pages.  
> If you see a warning like `form not settled in time; continue in safe mode`, the extension will continue carefully without trying to "fight" the page hydration.

---

## ✨ What it does

- Detects supported job application pages and shows an **in-page notification** with a quick action to open the side panel.
- Autofills common fields (only when the field is empty to avoid overwriting your manual input):
  - First name / Last name / Preferred name / Email / Phone
  - City / State / ZIP
  - LinkedIn / GitHub / Website/Portfolio
  - School / Degree / Major/Discipline / Education years
  - Current company
  - Work authorization / sponsorship fields
  - EEO demographic fields (gender, race/ethnicity, veteran status, disability status)
- Uploads attachments (Resume/CV, Cover Letter) when the form provides upload controls.
- **🆕 AI-Powered Custom Questions**: Uses Claude AI to automatically answer required custom questions (e.g., "How did you hear about us?", "Have you worked here before?")
- **🆕 Auto-Submit**: Optionally click "Submit Application" after filling — detects success via URL change to confirmation page
- **🆕 Stop Button**: Always-visible stop button to halt autofill at any point
- "Safe mode" guard on dynamic pages: if the page is still "settling" (React hydration / re-render), it will avoid aggressive actions that may break the form UI.

---

## 🤖 AI Features (New in v0.9.6)

- **Automatic detection** of unanswered required questions after standard autofill
- **Claude AI integration** to generate contextual answers based on your profile
- **Smart React-Select handling** — properly fills dropdown menus with AI-suggested answers
- **Toggle control** in sidepanel to enable/disable AI answering
- Only **required questions** are sent to AI — optional questions are skipped to save API calls
- **🔒 Secure by design** — API key is stored on a Cloudflare Worker proxy, not in the extension

---

## ✅ Supported sites (current)

### Greenhouse

- Job application pages under `*.greenhouse.io/.../jobs/<number>` are detected as application pages.

### Generic application pages (best-effort)

- If the page contains `#application_form` or a form whose action contains `apply`, the extension will attempt a generic autofill.

> Not currently supported / unreliable: Workday-style multi-step portals, highly customized SPA portals with anti-automation guardrails.

---

## 🚀 How to use

1. **Install the extension**
   - If you're developing locally: load unpacked from `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the extension folder.

2. **Open a job application page**
   - Example: a Greenhouse job page with an **Apply** form.

3. **When the notification appears**, click **"Open Panel to Update Info"**
   - This opens the side panel where you can edit and save your profile data.

4. **Autofill runs automatically**
   - Standard fields are filled first
   - Then AI answers any remaining required custom questions
   - Toggle AI on/off with the switch in the sidepanel

---

## 🔐 Data & Privacy

- Your profile data is stored locally using Chrome extension storage (`chrome.storage.local`).
- AI requests are sent through a secure Cloudflare Worker proxy — the API key never touches the browser.
- This extension does **not** sell or share your data.
- The extension only runs on supported application pages and only uses your data to fill the form fields you see.

---

## 🧰 Development

### Debug logging

- The content script includes debug logs (e.g. `[JobAutofill] ...`).
- Background service worker logs with `[Background] ...`.
- You can inspect logs via **DevTools → Console** on the job application page.

### Typical workflow

1. Make code changes
2. Go to `chrome://extensions`
3. Click **Reload** on the extension
4. Refresh the job application page

### Building the sidepanel

```bash
cd extension/sidepanel
npm install
npm run build
```

---

## 🩺 Troubleshooting

### "It says it filled, but the input is still empty"

Some sites (especially React-controlled inputs) ignore direct `element.value = ...` unless the correct native setter + input events are used.  
The extension uses `setNativeInputValue` and proper event dispatching to handle this.

### Warning: `form not settled in time; continue in safe mode`

This means the page didn't reach a stable state quickly enough (DOM keeps changing / hydration still running).  
The extension continues conservatively to avoid triggering hydration crashes.

### AI not working

- Check your internet connection
- Check the background service worker console for API errors
- Ensure the AI toggle is enabled in the sidepanel

### React-Select dropdown not selecting

The extension uses the proven `selectReactSelectValue` method with proper pointer events and input simulation. If issues persist, check the console for detailed logs.

---

## 🗺️ Roadmap (next)

- Support for more job boards (Lever, Workday, etc.)
- Resume text extraction for better AI context
- Custom prompt templates for different question types
- Field mapping customization UI (user-defined selectors / aliases)

---

## 📌 Version History

- **v0.9.7.3 (BETA)** - Auto-submit after fill with URL-based success detection; Stop button always visible in sidepanel; no banner on confirmation/thank-you pages
- **v0.9.7.2 (BETA)** - AI now answers both required and optional questions; auto-fill verification/confirmation experience questions with "Yes" before AI processing; smarter Location (City) react-select picks US/Canada cities based on user's state
- **v0.9.7 (BETA)** - UI refresh with Greenhouse-matching blue palette; improved unanswered question detection; smoother success banner timing
- **v0.9.6.2 (BETA)** — Switched to Cloudflare Worker proxy for secure API key handling; ready for Chrome Web Store
- **v0.9.6 (BETA)** — Claude AI integration for answering custom questions; improved React-Select handling; AI toggle in sidepanel
- **v0.9.5 (BETA)** — Greenhouse autofill + attachments upload stabilized; safe-mode guard added for dynamic/hydrating pages

---

## License

MIT License - see LICENSE file for details.
