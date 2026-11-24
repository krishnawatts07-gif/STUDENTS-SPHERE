// apiService.js
import Groq from "groq-sdk";
import { auth, db, googleProvider, signInWithPopup } from './firebaseConfig.js';
import { collection, addDoc } from 'firebase/firestore';

// Initialize Groq SDK conditionally to prevent crash when disabled/paused
const apiKey = import.meta.env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env?.VITE_GROQ_API_KEY : undefined);
let groq = null;
if (apiKey && apiKey.trim()) {
  try {
    groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  } catch (err) {
    console.error("Failed to instantiate Groq SDK:", err);
  }
}

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
      if (!groq) throw new Error("Groq client is not initialized (missing API key).");
      const systemInstruction = `You are an expert technical recruiter. Reformat the following input into a professional, ATS-friendly JSON object with keys: summary, projects, skills. Return strictly JSON with no extra markdown formatting or conversational text.`;

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Student Input: ${userMessage}` }
        ],
        model: "openai/gpt-oss-20b"
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
  },

  sendGroqChatMessage: async (history = [], message) => {
    try {
      if (!groq) throw new Error("Groq client is not initialized (missing API key).");
      if (!apiKey) throw new Error("Groq API key is not configured.");
      
      const systemInstruction = `You are Student Sphere AI, an expert academic advisor, career strategist, and resume mentor for students.

Scope of Guidance:
1. Academics: Coursework strategy, study habits, exam prep, GPA improvement, higher studies, degrees, and academic certifications.
2. Skills Guidance: Technical & soft skill roadmaps, programming languages, tools, frameworks, learning resources, and skill gap analysis.
3. Profile & Resume Optimization: Phrasing achievements with metrics, ATS resume reviews, project ideas, and portfolio building.
4. Career & Internships: Career path exploration, role matching, job search strategies, interview preparation, and industry trends.

Formatting Instructions:
- ALWAYS structure your responses cleanly using Markdown headers (###), bullet points (-), bold key terms (**key concept**), and numbered lists.
- NEVER output plain, unstructured walls of paragraph text.

CRITICAL BEHAVIORAL DIRECTIVES:
- DIRECT & SPECIFIC: Answer ONLY the user's specific question. Be extremely concise. Do not automatically dump career roadmaps or analyze their profile context unless explicitly asked.
- GREETINGS: If the user says "hello", "hi", "hey", or another greeting, simply reply with a warm greeting and ask how you can help them, without analyzing their profile or listing recommendations.`;

      const messages = [
        { role: "system", content: systemInstruction },
        ...history.map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content || item.text || ""
        })),
        { role: "user", content: message }
      ];

      const chatCompletion = await groq.chat.completions.create({
        messages,
        model: "openai/gpt-oss-20b"
      });

      return chatCompletion.choices[0]?.message?.content || "I could not generate a response.";
    } catch (error) {
      console.error("Groq Chat failed:", error);
      throw error;
    }
  }
};

export default BackendAPI;
