const endpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
const apiKey = import.meta.env.VITE_AZURE_OPENAI_API_KEY;
const model = import.meta.env.VITE_AZURE_OPENAI_MODEL || 'gpt-4.1-mini';

export const sendAzureChatMessage = async (history = [], message) => {
  if (!endpoint || !apiKey) throw new Error('Azure OpenAI is not configured.');
  const systemPrompt = `You are Student Sphere AI, an expert academic advisor, career strategist, and resume mentor for students.

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.content || item.text || '' })),
          { role: 'user', content: message }
        ]
      })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`Azure OpenAI request failed (${response.status}).`);
    const payload = await response.json();
    return payload.choices?.[0]?.message?.content || 'I could not generate a response.';
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};
