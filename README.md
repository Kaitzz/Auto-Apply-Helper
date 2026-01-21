# Auto-Apply Helper (BETA) — v0.9.5

A Chrome extension that helps you **autofill job application forms** (Greenhouse-first), including **basic fields + resume/attachments upload**.

> Status: **BETA** — works best on Greenhouse job application pages.  
> If you see a warning like `form not settled in time; continue in safe mode`, the extension will continue carefully without trying to “fight” the page hydration.

---

## ✨ What it does

- Detects supported job application pages and shows an **in-page notification** with a quick action to open the side panel. :contentReference[oaicite:0]{index=0}
- Autofills common fields (only when the field is empty to avoid overwriting your manual input):
  - First name / Last name / Preferred name / Email / Phone
  - City / State / ZIP
  - LinkedIn / GitHub / Website/Portfolio
  - School / Degree / Major/Discipline / Education years
  - Current company
  - Some authorization / sponsorship / demographic-like fields (best-effort, depends on how the site implements them) :contentReference[oaicite:1]{index=1}
- Uploads attachments (Resume/CV, Cover Letter, etc.) when the form provides upload controls.
- “Safe mode” guard on dynamic pages: if the page is still “settling” (React hydration / re-render), it will avoid aggressive actions that may break the form UI.

---

## ✅ Supported sites (current)

### Greenhouse

- Job application pages under `*.greenhouse.io/.../jobs/<number>` are detected as application pages. :contentReference[oaicite:2]{index=2}

### Generic application pages (best-effort)

- If the page contains `#application_form` or a form whose action contains `apply`, the extension will attempt a generic autofill. :contentReference[oaicite:3]{index=3}

> Not currently supported / unreliable: Workday-style multi-step portals, highly customized SPA portals with anti-automation guardrails.

---

## 🚀 How to use

1. **Install the extension**
   - If you’re developing locally: load unpacked from `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the extension folder.

2. **Open a job application page**
   - Example: a Greenhouse job page with an **Apply** form.

3. **When the notification appears**, click **“Open Panel to Update Info”**
   - This opens the side panel where you can edit and save your profile data.

4. **Autofill runs automatically**
   - It will only fill fields that are currently empty.
   - If the page is dynamic, you may see a warning:
     - `form not settled in time; continue in safe mode`
   - That’s expected in BETA — the extension proceeds conservatively.

---

## 🔐 Data & Privacy

- Your profile data is stored locally using Chrome extension storage (`chrome.storage.local`).
- This extension does **not** sell or share your data.
- The extension only runs on supported application pages and only uses your data to fill the form fields you see.

> If you plan to publish to the Chrome Web Store, include a `PRIVACY_POLICY.md` in the repo and link it in the listing.

---

## 🧰 Development

### Debug logging

- The content script includes debug logs (e.g. `[JobAutofill] ...`). :contentReference[oaicite:4]{index=4}  
- You can inspect logs via **DevTools → Console** on the job application page.

### Typical workflow

1. Make code changes
2. Go to `chrome://extensions`
3. Click **Reload** on the extension
4. Refresh the job application page

---

## 🩺 Troubleshooting

### “It says it filled, but the input is still empty”

Some sites (especially React-controlled inputs) ignore direct `element.value = ...` unless the correct native setter + input events are used.  
In v0.9.5 we handle this more safely, but if you see regressions:

- Verify the field is not being immediately overwritten by the site after your fill event
- Check Console logs for “safe mode” or hydration-related warnings

### Warning: `form not settled in time; continue in safe mode`

This means the page didn’t reach a stable state quickly enough (DOM keeps changing / hydration still running).  
The extension continues conservatively to avoid triggering hydration crashes.

### React / hydration errors in the page console

You may see site-owned logs like React hydration errors (Rollbar / minified react-dom).  
These are usually **from the website itself**, and the extension’s goal is to **avoid making them worse** by running in safe mode.

---

## 🗺️ Roadmap (next)

- Improve coverage for “basic inputs” across more Greenhouse variants
- Better detection for multi-step application flows
- Optional “Fill anyway” button when safe mode triggers (manual override)
- Field mapping customization UI (user-defined selectors / aliases)

---

## 📌 Version

- **v0.9.5 (BETA)** — Greenhouse autofill + attachments upload stabilized; safe-mode guard added for dynamic/hydrating pages.

---

## License

TBD (MIT recommended if you plan to open-source).
