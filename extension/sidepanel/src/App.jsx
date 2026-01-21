import React, { useState, useEffect } from 'react'
import { User, Briefcase, FileText, Zap, Check, AlertCircle, Upload, Save, Shield, GraduationCap } from 'lucide-react'

// Country options with area codes
const COUNTRY_OPTIONS = [
  { value: 'US', label: 'US (+1)', code: '+1' },
  { value: 'Canada', label: 'Canada (+1)', code: '+1' },
  { value: 'China', label: 'China (+86)', code: '+86' },
  { value: 'Hong Kong', label: 'Hong Kong (+852)', code: '+852' },
  { value: 'UK', label: 'UK (+44)', code: '+44' },
  { value: 'India', label: 'India (+91)', code: '+91' },
  { value: 'Other', label: 'Other (custom)', code: '' }
]

// Work Authorization options
const WORK_AUTH_OPTIONS = [
  { value: 'US Citizen', label: 'US Citizen', needsSponsorship: false },
  { value: 'US Permanent Resident', label: 'US Permanent Resident', needsSponsorship: false },
  { value: 'Canadian Citizen', label: 'Canadian Citizen', needsSponsorship: false },
  { value: 'Canadian Permanent Resident', label: 'Canadian Permanent Resident', needsSponsorship: false },
  { value: 'H1B', label: 'H1B Visa', needsSponsorship: true },
  { value: 'O1', label: 'O1 Visa', needsSponsorship: true },
  { value: 'OPT', label: 'OPT', needsSponsorship: true },
  { value: 'CPT', label: 'CPT', needsSponsorship: true },
  { value: 'L1', label: 'L1 Visa', needsSponsorship: true },
  { value: 'TN', label: 'TN Visa', needsSponsorship: true },
  { value: 'Other', label: 'Other (needs sponsorship)', needsSponsorship: true }
]

// Degree options
const DEGREE_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: "Bachelor's Degree", label: "Bachelor's Degree" },
  { value: "Master's Degree", label: "Master's Degree" },
  { value: 'Master of Business Administration', label: 'MBA' },
  { value: 'Doctor of Philosophy', label: 'PhD / Doctorate' },
  { value: 'Other', label: 'Other' }
]

