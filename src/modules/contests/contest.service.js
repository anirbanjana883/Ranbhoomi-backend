import contestRepository from "./contest.repository.js";
import problemRepository from "../problems/problem.repository.js";
import ContestSubmission from "../codeexecution/contestSubmission.model.js";
import { randomBytes } from "crypto";
import { ApiError } from "../../shared/utils/ApiError.js";
import mongoose from "mongoose";

class ContestService {
    async createOfficial(data, userId) {
        const { title, description, startTime, endTime, problemIds } = data;
        if (!title || !description || !startTime || !endTime) throw new ApiError(400, "Missing fields");
        if (new Date(startTime) < new Date() || new Date(endTime) <= new Date(startTime)) throw new ApiError(400, "Invalid times");
        
        const slug = title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
        if (await contestRepository.findBySlug(slug)) throw new ApiError(400, "Contest exists");
        if (!problemIds || !problemIds.length) throw new ApiError(400, "Needs problems");

        const valid = await problemRepository.findProblems({ _id: { $in: problemIds }, isPublished: false, isDeleted: {$ne: true } }, 0, 100, {}, "_id");
        if (valid.length !== problemIds.length) throw new ApiError(400, "Invalid problem selection");

        return contestRepository.create({ title, slug, description, startTime, endTime, problems: problemIds.map(id => ({ problem: id })), createdBy: userId });
    }

    async createPrivate(data, userId) {
        const { title, description, startTime, endTime, problemIds } = data;
        const inviteCode = randomBytes(3).toString("hex").toUpperCase();
        const slug = `${title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "")}-${inviteCode.toLowerCase()}`;
        
        const valid = await problemRepository.findProblems({ _id: { $in: problemIds } }, 0, 100, {}, "_id");
        if (valid.length !== problemIds.length) throw new ApiError(400, "Invalid problems");

        return contestRepository.create({ title, slug, description: description || "Private Contest", startTime, endTime, problems: problemIds.map(id => ({ problem: id })), createdBy: userId, visibility: "PRIVATE", inviteCode });
    }

    async deleteContest(slug) {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const { default: Contest } = await import("./contest.model.js");
            const contest = await Contest.findOneAndDelete({ slug }).session(session);
            if (!contest) throw new ApiError(404, "Contest not found");
            await contestRepository.deleteContestRelations(contest._id, session);
            await ContestSubmission.deleteMany({ contest: contest._id }).session(session);
        });
        session.endSession();
    }
}

export default new ContestService();