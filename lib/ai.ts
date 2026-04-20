'use client';

import { GoogleGenAI, Type } from "@google/genai";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, where } from "firebase/firestore";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

const workoutSchema = {
  type: Type.OBJECT,
  properties: {
    session: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING },
        phase: { type: Type.STRING },
        duration_minutes: { type: Type.NUMBER },
        energy_level: { type: Type.STRING },
        completed: { type: Type.BOOLEAN }
      },
      required: ["date", "phase", "completed"]
    },
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          muscle_group: { type: Type.STRING },
          equipment: { type: Type.STRING },
          sets: { type: Type.NUMBER },
          reps: { type: Type.STRING },
          tempo: { type: Type.STRING },
          rest_seconds: { type: Type.NUMBER },
          rpe: { type: Type.STRING },
          notes: { type: Type.STRING },
          youtube_search_query: { type: Type.STRING, description: "A query to find a high-quality demonstration of this exercise on YouTube" }
        },
        required: ["name", "sets", "reps", "youtube_search_query"]
      }
    },
    summary: {
      type: Type.OBJECT,
      properties: {
        what_was_done: { type: Type.STRING },
        progression_signal: { type: Type.STRING }
      }
    }
  },
  required: ["session", "exercises"]
};

export async function generateWorkout(userId: string, chatHistory: any[], userProfile: any, apiKey?: string) {
  const customAi = apiKey ? new GoogleGenAI({ apiKey }) : ai;
  const model = "gemini-3-flash-preview";

  // Fetch last 3 workouts for context
  const workoutsSnap = await getDocs(
    query(
      collection(db, 'users', userId, 'workouts'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(3)
    )
  );
  const lastWorkouts = workoutsSnap.docs.map(d => d.data());

  const systemPrompt = `You are a high-performance Hypertrophy Coach for a user focusing on muscle growth.
User Profile: ${JSON.stringify(userProfile)}
Equipment: Dumbbells, Chair, Bodyweight ONLY.
Phase Priority: Arms -> Legs -> Core (cycle).
Context of last workouts: ${JSON.stringify(lastWorkouts)}

Your job is to interpret the user's input and generate an optimized hypertrophy workout plan.
If the user says they are sore, adjust the target.
If they did well, progress them (more reps/sets/weight).
Return the workout in the specified JSON format.
Always provide a detailed 'youtube_search_query' specifically for muscle-building technique.`;

  const response = await customAi.models.generateContent({
    model,
    contents: chatHistory.map(c => ({
      role: c.role === 'user' ? 'user' : 'model',
      parts: [{ text: c.text }]
    })),
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: workoutSchema,
    }
  });

  const workoutData = JSON.parse(response.text || '{}');
  
  // Save to Firebase
  const docRef = await addDoc(collection(db, 'users', userId, 'workouts'), {
    ...workoutData,
    userId,
    createdAt: serverTimestamp(),
  });

  return { id: docRef.id, ...workoutData };
}

const expenseSchema = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING },
    totalAmount: { type: Type.NUMBER },
    payer: { type: Type.STRING, description: "The handle of the person who paid (e.g. 'me', '@deepak')" },
    involvedMembers: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "List of handles involved in splitting (e.g. ['me', '@deepak', '@ankur'])"
    },
    splitWeights: {
      type: Type.OBJECT,
      description: "Optional mapping of handles to their share counts (e.g. {'@deepak': 2, '@ankur': 1})"
    },
    intent: { type: Type.STRING, enum: ["transaction", "query", "unknown"] }
  },
  required: ["totalAmount", "payer", "involvedMembers", "intent"]
};

export async function interpretExpense(userId: string, message: string, contacts: any[], apiKey?: string) {
  const customAi = apiKey ? new GoogleGenAI({ apiKey }) : ai;
  const model = "gemini-3-flash-preview";

  const systemPrompt = `You are a precise Expense Manager assistant. 
User Contacts Handles: ${JSON.stringify(contacts.map(c => c.handle || `@${c.name.toLowerCase().replace(/\s/g, '')}`))}
Your job is to parse messages like "I paid 300 for @deepak and @ankur" or "@deepak paid 150 for me".
- "I paid" or "me paid" means payer is "me".
- If the user says "@name paid for me and @other", payer is "@name".
- If a total amount is split, identify who was involved.
- If it's a payment/settlement (e.g. "I paid @deepak 100 back"), mark it clearly.
- IMPORTANT: Support weighted splits. If the user says "@deepak covers 2 shares and @ankur covers 1 of a 5-share split", capture this in splitWeights as {'@deepak': 2, '@ankur': 1, 'me': 2} so they sum to the total shares mentioned.
Return structured JSON.`;

  const response = await customAi.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: expenseSchema,
    }
  });

  return JSON.parse(response.text || '{}');
}

export async function interpretChat(userId: string, message: string, chatHistory: any[], apiKey?: string) {
  const customAi = apiKey ? new GoogleGenAI({ apiKey }) : ai;
  const model = "gemini-3-flash-preview";
  
  const response = await customAi.models.generateContent({
    model,
    contents: [...chatHistory, { role: 'user', text: message }].map(c => ({
      role: c.role === 'user' ? 'user' : 'model',
      parts: [{ text: c.text }]
    })),
    config: {
      systemInstruction: "You are a motivating hypertrophy coach. Respond briefly and intelligently to the user's progress or questions. If they ask for a workout, say you're preparing it.",
    }
  });

  return response.text;
}