// US States
const US_STATES = [
  { value: '', label: 'Select...' },
  { value: 'Alabama', label: 'Alabama' },
  { value: 'Alaska', label: 'Alaska' },
  { value: 'Arizona', label: 'Arizona' },
  { value: 'Arkansas', label: 'Arkansas' },
  { value: 'California', label: 'California' },
  { value: 'Colorado', label: 'Colorado' },
  { value: 'Connecticut', label: 'Connecticut' },
  { value: 'Delaware', label: 'Delaware' },
  { value: 'District of Columbia', label: 'District of Columbia' },
  { value: 'Florida', label: 'Florida' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Hawaii', label: 'Hawaii' },
  { value: 'Idaho', label: 'Idaho' },
  { value: 'Illinois', label: 'Illinois' },
  { value: 'Indiana', label: 'Indiana' },
  { value: 'Iowa', label: 'Iowa' },
  { value: 'Kansas', label: 'Kansas' },
  { value: 'Kentucky', label: 'Kentucky' },
  { value: 'Louisiana', label: 'Louisiana' },
  { value: 'Maine', label: 'Maine' },
  { value: 'Maryland', label: 'Maryland' },
  { value: 'Massachusetts', label: 'Massachusetts' },
  { value: 'Michigan', label: 'Michigan' },
  { value: 'Minnesota', label: 'Minnesota' },
  { value: 'Mississippi', label: 'Mississippi' },
  { value: 'Missouri', label: 'Missouri' },
  { value: 'Montana', label: 'Montana' },
  { value: 'Nebraska', label: 'Nebraska' },
  { value: 'Nevada', label: 'Nevada' },
  { value: 'New Hampshire', label: 'New Hampshire' },
  { value: 'New Jersey', label: 'New Jersey' },
  { value: 'New Mexico', label: 'New Mexico' },
  { value: 'New York', label: 'New York' },
  { value: 'North Carolina', label: 'North Carolina' },
  { value: 'North Dakota', label: 'North Dakota' },
  { value: 'Ohio', label: 'Ohio' },
  { value: 'Oklahoma', label: 'Oklahoma' },
  { value: 'Oregon', label: 'Oregon' },
  { value: 'Pennsylvania', label: 'Pennsylvania' },
  { value: 'Rhode Island', label: 'Rhode Island' },
  { value: 'South Carolina', label: 'South Carolina' },
  { value: 'South Dakota', label: 'South Dakota' },
  { value: 'Tennessee', label: 'Tennessee' },
  { value: 'Texas', label: 'Texas' },
  { value: 'Utah', label: 'Utah' },
  { value: 'Vermont', label: 'Vermont' },
  { value: 'Virginia', label: 'Virginia' },
  { value: 'Washington', label: 'Washington' },
  { value: 'West Virginia', label: 'West Virginia' },
  { value: 'Wisconsin', label: 'Wisconsin' },
  { value: 'Wyoming', label: 'Wyoming' }
]

// Canadian Provinces and Territories
const CA_PROVINCES = [
  { value: '', label: 'Select...' },
  { value: 'Alberta', label: 'Alberta' },
  { value: 'British Columbia', label: 'British Columbia' },
  { value: 'Manitoba', label: 'Manitoba' },
  { value: 'New Brunswick', label: 'New Brunswick' },
  { value: 'Newfoundland and Labrador', label: 'Newfoundland and Labrador' },
  { value: 'Northwest Territories', label: 'Northwest Territories' },
  { value: 'Nova Scotia', label: 'Nova Scotia' },
  { value: 'Nunavut', label: 'Nunavut' },
  { value: 'Ontario', label: 'Ontario' },
  { value: 'Prince Edward Island', label: 'Prince Edward Island' },
  { value: 'Quebec', label: 'Quebec' },
  { value: 'Saskatchewan', label: 'Saskatchewan' },
  { value: 'Yukon', label: 'Yukon' }
]

// Generate year options
const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [
  { value: '', label: 'Select...' },
  ...Array.from({ length: currentYear - 1999 }, (_, i) => ({
    value: String(currentYear - i),
    label: String(currentYear - i)
  }))
]

const LGBTQ_OPTIONS = [
  { label: "Prefer not to say", value: "Prefer not to say" },
  { label: "No", value: "No" },
  { label: "Yes", value: "Yes" },
];

const RACE_ETHNICITY_OPTIONS = [
  { label: "Prefer not to say", value: "Prefer not to say" },
  { label: "East Asian", value: "East Asian" },
  { label: "South Asian", value: "South Asian" },
  { label: "Southeast Asian", value: "Southeast Asian" },
  { label: "White", value: "White" },
  { label: "Black or African American", value: "Black or African American" },
  { label: "Hispanic or Latino", value: "Hispanic or Latino" },
  { label: "Native Hawaiian or Other Pacific Islander", value: "Native Hawaiian or Other Pacific Islander" },
  { label: "American Indian or Alaska Native", value: "American Indian or Alaska Native" },
  { label: "Other", value: "Other" },
];

// Chrome storage helper
const storage = {
  get: (keys) => new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(keys, resolve)
    } else {
      const result = {}
      keys.forEach(key => {
        const item = localStorage.getItem(key)
        if (item) result[key] = JSON.parse(item)
      })
      resolve(result)
    }
  }),
  set: (data) => new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(data, resolve)
    } else {
      Object.entries(data).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value))
      })
      resolve()
    }
  })
}

// Send message to background script
const sendMessage = (message) => new Promise((resolve) => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage(message, resolve)
  } else {
    // Development mode fallback (browser without extension APIs)
    resolve({ success: true })
  }
})

