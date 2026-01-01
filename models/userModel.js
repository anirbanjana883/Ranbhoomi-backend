import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
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
    subscriptionPlan: {
      type: String,
      enum: ["Free", "Warrior", "Gladiator"],
      default: "Free",
    },
    subscriptionExpiresAt: {
      type: Date,
      default: null, 
    },
    // Used to track daily limits (like AI usage)
    aiUsage: {
      count: { type: Number, default: 0 },
      lastUsed: { type: Date, default: Date.now }
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
    aiUsage: {
      count: { type: Number, default: 0 },
      lastUsed: { type: Date, default: Date.now }
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;