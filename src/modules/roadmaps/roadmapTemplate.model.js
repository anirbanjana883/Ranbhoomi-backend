import mongoose from 'mongoose';

const roadmapTemplateSchema = new mongoose.Schema({
    roadmapId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    sheet: { type: mongoose.Schema.Types.Mixed, required: true },
    topics: { type: mongoose.Schema.Types.Mixed, required: true },
    subTopics: { type: mongoose.Schema.Types.Mixed, required: true },
    questions: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true, minimize: false });

export default mongoose.model('RoadmapTemplate', roadmapTemplateSchema);