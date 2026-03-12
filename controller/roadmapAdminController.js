import RoadmapTemplate from '../models/roadmapTemplateModel.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { v4 as uuidv4 } from 'uuid';

// Allowed constants for Strict Validation
const ALLOWED_TYPES = ["topic", "subTopic", "question"];
const ALLOWED_DIFFICULTIES = ["Basic", "Easy", "Medium", "Hard"];

// Helper for basic URL validation
const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

//  CREATE ROADMAP
export const createRoadmap = asyncHandler(async (req, res) => {
    const { roadmapId, title } = req.body;

    if (!roadmapId || typeof roadmapId !== 'string' || roadmapId.trim() === '') {
        throw new ApiError(400, "A valid 'roadmapId' string is required.");
    }
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
        throw new ApiError(400, "Title must be at least 3 characters long.");
    }

    const existingRoadmap = await RoadmapTemplate.exists({ roadmapId });
    if (existingRoadmap) {
        throw new ApiError(409, "A roadmap with this ID already exists.");
    }

    const newRoadmap = await RoadmapTemplate.create({
        roadmapId,
        title: title.trim(),
        sheet: { id: roadmapId, title: title.trim(), topicOrder: [] },
        topics: {},
        subTopics: {},
        questions: {}
    });

    return res.status(201).json(
        new ApiResponse(201, { id: newRoadmap.roadmapId }, "New roadmap created successfully")
    );
});

