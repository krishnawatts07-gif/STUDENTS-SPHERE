import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY : undefined);
const genAI = new GoogleGenerativeAI(apiKey);

// System prompt defining the expert technical recruiter & resume-writing persona
export const RESUME_ASSISTANT_SYSTEM_PROMPT = `
You are Student Sphere AI, an expert academic advisor, career strategist, and resume mentor for students.

Scope of Guidance:
1. Academics: Coursework strategy, study habits, exam prep, GPA improvement, higher studies, degrees, and academic certifications.
2. Skills Guidance: Technical & soft skill roadmaps, programming languages, tools, frameworks, learning resources, and skill gap analysis.
3. Profile & Resume Optimization: Phrasing achievements with metrics, ATS resume reviews, project ideas, and portfolio building.
4. Career & Internships: Career path exploration, role matching, job search strategies, interview preparation, and industry trends.

Formatting Instructions (CRITICAL):
- ALWAYS structure your responses cleanly using Markdown headers (###), bullet points (-), bold key terms (**key concept**), and numbered lists.
- NEVER output plain, unstructured walls of paragraph text.
- Provide step-by-step actionable advice tailored to the student's profile context when provided.

When the user explicitly asks to 'Generate Resume' or 'Create PDF', output their profile strictly as a valid JSON object matching:
{
  "summary": "...",
  "education": [],
  "experience": [],
  "projects": [ { "title": "...", "techStack": [], "bullets": [] } ],
  "skills": []
}
`.trim();

/**
 * Handles communication with the Gemini Resume Assistant.
 * Supports interactive chat mode as well as raw JSON generation upon user request.
 * 
 * @param {Array<{role: string, content?: string, text?: string}>} history - Previous chat history.
 * @param {string} newMessage - New user input.
 * @returns {Promise<{ isJson: boolean, data: string | object }>} Object indicating whether output is plain chat text or structured JSON profile data.
 */
export const interactWithResumeAssistant = async (history = [], newMessage) => {
  try {
    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY environment variable is missing.");
    }

    // Configure model with System Instruction for system persona & behavior
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: RESUME_ASSISTANT_SYSTEM_PROMPT,
    });

    // Format chat history
    const formattedHistory = history.map((msg) => ({
      role: msg.role === "assistant" || msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text || msg.content || (typeof msg === "string" ? msg : "") }]
    }));

    // Start chat with system context
    const chat = model.startChat({
      history: formattedHistory
    });

    const result = await chat.sendMessage(newMessage);
    const response = await result.response;
    const rawText = response.text().trim();

    // Check if user requested resume generation or if response is JSON
    const isGenerateTrigger = /generate resume|create pdf/i.test(newMessage);

    if (isGenerateTrigger || (rawText.startsWith("{") && rawText.endsWith("}"))) {
      try {
        // Strip markdown backticks if present
        const cleanedJsonString = rawText.replace(/```json|```/g, "").trim();
        const parsedProfile = JSON.parse(cleanedJsonString);
        
        return {
          isJson: true,
          data: parsedProfile
        };
      } catch (jsonErr) {
        console.warn("Failed to parse response as JSON, returning raw text:", jsonErr);
      }
    }

    // Default conversational output
    return {
      isJson: false,
      data: rawText
    };
  } catch (error) {
    console.error("Error in interactWithResumeAssistant:", error.message);
    throw error;
  }
};
