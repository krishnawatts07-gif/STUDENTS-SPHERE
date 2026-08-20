const endpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
const apiKey = import.meta.env.VITE_AZURE_OPENAI_API_KEY;
const model = import.meta.env.VITE_AZURE_OPENAI_MODEL || 'gpt-4.1-mini';

export const sendAzureChatMessage = async (history = [], message) => {
  if (!endpoint || !apiKey) throw new Error('Azure OpenAI is not configured.');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You are Student Sphere, a warm but practical career mentor and resume coach for students. Discuss career doubts conversationally, ask useful follow-up questions, help choose roles and skills, suggest concrete next steps, and explain trade-offs. Use the student profile context provided in each request. When asked for a resume, create a polished ATS-friendly resume using only the provided profile data; never invent employers, dates, scores, technologies, or achievements.' },
        ...history.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.content || item.text || '' })),
        { role: 'user', content: message }
      ]
    })
  });
  if (!response.ok) throw new Error(`Azure OpenAI request failed (${response.status}).`);
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || 'I could not generate a response.';
};
