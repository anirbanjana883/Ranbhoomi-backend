import roadmapRepository from './roadmap.repository.js';
import { ApiError } from '../../shared/utils/ApiError.js';

class UserProgressService {
    async getRoadmapData(userId, roadmapId) {
        const [template, progress] = await Promise.all([
            roadmapRepository.findTemplate(roadmapId),
            roadmapRepository.findUserProgress(userId, roadmapId, "solved bookmarked notes stats activeDays")
        ]);
        if (!template) throw new ApiError(404, "Roadmap not found.");
        return { template, progress: progress || { solved: {}, bookmarked: {}, notes: {}, stats: { totalSolved: 0, easy: 0, medium: 0, hard: 0 }, activeDays: {} } };
    }

    async toggleSolved(userId, roadmapId, questionId, difficulty) {
        if (!questionId || !roadmapId) throw new ApiError(400, "Missing IDs");
        
        const diffKey = ["basic", "easy", "medium", "hard"].includes(difficulty?.toLowerCase()) ? difficulty.toLowerCase() : "medium";
        const today = new Date().toISOString().split('T')[0];

        const current = await roadmapRepository.findUserProgress(userId, roadmapId, { [`solved.${questionId}`]: 1, [`activeDays.${today}`]: 1 });
        const isSolved = current?.solved?.[questionId];

        const updateQuery = {
            [isSolved ? "$unset" : "$set"]: { [`solved.${questionId}`]: isSolved ? 1 : true },
            $inc: { 
                "stats.totalSolved": isSolved ? -1 : 1, 
                [`stats.${diffKey}`]: isSolved ? -1 : 1,
                [`activeDays.${today}`]: isSolved ? (current?.activeDays?.[today] > 0 ? -1 : 0) : 1
            }
        };

        const updated = await roadmapRepository.updateUserProgress(userId, roadmapId, updateQuery);
        return { isSolved: !isSolved, stats: updated.stats, activeDays: updated.activeDays };
    }

    async toggleBookmark(userId, roadmapId, questionId) {
        if (!questionId || !roadmapId) throw new ApiError(400, "Missing IDs");
        const current = await roadmapRepository.findUserProgress(userId, roadmapId, { [`bookmarked.${questionId}`]: 1 });
        const isBookmarked = current?.bookmarked?.[questionId];
        await roadmapRepository.updateUserProgress(userId, roadmapId, isBookmarked ? { $unset: { [`bookmarked.${questionId}`]: 1 } } : { $set: { [`bookmarked.${questionId}`]: true } });
        return !isBookmarked;
    }

    async saveNote(userId, roadmapId, questionId, noteText) {
        if (!questionId || !roadmapId) throw new ApiError(400, "Missing IDs");
        const updateQuery = (!noteText?.trim()) ? { $unset: { [`notes.${questionId}`]: 1 } } : { $set: { [`notes.${questionId}`]: noteText } };
        await roadmapRepository.updateUserProgress(userId, roadmapId, updateQuery);
    }
}

export default new UserProgressService();