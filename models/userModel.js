import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      immutable: true, // email cannot be changed
    },
    password: {
      type: String,
    },
    role: {
      type: String,
      enum: ["user", "admin", "master"], // add master role
      required: true,
      default: "user", // default role is user
    },
    photoUrl: {
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

const User = mongoose.model("User", userSchema);
export default User;
