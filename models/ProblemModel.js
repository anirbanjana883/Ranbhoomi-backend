import mongoose from "mongoose";

const problemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: "Welcome to my Ranbhoomi profile!", 
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      immutable: true, 
    },
    password: {
      type: String,
    },
    role: {
      type: String,
      enum: ["user", "admin", "master"], 
      required: true,
      default: "user", 
    },
    photoUrl: {
      type: String,
      default: "", 
    },

    github: {
      type: String,
      default: "",
    },
    linkedin: {
      type: String,
      default: "",
    },
    resetOtp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
    isOtpVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Problem = mongoose.model("Problem", problemSchema);
export default Problem;