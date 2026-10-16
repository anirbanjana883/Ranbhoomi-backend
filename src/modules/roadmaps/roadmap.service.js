import { v4 as uuidv4 } from 'uuid';
import roadmapRepository from './roadmap.repository.js';
import { ApiError } from '../../shared/utils/ApiError.js';

const ALLOWED_TYPES = ["topic", "subTopic", "question"];
const ALLOWED_DIFFICULTIES = ["Basic", "Easy", "Medium", "Hard"];
const isValidUrl = (string) => { try { new URL(string); return true; } catch (_) { return false; } };

class RoadmapService {
    async createRoadmap(roadmapId, title) {
        if (!roadmapId?.trim()) throw new ApiError(400, "Valid 'roadmapId' is required.");
        if (!title?.trim() || title.trim().length < 3) throw new ApiError(400, "Title must be at least 3 characters.");
        
        if (await roadmapRepository.exists({ roadmapId })) throw new ApiError(409, "Roadmap ID already exists.");

        const newRoadmap = await roadmapRepository.createTemplate({
            roadmapId, title: title.trim(),
            sheet: { id: roadmapId, title: title.trim(), topicOrder: [] },
            topics: {}, subTopics: {}, questions: {}
        });
        return newRoadmap.roadmapId;
    }

    async addItem(roadmapId, data) {
        const { type, title, parentId, link, difficulty } = data;
        if (!ALLOWED_TYPES.includes(type)) throw new ApiError(400, `Invalid type: ${ALLOWED_TYPES.join(', ')}`);
        if (!title?.trim()) throw new ApiError(400, "Title cannot be empty.");

        const newId = `${type.toLowerCase()}-${uuidv4().slice(0, 8)}`;
        const safeTitle = title.trim();
        let updateQuery = {};
        let filterQuery = { roadmapId };

        if (type === 'topic') {
            updateQuery = { $set: { [`topics.${newId}`]: { id: newId, title: safeTitle, subTopicOrder: [] } }, $push: { "sheet.topicOrder": newId } };
        } else if (type === 'subTopic') {
            if (!parentId) throw new ApiError(400, "parentId is required");
            filterQuery[`topics.${parentId}`] = { $exists: true };
            updateQuery = { $set: { [`subTopics.${newId}`]: { id: newId, title: safeTitle, questionOrder: [] } }, $push: { [`topics.${parentId}.subTopicOrder`]: newId } };
        } else if (type === 'question') {
            if (!parentId) throw new ApiError(400, "parentId is required");
            if (link && !isValidUrl(link) && link !== "#") throw new ApiError(400, "Invalid link");
            filterQuery[`subTopics.${parentId}`] = { $exists: true };
            updateQuery = { 
                $set: { [`questions.${newId}`]: { id: newId, title: safeTitle, link: link?.trim() || "#", difficulty: ALLOWED_DIFFICULTIES.includes(difficulty) ? difficulty : "Medium" } },
                $push: { [`subTopics.${parentId}.questionOrder`]: newId }
            };
        }

        const updated = await roadmapRepository.updateTemplate(filterQuery, updateQuery);
        if (!updated) throw new ApiError(404, "Roadmap or Parent not found.");
        return newId;
    }

    async updateItem(roadmapId, itemId, data) {
        const { type, title, link, difficulty } = data;
        if (!ALLOWED_TYPES.includes(type)) throw new ApiError(400, "Invalid item type.");
        if (!title?.trim()) throw new ApiError(400, "Title cannot be empty.");

        const safeTitle = title.trim();
        let updateQuery = {};
        let filterQuery = { roadmapId, [`${type}s.${itemId}`]: { $exists: true } };

        if (type === 'topic' || type === 'subTopic') {
            updateQuery = { $set: { [`${type}s.${itemId}.title`]: safeTitle } };
        } else if (type === 'question') {
            if (link && !isValidUrl(link) && link !== "#") throw new ApiError(400, "Invalid link");
            updateQuery = { $set: { [`questions.${itemId}.title`]: safeTitle, [`questions.${itemId}.link`]: link?.trim() || "#", [`questions.${itemId}.difficulty`]: ALLOWED_DIFFICULTIES.includes(difficulty) ? difficulty : "Medium" } };
        }

        const updated = await roadmapRepository.updateTemplate(filterQuery, updateQuery);
        if (!updated) throw new ApiError(404, "Item or Roadmap not found.");
    }

    async deleteItem(roadmapId, itemId, type, parentId) {
        if (!ALLOWED_TYPES.includes(type)) throw new ApiError(400, "Invalid type.");
        const roadmap = await roadmapRepository.findTemplate(roadmapId, 'sheet topics subTopics');
        if (!roadmap) throw new ApiError(404, "Roadmap not found");

        const unsetQuery = {}, pullQuery = {};

        if (type === 'topic') {
            const topic = roadmap.topics?.[itemId];
            if (!topic) throw new ApiError(404, "Topic not found");
            unsetQuery[`topics.${itemId}`] = 1;
            pullQuery["sheet.topicOrder"] = itemId;
            topic.subTopicOrder.forEach(sid => {
                unsetQuery[`subTopics.${sid}`] = 1;
                roadmap.subTopics?.[sid]?.questionOrder.forEach(qid => unsetQuery[`questions.${qid}`] = 1);
            });
        } else if (type === 'subTopic') {
            const subTopic = roadmap.subTopics?.[itemId];
            if (!subTopic) throw new ApiError(404, "SubTopic not found");
            unsetQuery[`subTopics.${itemId}`] = 1;
            if (parentId) pullQuery[`topics.${parentId}.subTopicOrder`] = itemId;
            subTopic.questionOrder.forEach(qid => unsetQuery[`questions.${qid}`] = 1);
        } else if (type === 'question') {
            unsetQuery[`questions.${itemId}`] = 1;
            if (parentId) pullQuery[`subTopics.${parentId}.questionOrder`] = itemId;
        }

        await roadmapRepository.deleteTemplateItems(roadmapId, unsetQuery, pullQuery);
    }
}

export default new RoadmapService();