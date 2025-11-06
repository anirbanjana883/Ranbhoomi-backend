import mongoose from "mongoose";

const interviewSessionSchema = new mongoose.Schema(
  {
    roomID: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      // required: true,
      default: null
    },
    status: {
      type: String,
      enum: ["Scheduled", "Live", "Completed"],
      default: "Scheduled",
    },
    scheduledTime: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const InterviewSession = mongoose.model(
  "InterviewSession",
  interviewSessionSchema
);
export default InterviewSession;