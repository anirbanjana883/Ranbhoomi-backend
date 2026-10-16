import InterviewSession from "./interview.model.js";

class InterviewRepository {
    async create(data) { return InterviewSession.create(data); }
    
    async findByRoomID(roomID) {
        return InterviewSession.findOne({ roomID }).populate("problem").lean();
    }

    async findOne(filter) {
        return InterviewSession.findOne(filter);
    }

    async assignCandidate(roomID, userId, currentStatus, currentStartedAt) {
        return InterviewSession.findOneAndUpdate(
            { roomID, candidate: null },
            {
                candidate: userId,
                status: currentStatus === "Scheduled" ? "Live" : currentStatus,
                startedAt: currentStatus === "Scheduled" ? new Date() : currentStartedAt,
            },
            { new: true, lean: true }
        ).populate("problem");
    }

    async updateProblem(roomID, problemId) {
        return InterviewSession.findOneAndUpdate({ roomID }, { problem: problemId });
    }

    async save(doc) { return doc.save(); }
}

export default new InterviewRepository();