function App() {
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({
    // Basic Info
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    email: '',
    country: 'US',
    custom_area_code: '',
    phone: '',
    city: '',
    state: '',
    zip: '',
    // Professional
    current_company: '',
    linkedin: '',
    github: '',
    website: '',
    // Work Authorization
    work_authorization: 'OPT',
    // Education
    school: '',
    degree: '',
    discipline: '',
    edu_start_year: '',
    edu_end_year: '',
    // Demographics (EEO)
    gender: 'Decline to Self Identify',
    pronouns: 'Decline to Self Identify',
    lgbtq: "Prefer not to say",
    hispanic_latino: 'Decline to Self Identify',
    race_ethnicity: "Prefer not to say",
    veteran_status: 'Decline to Self Identify',
    disability_status: 'Decline to Self Identify'
  })
  const [resumeData, setResumeData] = useState(null)
  const [coverLetterData, setCoverLetterData] = useState(null)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [formType, setFormType] = useState(null)
  const [saveStatus, setSaveStatus] = useState({})

  // Load saved data on mount
  useEffect(() => {
    storage.get(['userData', 'resumeData', 'coverLetterData']).then((result) => {
      if (result.userData) setFormData(prev => ({ ...prev, ...result.userData }))
      if (result.resumeData) setResumeData(result.resumeData)
      if (result.coverLetterData) setCoverLetterData(result.coverLetterData)
    })
    
    sendMessage({ type: 'DETECT_FORM' }).then((result) => {
      if (result) setFormType(result)
    })
  }, [])

  // Handle input change
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setSaveStatus(prev => ({ ...prev, [activeTab]: null }))
  }

  // Get area code for selected country
  const getAreaCode = () => {
    if (formData.country === 'Other') {
      return formData.custom_area_code || ''
    }
    const country = COUNTRY_OPTIONS.find(c => c.value === formData.country)
    return country?.code || ''
  }

  // Get full phone number with country code
  const getFullPhoneNumber = () => {
    const areaCode = getAreaCode()
    const phone = formData.phone.replace(/^(\+\d+\s?)/, '')
    return areaCode ? `${areaCode} ${phone}` : phone
  }

  // Check if user needs sponsorship based on work authorization
  const needsSponsorship = () => {
    const auth = WORK_AUTH_OPTIONS.find(a => a.value === formData.work_authorization)
    return auth?.needsSponsorship ?? true
  }

  // Manual save function
  const handleSave = async () => {
    const dataToSave = {
      ...formData,
      phone_full: getFullPhoneNumber(),
      needs_sponsorship: needsSponsorship()
    }
    await storage.set({ userData: dataToSave, autoFillEnabled: true })
    setSaveStatus(prev => ({ ...prev, [activeTab]: 'saved' }))
    setStatus({ type: 'success', message: 'Saved!' })
    setTimeout(() => setStatus({ type: '', message: '' }), 2000)
  }

  // Handle file upload (resume, cover letter)
  const handleFileUpload = (e, type) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      const data = {
        filename: file.name,
        mimeType: file.type,
        content: base64,
        size: file.size
      }
      
      if (type === 'resume') {
        setResumeData(data)
        storage.set({ resumeData: data })
        setStatus({ type: 'success', message: `Resume "${file.name}" saved!` })
      } else {
        setCoverLetterData(data)
        storage.set({ coverLetterData: data })
        setStatus({ type: 'success', message: `Cover letter "${file.name}" saved!` })
      }
      setTimeout(() => setStatus({ type: '', message: '' }), 3000)
    }
    reader.readAsDataURL(file)
  }

  // Trigger autofill
  const handleAutofill = async () => {
    setStatus({ type: 'loading', message: 'Filling form...' })
    
    try {
      const result = await sendMessage({
        type: 'TRIGGER_AUTOFILL',
        userData: { 
          ...formData, 
          phone_full: getFullPhoneNumber(),
          needs_sponsorship: needsSponsorship()
        },
        resumeData: resumeData,
        coverLetterData: coverLetterData
      })
      
      if (result && result.filled) {
        const filledCount = result.filled.length
        const resumeMsg = result.resumeUploaded ? ` Resume uploaded!` : ''
        setStatus({ type: 'success', message: `Filled ${filledCount} fields!${resumeMsg}` })
      } else {
        setStatus({ type: 'error', message: 'Could not fill form. Make sure you are on an application page.' })
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'Error: ' + error.message })
    }
    
    setTimeout(() => setStatus({ type: '', message: '' }), 12000)
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'work', label: 'Work', icon: Briefcase },
    { id: 'edu', label: 'Edu', icon: GraduationCap },
    { id: 'eeo', label: 'EEO', icon: Shield },
    { id: 'docs', label: 'Docs', icon: FileText },
  ]

  // Save button component
  const SaveButton = () => (
    <button
      onClick={handleSave}
      className={`w-full mt-4 py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${
        saveStatus[activeTab] === 'saved'
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
      }`}
    >
      {saveStatus[activeTab] === 'saved' ? (
        <>
          <Check size={16} />
          Saved
        </>
      ) : (
        <>
          <Save size={16} />
          Save
        </>
      )}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
        <h1 className="text-lg font-semibold">Auto-Apply Helper</h1>
        {formType && formType.detected && (
          <p className="text-blue-100 text-sm mt-1">
            Detected: {formType.type.charAt(0).toUpperCase() + formType.type.slice(1)} form
          </p>
        )}
      </div>

      {/* Status Message */}
      {status.message && (
        <div className={`p-3 flex items-center gap-2 ${
          status.type === 'success' ? 'bg-green-50 text-green-700' :
          status.type === 'error' ? 'bg-red-50 text-red-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          {status.type === 'success' && <Check size={16} />}
          {status.type === 'error' && <AlertCircle size={16} />}
          <span className="text-sm">{status.message}</span>
        </div>
      )}

      {/* Autofill Button */}
      <div className="p-4 border-b bg-white">
        <button
          onClick={handleAutofill}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Zap size={18} />
          Fill Application
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-1 flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 space-y-3">
        {activeTab === 'profile' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="First Name *"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
              />
              <InputField
                label="Last Name *"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
              />
            </div>
            <InputField
              label="Preferred First Name"
              name="preferred_first_name"
              value={formData.preferred_first_name}
              onChange={handleInputChange}
              placeholder="Optional"
            />
            <InputField
              label="Email *"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
            />
            <div className="grid grid-cols-3 gap-3">
              <SelectField
                label="Country"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                options={COUNTRY_OPTIONS.map(c => ({ value: c.value, label: c.label }))}
              />
              <div className="col-span-2">
                <InputField
                  label="Phone *"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="Phone number"
                />
              </div>
            </div>
            {formData.country === 'Other' && (
              <InputField
                label="Custom Area Code"
                name="custom_area_code"
                value={formData.custom_area_code}
                onChange={handleInputChange}
                placeholder="+1, +86, etc."
              />
            )}
            {formData.phone && (
              <p className="text-xs text-gray-500">
                Full number: {getFullPhoneNumber()}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <InputField
                label="City"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
              />
              <SelectField
                label="State/Province"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                options={formData.country === 'Canada' ? CA_PROVINCES : US_STATES}
              />
              <InputField
                label="ZIP"
                name="zip"
                value={formData.zip}
                onChange={handleInputChange}
              />
            </div>
            <SaveButton />
          </>
        )}

        {activeTab === 'work' && (
          <>
            <InputField
              label="Current Company"
              name="current_company"
              value={formData.current_company}
              onChange={handleInputChange}
              placeholder="e.g., Google, Amazon, Startup Inc."
            />
            <InputField
              label="LinkedIn URL"
              name="linkedin"
              value={formData.linkedin}
              onChange={handleInputChange}
              placeholder="https://linkedin.com/in/..."
            />
            <InputField
              label="GitHub URL"
              name="github"
              value={formData.github}
              onChange={handleInputChange}
              placeholder="https://github.com/..."
            />
            <InputField
              label="Portfolio / Website"
              name="website"
              value={formData.website}
              onChange={handleInputChange}
              placeholder="https://..."
            />
            <SelectField
              label="Work Authorization"
              name="work_authorization"
              value={formData.work_authorization}
              onChange={handleInputChange}
              options={WORK_AUTH_OPTIONS.map(a => ({ value: a.value, label: a.label }))}
            />
            <div className={`text-xs p-2 rounded ${needsSponsorship() ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
              {needsSponsorship() 
                ? '⚠️ Will answer "Yes" to sponsorship questions'
                : '✓ Will answer "No" to sponsorship questions'
              }
            </div>
            <SaveButton />
          </>
        )}

        {activeTab === 'edu' && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              Enter your most recent/relevant education.
            </p>
            <InputField
              label="School Name *"
              name="school"
              value={formData.school}
              onChange={handleInputChange}
              placeholder="Full name: University of Illinois - Urbana-Champaign"
            />
            <p className="text-xs text-gray-500 -mt-2 mb-2">
              Use full name with " - " for multi-campus schools
            </p>
            <SelectField
              label="Degree *"
              name="degree"
              value={formData.degree}
              onChange={handleInputChange}
              options={DEGREE_OPTIONS}
            />
            <InputField
              label="Discipline / Major *"
              name="discipline"
              value={formData.discipline}
              onChange={handleInputChange}
              placeholder="e.g., Computer Science"
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Start Year"
                name="edu_start_year"
                value={formData.edu_start_year}
                onChange={handleInputChange}
                options={YEAR_OPTIONS}
              />
              <SelectField
                label="End Year (or Expected)"
                name="edu_end_year"
                value={formData.edu_end_year}
                onChange={handleInputChange}
                options={YEAR_OPTIONS}
              />
            </div>
            <SaveButton />
          </>
        )}

        {activeTab === 'eeo' && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              Equal Employment Opportunity information. These are optional and used for compliance reporting.
            </p>
            <SelectField
              label="Gender"
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              options={[
                { value: 'Decline to Self Identify', label: 'Decline to Self Identify' },
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Non-Binary', label: 'Non-Binary' }
              ]}
            />
            <SelectField
              label="Pronouns"
              name="pronouns"
              value={formData.pronouns}
              onChange={handleInputChange}
              options={[
                { value: 'Decline to Self Identify', label: 'Decline to Self Identify' },
                { value: 'He/him/his', label: 'He/him/his' },
                { value: 'She/her/hers', label: 'She/her/hers' },
                { value: 'They/them/theirs', label: 'They/them/theirs' },
                { value: 'I prefer not to say', label: 'I prefer not to say' }
              ]}
            />
            <SelectField
              label="Do you identify as LGBTQ+?"
              name="lgbtq"
              value={formData.lgbtq || ""}
              options={LGBTQ_OPTIONS}
              onChange={handleInputChange}
            />
            <SelectField
              label="Are you Hispanic/Latino?"
              name="hispanic_latino"
              value={formData.hispanic_latino}
              onChange={handleInputChange}
              options={[
                { value: 'Decline to Self Identify', label: 'Decline to Self Identify' },
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' }
              ]}
            />
            <SelectField
              label="Race / Ethnicity"
              name="race_ethnicity"
              value={formData.race_ethnicity || ""}
              options={RACE_ETHNICITY_OPTIONS}
              onChange={handleInputChange}
            />
            <SelectField
              label="Veteran Status"
              name="veteran_status"
              value={formData.veteran_status}
              onChange={handleInputChange}
              options={[
                { value: 'Decline to Self Identify', label: 'Decline to Self Identify' },
                { value: 'I am a veteran', label: 'I am a veteran' },
                { value: 'I am not a veteran', label: 'I am not a veteran' }
              ]}
            />
            <SelectField
              label="Disability Status"
              name="disability_status"
              value={formData.disability_status}
              onChange={handleInputChange}
              options={[
                { value: 'Decline to Self Identify', label: 'Decline to Self Identify' },
                { value: 'Yes, I have a disability', label: 'Yes, I have a disability' },
                { value: 'No, I do not have a disability', label: 'No, I do not have a disability' }
              ]}
            />
            <SaveButton />
          </>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-4">
            
            {/* Resume Upload */}
            <div className="border-2 rounded-lg p-3 border-blue-500 bg-blue-50">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center bg-white">
                <input
                  type="file"
                  id="resume-upload"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => handleFileUpload(e, 'resume')}
                  className="hidden"
                />
                <label htmlFor="resume-upload" className="cursor-pointer flex flex-col items-center gap-1">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-xs text-gray-600">Upload Resume</span>
                  <span className="text-xs text-gray-400">PDF, DOC, DOCX</span>
                </label>
              </div>
              {resumeData && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
                  <FileText className="text-green-600" size={16} />
                  <span className="text-xs text-green-800 truncate flex-1">{resumeData.filename}</span>
                  <button
                    onClick={() => { setResumeData(null); storage.set({ resumeData: null }) }}
                    className="text-green-600 hover:text-green-800 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Cover Letter Upload */}
            <div className="border-2 border-gray-200 rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Cover Letter (Optional)</h3>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center">
                <input
                  type="file"
                  id="cover-letter-upload"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => handleFileUpload(e, 'coverLetter')}
                  className="hidden"
                />
                <label htmlFor="cover-letter-upload" className="cursor-pointer flex flex-col items-center gap-1">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-xs text-gray-600">Upload Cover Letter</span>
                  <span className="text-xs text-gray-400">PDF, DOC, DOCX</span>
                </label>
              </div>
              {coverLetterData && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
                  <FileText className="text-green-600" size={16} />
                  <span className="text-xs text-green-800 truncate flex-1">{coverLetterData.filename}</span>
                  <button
                    onClick={() => { setCoverLetterData(null); storage.set({ coverLetterData: null }) }}
                    className="text-green-600 hover:text-green-800 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Input Field Component
function InputField({ label, name, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
      />
    </div>
  )
}

// Select Field Component
function SelectField({ label, name, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default App
