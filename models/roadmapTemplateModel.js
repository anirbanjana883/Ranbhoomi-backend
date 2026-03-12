import mongoose from 'mongoose';

const roadmapTemplateSchema = new mongoose.Schema({
  roadmapId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true // Indexed for instant O(1) retrieval
  }, 
  title: { type: String, required: true },
  
  sheet: { type: mongoose.Schema.Types.Mixed, required: true },
  topics: { type: mongoose.Schema.Types.Mixed, required: true },
  subTopics: { type: mongoose.Schema.Types.Mixed, required: true },
  questions: { type: mongoose.Schema.Types.Mixed, required: true }
}, { 
  timestamps: true,
  minimize: false 
});

roadmapTemplateSchema.index({ roadmapId: 1 }, { unique: true });

export default mongoose.model('RoadmapTemplate', roadmapTemplateSchema);