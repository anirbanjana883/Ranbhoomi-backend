import mongoose from "mongoose";

const interviewSessionSchema = new mongoose.Schema(
  {
    roomID: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // ROLE-BASED ACCESS CONTROL
    interviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    //  INTERVIEW STATE
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      default: null,
    },
    language: {
      type: String,
      default: "cpp", 
    },
    code: {
      type: String,
      default: "", 
    },
    //  INTERVIEWER PRIVATE DATA
    interviewerNotes: {
      type: String,
      default: "", 
    },
    // LIFECYCLE & TIMING
    status: {
      type: String,
      enum: ["Scheduled", "Live", "Completed"],
      default: "Scheduled",
    },
    scheduledTime: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
      default: null, 
    },
    endedAt: {
      type: Date,
      default: null, 
    },
  },
  { timestamps: true }
);

const InterviewSession = mongoose.model(
  "InterviewSession",
  interviewSessionSchema
);

export default InterviewSession;