import Contest from "./contest.model.js";
import ContestRegistration from "./contestRegistration.model.js";
import ContestRanking from "./contestRanking.model.js";

class ContestRepository {
    async findBySlug(slug) { return Contest.findOne({ slug }); }
    async findAll() { return Contest.find({}).select("title slug description startTime endTime visibility").sort({ startTime: -1 }).lean(); }
    async create(data) { return Contest.create(data); }
    async save(doc) { return doc.save(); }
    async checkRegistration(userId, contestId) { return ContestRegistration.exists({ user: userId, contest: contestId }); }
    async registerUser(userId, contestId) { return ContestRegistration.create({ user: userId, contest: contestId }); }
    async findRankings(contestId) { return ContestRanking.findOne({ contest: contestId }).populate("rankings.user", "name username photoUrl").populate("rankings.problemResults.problem", "title slug difficulty").lean(); }
    async deleteContestRelations(contestId, session) { await ContestRegistration.deleteMany({ contest: contestId }).session(session); }
}

export default new ContestRepository();