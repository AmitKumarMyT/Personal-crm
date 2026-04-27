import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { question, context, mode } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let prompt = "";

    if (mode === 'dsa-help') {
      prompt = `
        As a Senior Software Engineer, help the user with this DSA problem.
        Problem: ${question.title}
        Current Code/Context: ${context || 'None provided'}
        
        Provide:
        1. Intuition/Approach
        2. Time and Space Complexity
        3. Optimal code snippet (in Python or TypeScript)
        
        Keep it concise and technical. Use markdown.
      `;
    } else if (mode === 'career-roadmap') {
      prompt = `
        Generate a structured career roadmap for: "${question}".
        Include:
        1. Essential Concepts (Core CS + Domain specific)
        2. Recommended Projects (Beginner to Advanced)
        3. Learning Resources (Standard industry pointers)
        
        Format as a JSON array of steps if possible, or clear markdown steps.
      `;
    } else if (mode === 'affordability') {
      prompt = `
        Decide if the user can afford an item based on statistics.
        Item Price: ₹${question.price}
        Daily Budget: ₹${question.dailyBudget}
        Remaining Month Days: ${question.daysLeft}
        
        Analyze the risk and provide a tactical financial decision.
      `;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
