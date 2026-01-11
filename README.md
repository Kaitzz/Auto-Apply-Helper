# Auto-Apply Helper BETA

A Chrome extension that helps you automatically fills job application forms on various ATS (Applicant Tracking System) platforms.

## Features

- ✅ **One-click autofill** for job application forms
- ✅ **Greenhouse ATS support** with React Select dropdowns
- ✅ **Dual resume support** - Upload 2 resumes and select which to use
- ✅ **Cover letter upload**
- ✅ **EEO fields** auto-fill (Gender, Veteran Status, Disability Status, etc.)
- ✅ **Education fields** (School, Degree, Discipline, Years)
- ✅ **Work authorization** detection
- ✅ **Phone number** with country code selection
- ✅ **Data persistence** - Your info is saved locally in Chrome

## Supported Platforms

| Platform | Status |
|----------|--------|
| Greenhouse | ✅ Full support |
| Lever | 🔄 Coming soon |
| Workday | 🔄 Coming soon |

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/job-application-autofill.git
   cd job-application-autofill
   ```

2. Build the Side Panel UI:
   ```bash
   cd extension/sidepanel
   npm install
   npm run build
   cd ../..
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `extension` folder

4. The extension icon will appear in your toolbar

## Usage

1. Click the extension icon to open the side panel
2. Fill in your profile information (saved automatically)
3. Upload your resume(s) in the **Documents** tab
4. Navigate to a job application page (e.g., Greenhouse)
5. Click **Fill Application** button

## Project Structure

```
job-application-autofill/
├── extension/
│   ├── manifest.json        # Chrome extension manifest
│   ├── background.js        # Service worker
│   ├── content/
│   │   └── autofill.js     # Form filling logic
│   ├── sidepanel/          # React UI
│   │   ├── src/
│   │   │   └── App.jsx
│   │   └── dist/           # Built files
│   └── icons/
├── backend/                 # Optional FastAPI backend
│   ├── main.py
│   ├── models.py
│   └── schemas.py
└── README.md
```

## Technical Details

### Greenhouse React Select Handling

The extension uses **Pointer Events** to interact with React Select dropdowns:

```javascript
['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, ... }));
});
```

This is required because React Select validates that events are "trusted" mouse interactions.

### Data Storage

All user data is stored locally using `chrome.storage.local`:
- Profile information
- Resume files (base64 encoded)
- Selected resume preference

No data is sent to external servers.

## Development

### Building the Side Panel

```bash
cd extension/sidepanel
npm install
npm run dev    # Development with hot reload
npm run build  # Production build
```

### Running the Backend (Optional)

The backend is optional and provides logging/analytics:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for your job search!

## Disclaimer

This tool is for personal use to save time during job applications. Always review the filled information before submitting applications.
