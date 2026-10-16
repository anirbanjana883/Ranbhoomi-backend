import RoadmapTemplate from './roadmapTemplate.model.js';
import UserProgress from './userProgress.model.js';

class RoadmapRepository {
    async exists(filter) { return RoadmapTemplate.exists(filter); }
    
    async createTemplate(data) { return RoadmapTemplate.create(data); }
    
    async updateTemplate(filter, updateQuery) {
        return RoadmapTemplate.findOneAndUpdate(filter, updateQuery, { new: true });
    }

    async findTemplate(roadmapId, selectFields = null) {
        let query = RoadmapTemplate.findOne({ roadmapId });
        if (selectFields) query = query.select(selectFields);
        return query.lean();
    }

    async findAllTemplates() {
        return RoadmapTemplate.find({}).select('roadmapId title category description -_id').lean();
    }

    async findUserProgress(userId, roadmapId, selectFields = null) {
        let query = UserProgress.findOne({ userId, roadmapId });
        if (selectFields) query = query.select(selectFields);
        return query.lean();
    }

    async updateUserProgress(userId, roadmapId, updateQuery) {
        return UserProgress.findOneAndUpdate({ userId, roadmapId }, updateQuery, { new: true, upsert: true, setDefaultsOnInsert: true });
    }

    async deleteTemplateItems(roadmapId, unsetQuery, pullQuery) {
        return RoadmapTemplate.updateOne({ roadmapId }, { $unset: unsetQuery, $pull: pullQuery });
    }
}

export default new RoadmapRepository();