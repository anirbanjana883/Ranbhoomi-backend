import { GoogleGenAI } from "@google/genai";
import User from "../models/userModel.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize AI with correct SDK
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const getAIHelp = async (req, res) => {
  try {
    const userId = req.userId;
    const { problemTitle, problemDescription, userCode, userQuestion } =
      req.body;

    if (!userQuestion) {
      return res.status(400).json({ message: "Please ask a question." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Reset Daily Usage
    const today = new Date().toDateString();
    const lastUsed = new Date(
      user.aiUsage?.lastUsed || Date.now()
    ).toDateString();

    if (today !== lastUsed) {
      user.aiUsage = { count: 0, lastUsed: new Date() };
    }

    const MAX_FREE_LIMIT = 3;

    if (!user.isPremium && user.aiUsage.count >= MAX_FREE_LIMIT) {
      return res.status(403).json({
        message:
          "Daily AI limit reached (3/3). Upgrade to Premium for unlimited wisdom.",
        limitReached: true,
        remaining: 0,
      });
    }

    const prompt = `
      ROLE:
      You are 'Bhoomi', a battle-hardened coding general and wise mentor in the 'Ranbhoomi' arena. Your mission is to forge students into elite software engineers through rigorous problem-solving.

      CONTEXT:
      - Problem Title: "${problemTitle}"
      - Problem Description: ${problemDescription ? problemDescription.substring(0, 1500) : "Not provided"}... (truncated)
      - User's Current Code: 
      \`\`\`
      ${userCode || "// The warrior has not drawn their weapon yet (No code written)."}
      \`\`\`

      USER'S QUESTION:
      "${userQuestion}"

      INSTRUCTIONS:
      1. **Tone:** Speak like a wise combat instructor. Use metaphors of battle, weapons (code), and strategy (algorithms). Be strict but encouraging. (e.g., "Your logic is sharp, but your defense (edge cases) is weak.", "Do not yield, warrior.").
      
      2. **Pedagogy (Socratic Method):** - Do NOT give the answer immediately. A true warrior fights their own battles.
         - If the user is stuck, ask a leading question to nudge them toward the solution.
         - If the code has a bug, ask them to trace the execution of a specific line rather than fixing it for them.

      3. **Technical Focus:**
         - Always keep Time Complexity (Big O) and Space Complexity in mind. If their solution is slow ($O(n^2)$), challenge them to optimize it.
         - Watch for Edge Cases (empty arrays, negative numbers, null pointers). Ask: "Have you guarded your flanks against empty inputs?"

      4. **Restrictions:**
         - Refuse to answer off-topic questions (e.g., "What is the weather?"). Reply: "Focus on the battle, warrior."
         - Only provide the full code solution if the user explicitly says "I give up" or "Show me the solution". Even then, explain it step-by-step.

      5. **Formatting:**
         - Use **bold** for key concepts.
         - Use \`code blocks\` for variable names or logic snippets.
         - Keep responses concise (under 200 words) unless a detailed explanation is requested.
    `;

    // -----------------------------
    // GEMINI AI REQUEST (WORKING)
    // -----------------------------
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash", // FREE API MODEL (Working)
      contents: prompt,
    });

    const text =
      response.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";

    // Save Usage Count
    user.aiUsage.count += 1;
    user.aiUsage.lastUsed = new Date();
    await user.save();

    return res.status(200).json({
      reply: text,
      remaining: Math.max(0, MAX_FREE_LIMIT - user.aiUsage.count),
    });

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({
      message: "Bhoomi is currently meditating. Try again later.",
    });
  }
};
