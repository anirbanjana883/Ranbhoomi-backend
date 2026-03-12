import mongoose from 'mongoose';

const userProgressSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  roadmapId: { 
    type: String, 
    required: true,
    default: "striver-a2z"
  },
  
  // O(1) HashMaps using Mongoose Map type. 
  // Keys  (e.g., "q-1a2b")
  solved: { type: Map, of: Boolean, default: {} },
  bookmarked: { type: Map, of: Boolean, default: {} },
  notes: { type: Map, of: String, default: {} },
  
  stats: {
    totalSolved: { type: Number, default: 0 },
    easy: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    hard: { type: Number, default: 0 }
  },

  activeDays: { type: Map, of: Number, default: {} }
}, { 
  timestamps: true 
});

// Optimization: Compound Index
userProgressSchema.index({ userId: 1, roadmapId: 1 }, { unique: true });

export default mongoose.model('UserProgress', userProgressSchema);