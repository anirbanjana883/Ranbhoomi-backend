import mongoose from 'mongoose';
import fs from 'fs';
import dotenv from "dotenv"

dotenv.config();


// 1. Paste your MongoDB Atlas Connection String here
const MONGO_URI = process.env.MONGODB_URL;

// 2. Define the Master Template Schema (matching your backend model)
const roadmapTemplateSchema = new mongoose.Schema({
  roadmapId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  sheet: { type: mongoose.Schema.Types.Mixed, required: true },
  topics: { type: mongoose.Schema.Types.Mixed, required: true },
  subTopics: { type: mongoose.Schema.Types.Mixed, required: true },
  questions: { type: mongoose.Schema.Types.Mixed, required: true }
}, { minimize: false });

const RoadmapTemplate = mongoose.model('RoadmapTemplate', roadmapTemplateSchema);

const uploadData = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected Successfully!");

    // 3. Read your local normalized JSON file
    console.log("Reading sheet.json...");
    const rawData = JSON.parse(fs.readFileSync('./seeding/data.json', 'utf-8'));
    
    // We expect the data to be inside rawData.data based on your previous store.js, 
    // adjust if it's at the root level.
    const coreData = rawData.data ? rawData.data : rawData;

    // 4. CLEANUP: Strip out the 'isPinned' state from the master template
    const cleanQuestions = { ...coreData.questions };
    for (const qId in cleanQuestions) {
      delete cleanQuestions[qId].isPinned;
    }

    // 5. Build the final document
    const masterDocument = {
      roadmapId: "striver-a2z", // The unique ID for this specific roadmap
      title: coreData.sheet?.title || "Striver's A2Z DSA Sheet",
      sheet: coreData.sheet,
      topics: coreData.topics,
      subTopics: coreData.subTopics,
      questions: cleanQuestions
    };

    // 6. Delete any existing version and insert the new one
    await RoadmapTemplate.deleteOne({ roadmapId: "striver-a2z" });
    await RoadmapTemplate.create(masterDocument);

    console.log("✅ Master Roadmap Template uploaded successfully to MongoDB Atlas!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Upload failed:", error);
    process.exit(1);
  }
};

uploadData();