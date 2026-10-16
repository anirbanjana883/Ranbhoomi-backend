import problemRepository from "../problems/problem.repository.js";
import { formatSubmissions, submitToJudge0, pollJudge0Batch } from "./judge.service.js";
import { getLanguageId } from "../../shared/utils/constants.js";
import { redisCache } from "../../core/redis.js";

const ALLOWED_LANGUAGES = ["cpp", "java", "python"];
const safeTruncate = (str) => str?.length > 2000 ? str.substring(0, 2000) + "\n...[TRUNCATED]" : str;

class EphemeralExecutionService {
    async executeCode(slug, language, code) {
        const normalizedLanguage = language?.toLowerCase().trim();
        if (!normalizedLanguage || !ALLOWED_LANGUAGES.includes(normalizedLanguage)) {
            throw new Error(`Unsupported language. Allowed: ${ALLOWED_LANGUAGES.join(", ")}`);
        }

        const cacheKey = `samples:${slug}`;
        let evalDataStr = await redisCache.get(cacheKey);
        let evalData;

        if (!evalDataStr) {
            const problem = await problemRepository.findBySlug(slug, true);
            if (!problem) throw new Error("Problem not found.");
            if (!problem.testCases || !problem.testCases.length) throw new Error("No sample test cases available.");

            evalData = {
                driverCode: problem.driverCode,
                testCases: problem.testCases,
                timeLimit: problem.timeLimit,
                memoryLimit: problem.memoryLimit,
            };
            await redisCache.set(cacheKey, JSON.stringify(evalData), { ex: 3600 });
        } else {
            evalData = typeof evalDataStr === "string" ? JSON.parse(evalDataStr) : evalDataStr;
        }

        const languageId = getLanguageId(normalizedLanguage);
        let finalCode = code;
        const driver = evalData.driverCode?.find((dc) => dc.language.toLowerCase() === normalizedLanguage);
        if (driver) finalCode = `${code}\n\n${driver.code}`;

        const submissions = formatSubmissions(finalCode, languageId, evalData.testCases, evalData.timeLimit, evalData.memoryLimit);
        const tokens = await submitToJudge0(submissions);

        return { tokens, evalData };
    }

    async pollExecution(tokens, socket) {
        let attempts = 0;
        let results = [];
        let isProcessing = true;

        while (isProcessing && attempts < 10) {
            if (!socket.connected) break;
            attempts++;
            await new Promise((res) => setTimeout(res, 2000));

            const currentBatch = await pollJudge0Batch(tokens);
            isProcessing = currentBatch.some((s) => s.status.id <= 2);

            if (!isProcessing) results = currentBatch;
        }

        if (isProcessing) throw new Error("Execution Timeout.");
        return results;
    }

    formatResults(results, evalData) {
        const decodeBase64 = (str) => str ? Buffer.from(str, "base64").toString("utf8") : "";

        return results.map((r, index) => {
            const tc = evalData.testCases[index];
            const rawStdout = decodeBase64(r.stdout);
            const rawStderr = decodeBase64(r.stderr);
            const rawCompileErr = decodeBase64(r.compile_output);

            const actualOutput = safeTruncate(rawStdout);
            const passed = r.status.id === 3 && actualOutput?.trim() === tc.expectedOutput?.trim();

            return {
                testCaseId: tc._id,
                input: tc.input,
                expectedOutput: tc.expectedOutput,
                actualOutput: actualOutput || safeTruncate(rawStderr || rawCompileErr),
                status: passed ? "Passed" : (r.status.id === 3 ? "Wrong Answer" : r.status.description),
                time: r.time,
                memory: r.memory,
            };
        });
    }
}

export default new EphemeralExecutionService();