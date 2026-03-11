import redisClient from "../config/redis.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import { getLanguageId } from "../config/languageIds.js";
import {
  formatSubmissions,
  submitToJudge0,
  pollJudge0Batch,
} from "../services/judgeService.js";

const ALLOWED_LANGUAGES = ["cpp", "java", "python"];

// Safely truncate output
const safeTruncate = (str) =>
  str?.length > 2000 ? str.substring(0, 2000) + "\n...[TRUNCATED]" : str;

export const handleRunCode = (socket) => {
  socket.on("run_code", async (payload) => {
    const { slug, language, code, roomID } = payload;
    const userId = socket.user?.id || socket.userId; 

    // If a roomID exists, blast the event to the interviewer as well
    const broadcastEvent = (eventName, data) => {
      socket.emit(eventName, data); // Send to candidate (sender)
      if (roomID) {
        socket.to(roomID).emit(eventName, data); // Send to interviewer
      }
    };

    try {
      // Fail-Fast Language Guard
      const normalizedLanguage = language?.toLowerCase().trim();
      if (!normalizedLanguage || !ALLOWED_LANGUAGES.includes(normalizedLanguage)) {
          return broadcastEvent("run_error", {
              message: `Unsupported language. Allowed: ${ALLOWED_LANGUAGES.join(", ")}`,
          });
      }

      // Strict Rate Limiting (Max 2 runs per minute)
      const rateKey = `rate:run:${userId}`;
      const runCount = await redisClient.incr(rateKey);
      if (runCount === 1) await redisClient.expire(rateKey, 60);
      if (runCount > 2) {
        return broadcastEvent("run_error", {
          message: "🤚Slow down! You are running code too fast.",
        });
      }

      // Both candidate and interviewer will see this loading state
      broadcastEvent("run_status", { status: "Fetching Test Cases..." });

      // CACHING: Fetch ONLY Sample Test Cases from Redis
      const cacheKey = `samples:${slug}`;
      let evalData = await redisClient.get(cacheKey);

      if (!evalData) {
        // Cache Miss
        const problem = await Problem.findOne({
          slug,
          isDeleted: { $ne: true },
        })
          .select("_id driverCode timeLimit memoryLimit") 
          .lean();
        if (!problem) throw new Error("Problem not found.");

        // Fetch only isSample: true
        const sampleTestCases = await TestCase.find({
          problem: problem._id,
          isSample: true,
        }).lean();
        if (!sampleTestCases.length)
          throw new Error("No sample test cases available.");

        evalData = {
          driverCode: problem.driverCode,
          testCases: sampleTestCases,
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
        };
        await redisClient.set(cacheKey, JSON.stringify(evalData), { ex: 3600 });
      } else {
        evalData =
          typeof evalData === "string" ? JSON.parse(evalData) : evalData;
      }

      const languageId = getLanguageId(normalizedLanguage);

      // MERGE DRIVER CODE
      let finalCode = code;
      const driver = evalData.driverCode?.find(
        (dc) => dc.language.toLowerCase() === normalizedLanguage,
      );
      if (driver) finalCode = `${code}\n\n${driver.code}`;

      // Update both users: compilation started
      broadcastEvent("run_status", { status: "Compiling and Executing..." });

      // SEND TO JUDGE0
      const submissions = formatSubmissions(
        finalCode,
        languageId,
        evalData.testCases,
        evalData.timeLimit,
        evalData.memoryLimit
      );
      const tokens = await submitToJudge0(submissions);

      // ASYNC POLLING
      let attempts = 0;
      let results = [];
      let isProcessing = true;

      while (isProcessing && attempts < 10) {
        if (!socket.connected) break;
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const currentBatch = await pollJudge0Batch(tokens);
        isProcessing = currentBatch.some((s) => s.status.id <= 2);

        if (!isProcessing) {
          results = currentBatch;
        }
      }

      if (isProcessing) throw new Error("Execution Timeout.");

      // Base64 Decoder helper
      const decodeBase64 = (str) => {
        if (!str) return "";
        return Buffer.from(str, "base64").toString("utf8");
      };

      // FORMAT RESPONSE
      const formattedResults = results.map((r, index) => {
        const tc = evalData.testCases[index];

        const rawStdout = decodeBase64(r.stdout);
        const rawStderr = decodeBase64(r.stderr);
        const rawCompileErr = decodeBase64(r.compile_output);

        const actualOutput = safeTruncate(rawStdout);
        const passed =
          r.status.id === 3 &&
          actualOutput?.trim() === tc.expectedOutput?.trim();

        return {
          testCaseId: tc._id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput:
            actualOutput || safeTruncate(rawStderr || rawCompileErr),
          status: passed
            ? "Passed"
            : r.status.id === 3
              ? "Wrong Answer"
              : r.status.description,
          time: r.time,
          memory: r.memory,
        };
      });

      //  EMIT FINAL RESULT BACK TO CLIENTS
      broadcastEvent("run_result", {
        status: formattedResults.every((r) => r.status === "Passed")
          ? "Accepted"
          : "Failed",
        results: formattedResults,
      });

    } catch (error) {
      console.error("Run Code Error:", error);
      broadcastEvent("run_error", {
        message: error.message || "Failed to execute code.",
      });
    }
  });
};