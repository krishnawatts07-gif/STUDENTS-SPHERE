import { BackendAPI } from './apiService.js';

async function runTest() {
  console.log("Starting Backend Test...");

  const userMessage = "I built FinTrack, a personal finance web app using React and Firebase. It tracks income and expenses.";

  try {
    console.log("Sending data to Gemini API...");
    const resumeData = await BackendAPI.generateResumeData(userMessage);
    
    console.log("SUCCESS! Here is the JSON output:");
    console.log(JSON.stringify(resumeData, null, 2));
  } catch (error) {
    console.error("TEST FAILED:", error);
  }
}

runTest();
