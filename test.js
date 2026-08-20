// test.js
import { BackendAPI } from './apiService.js';

async function runTest() {
  const mockInput = "I built FinTrack, a personal finance mobile app. I also used Firebase instead of Supabase for the backend.";
  
  console.log("Generating Resume Data...");
  const data = await BackendAPI.generateResumeData(mockInput);
  
  console.log("Success! Extracted JSON:");
  console.log(data);
}

runTest();
