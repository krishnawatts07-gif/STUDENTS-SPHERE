// apiService.js
import Groq from "groq-sdk";
import { auth, db, googleProvider, signInWithPopup } from './firebaseConfig.js';
import { collection, addDoc } from 'firebase/firestore';

// Initialize Groq SDK with environment variable resolution
const apiKey = import.meta.env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env?.VITE_GROQ_API_KEY : undefined);
const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

export const BackendAPI = {
  loginWithGoogle: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  },

  saveAchievement: async (userId, category, data) => {
    try {
      // Saves to /users/{userId}/{category}
      const docRef = await addDoc(collection(db, "users", userId, category), data);
      return docRef.id;
    } catch (error) {
      console.error("Failed to save achievement:", error);
      throw error;
    }
  },

  generateResumeData: async (userMessage) => {
    try {
      const systemInstruction = `You are an expert technical recruiter. Reformat the following input into a professional, ATS-friendly JSON object with keys: summary, projects, skills. Return strictly JSON with no extra markdown formatting or conversational text.`;

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Student Input: ${userMessage}` }
        ],
        model: "openai/gpt-oss-20b",
        response_format: { type: "json_object" }
      });

      const rawText = chatCompletion.choices[0]?.message?.content || "{}";
      
      // Robust JSON extraction to extract json block even if model includes thinking notes
      const match = rawText.match(/\{[\s\S]*\}/);
      const jsonString = match ? match[0] : rawText.replace(/```json|```/g, "").trim();
      return JSON.parse(jsonString);

    } catch (error) {
      console.error("AI Generation failed:", error);
      throw error;
    }
  }
};

export default BackendAPI;
