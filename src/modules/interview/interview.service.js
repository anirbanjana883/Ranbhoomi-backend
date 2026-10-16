import { v4 as uuidV4 } from "uuid";
import interviewRepository from "./interview.repository.js";
import { redisCache } from "../../core/redis.js";
import { ApiError } from "../../shared/utils/ApiError.js";

class InterviewService {
    async createSession(interviewerId) {
        return interviewRepository.create({ roomID: uuidV4(), interviewer: interviewerId, candidate: null, status: "Scheduled", problem: null });
    }

    async getSessionData(roomID, userId) {
        let session = await interviewRepository.findByRoomID(roomID);
        if (!session) throw new ApiError(404, "Interview session not found");

        let role = "observer";
        if (session.interviewer.toString() === userId.toString()) {
            role = "interviewer";
        } else if (session.candidate && session.candidate.toString() === userId.toString()) {
            role = "candidate";
        } else if (!session.candidate) {
            const updated = await interviewRepository.assignCandidate(roomID, userId, session.status, session.startedAt);
            if (updated) { session = updated; role = "candidate"; }
        }

        let currentCode = session.code;
        let currentLanguage = session.language;

        try {
            const [cachedCode, cachedLang] = await Promise.all([
                redisCache.get(`interview:session:${roomID}:code`),
                redisCache.get(`interview:session:${roomID}:language`)
            ]);
            if (cachedCode) currentCode = cachedCode;
            if (cachedLang) currentLanguage = cachedLang;
        } catch (e) {
            console.error("Redis fetch failed:", e);
        }

        return { ...session, role, code: currentCode, language: currentLanguage };
    }

    async endSession(roomID, userId) {
        const session = await interviewRepository.findOne({ roomID });
        if (!session) throw new ApiError(404, "Interview session not found");
        if (session.interviewer.toString() !== userId.toString()) throw new ApiError(403, "Only interviewer can end session");
        if (session.status === "Completed") throw new ApiError(400, "Already completed");

        const [finalCode, finalLang] = await Promise.all([
            redisCache.get(`interview:session:${roomID}:code`),
            redisCache.get(`interview:session:${roomID}:language`)
        ]);

        session.status = "Completed";
        session.endedAt = new Date();
        if (finalCode) session.code = finalCode;
        if (finalLang) session.language = finalLang;
        await interviewRepository.save(session);

        await Promise.all([
            redisCache.del(`interview:session:${roomID}:code`),
            redisCache.del(`interview:session:${roomID}:language`)
        ]);

        return session;
    }
}

export default new InterviewService();