//  ADD ITEM (Topic, SubTopic, Question)
// Optimization: Input Validation & Atomic Updates
export const addItem = asyncHandler(async (req, res) => {
    const { roadmapId } = req.params; 
    const { type, title, parentId, link, difficulty } = req.body; 

    // STRICT VALIDATION
    if (!ALLOWED_TYPES.includes(type)) {
        throw new ApiError(400, `Invalid type. Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    }
    if (!title || typeof title !== 'string' || title.trim() === '') {
        throw new ApiError(400, "Title cannot be empty.");
    }

    const newId = `${type.toLowerCase()}-${uuidv4().slice(0, 8)}`;
    const safeTitle = title.trim();
    
    let updateQuery = {};
    let filterQuery = { roadmapId };

    if (type === 'topic') {
        updateQuery = {
            $set: { [`topics.${newId}`]: { id: newId, title: safeTitle, subTopicOrder: [] } },
            $push: { "sheet.topicOrder": newId }
        };
    } 
    else if (type === 'subTopic') {
        if (!parentId) throw new ApiError(400, "parentId is required for subTopics.");
        filterQuery[`topics.${parentId}`] = { $exists: true };
        updateQuery = {
            $set: { [`subTopics.${newId}`]: { id: newId, title: safeTitle, questionOrder: [] } },
            $push: { [`topics.${parentId}.subTopicOrder`]: newId }
        };
    } 
    else if (type === 'question') {
        if (!parentId) throw new ApiError(400, "parentId is required for questions.");
        if (link && !isValidUrl(link) && link !== "#") throw new ApiError(400, "Invalid link format.");
        
        const safeDiff = ALLOWED_DIFFICULTIES.includes(difficulty) ? difficulty : "Medium";
        const safeLink = link ? link.trim() : "#";

        filterQuery[`subTopics.${parentId}`] = { $exists: true };
        updateQuery = {
            $set: { [`questions.${newId}`]: { id: newId, title: safeTitle, link: safeLink, difficulty: safeDiff } },
            $push: { [`subTopics.${parentId}.questionOrder`]: newId }
        };
    }

    const updatedRoadmap = await RoadmapTemplate.findOneAndUpdate(filterQuery, updateQuery, { new: true });
    
    if (!updatedRoadmap) {
        throw new ApiError(404, "Roadmap or Parent Item not found.");
    }

    return res.status(201).json(new ApiResponse(201, { id: newId }, `${type} added successfully`));
});

//  UPDATE ITEM
// Optimization: Defensive Keys & Strict Validation
export const updateItem = asyncHandler(async (req, res) => {
    const { roadmapId, itemId } = req.params; 
    const { type, title, link, difficulty } = req.body; 
    
    // STRICT VALIDATION (Crucial to prevent NoSQL injection in dynamic keys)
    if (!ALLOWED_TYPES.includes(type)) {
        throw new ApiError(400, "Invalid item type.");
    }
    if (!title || typeof title !== 'string' || title.trim() === '') {
        throw new ApiError(400, "Title cannot be empty.");
    }

    const safeTitle = title.trim();
    let updateQuery = {};
    let filterQuery = { roadmapId, [`${type}s.${itemId}`]: { $exists: true } };

    if (type === 'topic' || type === 'subTopic') {
        updateQuery = { $set: { [`${type}s.${itemId}.title`]: safeTitle } };
    } 
    else if (type === 'question') {
        if (link && !isValidUrl(link) && link !== "#") throw new ApiError(400, "Invalid link format.");
        const safeDiff = ALLOWED_DIFFICULTIES.includes(difficulty) ? difficulty : "Medium";
        const safeLink = link ? link.trim() : "#";

        updateQuery = { 
            $set: { 
                [`questions.${itemId}.title`]: safeTitle,
                [`questions.${itemId}.link`]: safeLink,
                [`questions.${itemId}.difficulty`]: safeDiff
            } 
        };
    }

    const updated = await RoadmapTemplate.findOneAndUpdate(filterQuery, updateQuery);
    
    if (!updated) throw new ApiError(404, "Item or Roadmap not found.");

    return res.status(200).json(new ApiResponse(200, null, `${type} updated successfully`));
});

//  DELETE ITEM (Cascade Delete System)
// Optimization: Memory Projection 
export const deleteItem = asyncHandler(async (req, res) => {
    const { roadmapId, itemId } = req.params; 
    const { type, parentId } = req.body; 
    
    if (!ALLOWED_TYPES.includes(type)) {
        throw new ApiError(400, "Invalid item type.");
    }

    const roadmap = await RoadmapTemplate.findOne({ roadmapId })
        .select('sheet topics subTopics') 
        .lean();

    if (!roadmap) throw new ApiError(404, "Roadmap not found");

    const unsetQuery = {};
    const pullQuery = {};

    if (type === 'topic') {
        const topic = roadmap.topics?.[itemId];
        if (!topic) throw new ApiError(404, "Topic not found");

        unsetQuery[`topics.${itemId}`] = 1;
        pullQuery["sheet.topicOrder"] = itemId;

        topic.subTopicOrder.forEach(sid => {
            unsetQuery[`subTopics.${sid}`] = 1;
            const subTopic = roadmap.subTopics?.[sid];
            if (subTopic) {
                subTopic.questionOrder.forEach(qid => {
                    unsetQuery[`questions.${qid}`] = 1;
                });
            }
        });
    } 
    else if (type === 'subTopic') {
        const subTopic = roadmap.subTopics?.[itemId];
        if (!subTopic) throw new ApiError(404, "SubTopic not found");

        unsetQuery[`subTopics.${itemId}`] = 1;
        if (parentId) pullQuery[`topics.${parentId}.subTopicOrder`] = itemId;

        subTopic.questionOrder.forEach(qid => {
            unsetQuery[`questions.${qid}`] = 1;
        });
    } 
    else if (type === 'question') {
        unsetQuery[`questions.${itemId}`] = 1;
        if (parentId) pullQuery[`subTopics.${parentId}.questionOrder`] = itemId;
    }

    // Execute atomic cascade delete
    await RoadmapTemplate.updateOne(
        { roadmapId },
        { $unset: unsetQuery, $pull: pullQuery }
    );

    return res.status(200).json(new ApiResponse(200, null, `${type} and children deleted successfully`));
});