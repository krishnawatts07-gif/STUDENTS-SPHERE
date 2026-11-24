import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.log("VITE_GEMINI_API_KEY is not set in environment.");
  process.exit(0);
}
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  try {
    console.log("Testing gemini-3.6-flash sendMessageStream...");
    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction: "You are a concise advisor."
    });
    const chat = model.startChat({ history: [] });
    const resultStream = await chat.sendMessageStream("hello");
    for await (const chunk of resultStream.stream) {
      process.stdout.write(chunk.text());
    }
    console.log("\nSUCCESS!");
  } catch (e) {
    console.log("\nFAILED:", e.message);
  }
}

test();
