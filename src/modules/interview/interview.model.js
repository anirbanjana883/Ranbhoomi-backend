import mongoose from "mongoose";

const interviewSessionSchema = new mongoose.Schema({
    roomID: { type: String, required: true, unique: true, trim: true },
    interviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", default: null },
    language: { type: String, default: "cpp" },
    code: { type: String, default: "" },
    interviewerNotes: { type: String, default: "" },
    status: { type: String, enum: ["Scheduled", "Live", "Completed"], default: "Scheduled" },
    scheduledTime: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model("InterviewSession", interviewSessionSchema);