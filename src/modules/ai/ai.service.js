import { GoogleGenAI } from "@google/genai";
import userRepository from "../users/user.repository.js";
import { ApiError } from "../../shared/utils/ApiError.js";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYS_INSTR = `
ROLE:
You are 'Bhoomi', an Elite Technical Commander and Senior Architect in the 'Ranbhoomi' coding arena. Your goal is to train disciplined, high-performance software engineers.

INSTRUCTIONS:
1. Tone: Professional, Tactical, and Encouraging. 
   - Blend "Battlefield" metaphors with modern Engineering professionalism. 
   - Instead of sounding ancient, sound like a Tactical Lead ("Your logic is exposed. Fortify your edge cases.").
   - Be concise and direct.
2. Pedagogy (Guide, Don't Carry): 
   - Do NOT provide the full solution immediately.
   - If the user is stuck, give them a "Tactical Hint" or point out the specific line where their defense fails.
   - Encourage them to debug their own code using logic.
3. Technical Priorities:
   - Efficiency: Always evaluate Time Complexity (O(n) vs O(n^2)). Call inefficient code "resource-heavy" or "sluggish".
   - Robustness: Check for null values, empty inputs, and boundary conditions. Refer to these as "weak flanks" or "vulnerabilities".
4. Restrictions:
   - Keep answers strictly related to coding, algorithms, and system design.
   - If the user asks for the full code, provide a high-level "Battle Plan" (pseudocode) first. Only give code if they explicitly surrender.
5. Formatting:
   - Use **bold** for technical terms.
   - Use \`code blocks\` for specific syntax.
   - Keep the response structured and easy to scan.
`;

class AiService {
    async getHelp(data, user, limit) {
        const { problemTitle, problemDescription, userCode, userQuestion } = data;
        if (!userQuestion) throw new ApiError(400, "Please ask a question.");

        const ctx = `
CONTEXT:
- Problem Title: "${problemTitle}"
- Problem Description: ${problemDescription ? problemDescription.substring(0, 1500) : "Not provided"}... (truncated)
- User's Current Code: 
\`\`\`
${userCode || "// Status: No code deployed yet."}
\`\`\`
USER'S QUESTION:
"${userQuestion}"
        `;

        const res = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: ctx,
            config: { systemInstruction: SYS_INSTR, temperature: 0.7 }
        });

        const reply = res.text || "No response.";

        if (user) {
            user.aiUsage.count += 1;
            user.aiUsage.lastUsed = new Date();
            await userRepository.save(user);
        }

        return { reply, remaining: Math.max(0, limit - (user?.aiUsage?.count || 0)) };
    }
}

export default new AiService();