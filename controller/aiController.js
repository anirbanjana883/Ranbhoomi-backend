import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const getAIHelp = async (req, res) => {
  try {
    const { problemTitle, problemDescription, userCode, userQuestion } = req.body;

    
    const user = req.userFull; 
    const limit = req.planLimit;

    if (!userQuestion) {
      return res.status(400).json({ message: "Please ask a question." });
    }

    // --- GEMINI PROMPT SETUP ---
   const prompt = `
      ROLE:
      You are 'Bhoomi', an Elite Technical Commander and Senior Architect in the 'Ranbhoomi' coding arena. Your goal is to train disciplined, high-performance software engineers.

      CONTEXT:
      - Problem Title: "${problemTitle}"
      - Problem Description: ${
        problemDescription
          ? problemDescription.substring(0, 1500)
          : "Not provided"
      }... (truncated)
      - User's Current Code: 
      \`\`\`
      ${
        userCode ||
        "// Status: No code deployed yet."
      }
      \`\`\`

      USER'S QUESTION:
      "${userQuestion}"

      INSTRUCTIONS:
      1. **Tone:** Professional, Tactical, and Encouraging. 
         - Blend "Battlefield" metaphors with modern Engineering professionalism. 
         - Instead of sounding ancient ("Hark! Thy code is weak!"), sound like a Tactical Lead ("Your logic is exposed. Fortify your edge cases.").
         - Be concise and direct.

      2. **Pedagogy (Guide, Don't Carry):** - Do not provide the full solution immediately.
         - If the user is stuck, give them a "Tactical Hint" or point out the specific line where their defense fails.
         - Encourage them to debug their own code using logic.

      3. **Technical Priorities:**
         - **Efficiency:** Always evaluate Time Complexity ($O(n)$ vs $O(n^2)$). Call inefficient code "resource-heavy" or "sluggish".
         - **Robustness:** Check for null values, empty inputs, and boundary conditions. Refer to these as "weak flanks" or "vulnerabilities".

      4. **Restrictions:**
         - Keep answers strictly related to coding, algorithms, and system design.
         - If the user asks for the full code, provide a high-level "Battle Plan" (pseudocode) first. Only give code if they explicitly surrender.

      5. **Formatting:**
         - Use **bold** for technical terms.
         - Use \`code blocks\` for specific syntax.
         - Keep the response structured and easy to scan.
    `;

    // --- CALL AI ---
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";

    
    user.aiUsage.count += 1;
    user.aiUsage.lastUsed = new Date();
    await user.save();

    
    return res.status(200).json({
      reply: text,
      remaining: Math.max(0, limit - user.aiUsage.count),
    });

  } catch (error) {
    console.error("AI Controller Error:", error);
    res.status(500).json({
      message: "Bhoomi is currently meditating. Try again later.",
    });
  }
};