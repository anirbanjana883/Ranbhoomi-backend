import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import userRepository from "../users/user.repository.js";
import { sendMail } from "../../core/mailer.js";
import { ApiError } from "../../shared/utils/ApiError.js";

class AuthService {
  async generateUsername(name) {
    const baseUsername = name.toLowerCase().replace(/ /g, "-").replace(/[^a-z0-9-]/g, "");
    let username = baseUsername;
    let isUnique = false;

    while (!isUnique) {
      const existing = await userRepository.findByUsername(username);
      if (!existing) isUnique = true;
      else username = `${baseUsername}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    return username;
  }

  generateToken(userId, role) {
    return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  }

  async signup(data) {
    const { name, email, password } = data;
    
    if (await userRepository.findByEmail(email)) {
      throw new ApiError(400, "User already exists");
    }

    const username = await this.generateUsername(name);
    const hashPassword = await bcrypt.hash(password, 10);

    const user = await userRepository.createUser({
      name, email, username, password: hashPassword, role: "user",
    });

    const token = this.generateToken(user._id, user.role);

    await sendMail(
      email,
      "🎉 Welcome to Ranbhoomi!",
      `<div style="font-family: Arial, sans-serif; text-align:center; padding:20px;">
        <h2>Hello ${user.name},</h2>
        <p>Welcome to <strong>Ranbhoomi</strong>! Your account has been created successfully.</p>
        <p>Get started with your learning journey and explore Ranbhoomi.</p>
        <p style="margin-top:20px; color:#6b7280;">- The Ranbhoomi Team</p>
      </div>`
    );

    return { user, token };
  }

  async login(email, password) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new ApiError(404, "User not found");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new ApiError(400, "Incorrect Password");

    return { user, token: this.generateToken(user._id, user.role) };
  }

  async sendOtp(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new ApiError(404, "User not found");

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.resetOtp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.isOtpVerified = false;
    await userRepository.save(user);

    await sendMail(
      email,
      "🔐 Your Ranbhoomi OTP",
      `<div style="font-family:Arial,sans-serif;text-align:center;padding:20px;">
        <h2>Hello ${user.name || "Learner"},</h2>
        <p>Here is your <strong>One-Time Password (OTP)</strong> to continue.</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:3px;margin:16px 0;">${otp}</p>
        <p>This code is valid for 5 minutes.</p>
      </div>`
    );
  }

  async verifyOtp(email, otp) {
    const user = await userRepository.findByEmail(email);
    if (!user || user.resetOtp != otp || user.otpExpires < Date.now()) {
      throw new ApiError(404, "Invalid OTP");
    }

    user.isOtpVerified = true;
    user.resetOtp = undefined;
    user.otpExpires = undefined;
    await userRepository.save(user);
  }

  async resetPassword(email, newPassword) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isOtpVerified) throw new ApiError(404, "OTP verification required");

    user.password = await bcrypt.hash(newPassword, 10);
    user.isOtpVerified = false;
    await userRepository.save(user);

    await sendMail(email, "🔁 Password Reset Successful", "<p>Your password was reset successfully.</p>");
  }

  async googleAuth(name, email) {
    let user = await userRepository.findByEmail(email);
    if (!user) {
      user = await userRepository.createUser({ name, email, role: "user" });
      await sendMail(email, "👋 Welcome to Ranbhoomi", "<p>You signed in via Google successfully.</p>");
    }
    return { user, token: this.generateToken(user._id, user.role) };
  }
}

export default new AuthService();