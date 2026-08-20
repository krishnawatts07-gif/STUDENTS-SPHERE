# Student Sphere 🎓

Student Sphere is an AI-powered student achievement organizer, skill manager, and ATS resume builder with an integrated Career & Resume Advisor.

## 🚀 Quick Setup & Installation on Another System

To run this application on any computer:

### 1. Clone the repository
```bash
git clone https://github.com/Krishna597441/STUDENTS-SPHERE.git
cd STUDENTS-SPHERE
```

### 2. Install dependencies
Run the command below (this reads `package.json` / `requirements.txt` and installs all necessary packages):
```bash
npm install
```

### 3. Setup Environment Variables
Create a `.env` file in the root directory with your API keys:
```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

VITE_GROQ_API_KEY=your_groq_api_key
VITE_AZURE_OPENAI_ENDPOINT=your_azure_endpoint
VITE_AZURE_OPENAI_API_KEY=your_azure_api_key
VITE_AZURE_OPENAI_MODEL=gpt-4.1-mini
```

### 4. Run the Application
Start both the Express backend and Vite frontend server together:
```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 📦 Required Packages Checklist (`requirements.txt`)

- **Firebase**: `firebase`
- **PDF Processing**: `jspdf`, `pdfjs-dist`
- **AI Integrations**: `@google/generative-ai`, `@google/genai`, `groq-sdk`
- **Backend & Middleware**: `express`, `nodemailer`, `cors`, `dotenv`
- **Dev Tools**: `vite`, `concurrently`
