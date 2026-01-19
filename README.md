# Auto-Apply Helper (BETA)

A Chrome extension that helps you autofill **Greenhouse** job application forms quickly using a Side Panel profile. Built to reduce repetitive typing, handle common Greenhouse UI patterns (including **React-Select** dropdowns), and keep your data stored locally.

> Status: **BETA** — optimized for Greenhouse applications; other ATS platforms are not supported yet.

---

## Features

### ✅ Greenhouse autofill (current focus)

- Detects Greenhouse application pages and enables one-click autofill
- Fills common fields across Profile / Work / Education / EEO sections
- Handles:
  - Standard `<input>` / `<textarea>` fields
  - Native `<select>`
  - Radio groups (common Yes/No questions)
  - **React-Select** dropdowns (including searchable combobox-style selects)

### ✅ EEO support (practical defaults)

- Gender + Gender identity (prevents “male” matching “feMALE”)
- Race/Ethnicity (single choice from side panel)
  - Special logic: if user selects **East/South/Southeast Asian** but the form only has **Asian**, it will fall back to **Asian**
  - Avoids adding extra race chips repeatedly on multi-select pages
- Veteran status
- Disability status
- Hispanic/Latino status (where present)

### ✅ Documents

- Resume upload support (where Greenhouse provides file upload components)
- (Optional) cover letter file upload where present

### ✅ Local-first storage

- Uses `chrome.storage.local` to save profile fields and preferences on the user’s machine.

---

## How it works (high-level)

- **Side Panel UI** collects user profile + preferences (Profile / Work / Edu / EEO / Docs).
- **Content script** (`content/autofill.js`) runs on Greenhouse job application pages and:
  - detects fillable fields
  - matches questions by label text / surrounding container text
  - fills values using robust DOM events (including pointer-event sequences for React-Select)
- **Service worker** coordinates messaging between the side panel and the content script (and optional notifications).

---

## Project structure (typical)

```

job-application-autofill/
├── extension/
│   ├── manifest.json
│   ├── content/
│   │   └── autofill.js
│   ├── sidepanel/
│   │   ├── src/
│   │   │   └── App.jsx
│   │   └── dist/          # built output
│   └── ... (service worker, assets, etc.)
├── backend/               # reserved / experimental (optional)
└── README.md

```

---

## Installation (Load Unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder

---

## Usage

1. Open a Greenhouse application page, e.g.:
   - `https://job-boards.greenhouse.io/<company>/jobs/<id>`
2. Open the extension Side Panel
3. Fill your profile fields and click **Save**
4. Click **Fill Application**
5. Check the form and submit manually (recommended)

> The extension is designed to assist — always review fields before submitting.

---

## Build / Dev workflow (Side Panel UI)

If your side panel uses Vite/React (common setup):

```bash
cd extension/sidepanel
npm install
npm run build
````

Then:

* go to `chrome://extensions`
* click **Reload** on the extension
* reopen the side panel

> If you use `npm run dev`, it typically runs a dev server, but the extension will still load the **built** assets in `dist/` unless you specifically wire dev-mode loading.

---

## Configuration fields (Side Panel)

Common fields you can store (example):

* **Profile**: name, email, phone, location, LinkedIn, GitHub, portfolio/website, current company
* **Work/Edu**: recent job title/company, degree/school, etc.
* **EEO**: gender, race/ethnicity, veteran, disability, hispanic/latino, LGBTQ+
* **Docs**: resume file, optional cover letter

Exact fields may evolve as the project grows.

---

## Known limitations (BETA)

* Only supports **Greenhouse** reliably (others may partially work but are not a goal yet)
* Some companies customize forms heavily (rare edge cases may still require manual entry)
* Duplicate EEO sections can exist; logic is designed to fill repeated questions safely, but always double-check
* EEO forms can be:

  * single-select or multi-select
  * searchable or fixed lists
  * different phrasing for the same question
    This extension uses heuristic matching to stay robust.

---

## Privacy & Security

* User profile data is stored in **`chrome.storage.local`** (local to your browser profile)
* The extension does **not** submit applications automatically
* You should review every field before final submission
* If/when an AI API is added:

  * it should be opt-in
  * it should avoid sending sensitive data unnecessarily
  * it should clearly disclose what is sent and why

---

## Roadmap (next likely improvements)

* Smarter question understanding (optional AI) to reduce manual mappings
* More robust handling for “custom question” textareas and long prompts
* Better page detection + user-friendly notifications
* Support more ATS platforms (Workday, Lever, etc.) — after Greenhouse is rock-solid
* More reliable file upload detection across variants

---

## Contributing

PRs welcome. If you’re adding new form handlers:

* prefer **label-based matching**
* avoid brittle CSS selectors when possible
* always skip hidden/disabled fields
* prevent repeated runs from adding unintended extra selections

---

## License

See `LICENSE`.
