import User from "../models/userModel.js";
import validator from "validator";
import bcrypt from "bcryptjs";
import genToken from "../config/token.js";
import sendMail from "../config/sendMail.js";


const generateUsername = async (name) => {
  let baseUsername = name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^a-z0-9-]/g, "");

  let username = baseUsername;
  let isUnique = false;

  while (!isUnique) {
    const existingUser = await User.findOne({ username: username });
    if (!existingUser) {
      // We found a unique name!
      isUnique = true;
    } else {
      // If it exists, add a random 4-digit number and loop again to re-check
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      username = `${baseUsername}-${randomSuffix}`;
    }
  }
  return username;
};


// ------------------------ SIGNUP ------------------------
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let existUser = await User.findOne({ email });
    if (existUser)
      return res.status(400).json({ message: "User already exists" });

    if (!validator.isEmail(email))
      return res.status(400).json({ message: "Enter valid email" });

    if (password.length < 8)
      return res.status(400).json({ message: "Enter strong password" });

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    const username = await generateUsername(name);

    const hashPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      username,
      email,
      password: hashPassword,
      role: "user",
    });

    const token = await genToken(user._id);
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // set true in production
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send welcome email
    const subject = "🎉 Welcome to Ranbhoomi!";
    const html = `
      <div style="font-family: Arial, sans-serif; text-align:center; padding:20px;">
        <h2>Hello ${user.name},</h2>
        <p>Welcome to <strong>Ranbhoomi</strong>! Your account has been created successfully.</p>
        <p>Get started with your learning journey and explore Ranbhoomi.</p>
        <p style="margin-top:20px; color:#6b7280;">- The Ranbhoomi Team</p>
      </div>`;
    const text = `Hello ${user.name}, welcome to Ranbhoomi! Your account has been created successfully.`;

    await sendMail(user.email, subject, html, text);

    return res.status(201).json(user);
  } catch (error) {
    return res.status(500).json({ message: `Signup error ${error}` });
  }
};

// ------------------------ LOGIN ------------------------
export const logIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Incorrect Password" });

    const token = await genToken(user._id);
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: `Login error ${error}` });
  }
};

// ------------------------ LOGOUT ------------------------
export const logOut = async (req, res) => {
  try {
    await res.clearCookie("token", {
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    });
    return res.status(200).json({ message: `Logout successfully` });
  } catch (error) {
    return res.status(500).json({ message: `Logout error ${error}` });
  }
};

// ------------------------ SEND OTP ------------------------
export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.resetOtp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.isOtpVerified = false;
    await user.save();

    const subject = "🔐 Your Ranbhoomi OTP";
    const html = `
      <div style="font-family:Arial,sans-serif;text-align:center;padding:20px;">
        <h2>Hello ${user.name || "Learner"},</h2>
        <p>Here is your <strong>One-Time Password (OTP)</strong> to continue with Ranbhoomi.</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:3px;margin:16px 0;">${otp}</p>
        <p>This code is valid for 5 minutes.</p>
        <p style="margin-top:20px;color:#6b7280;">- The Ranbhoomi Team</p>
      </div>`;
    const text = `Hello ${user.name || "Learner"}, your Ranbhoomi OTP is ${otp}. It is valid for 5 minutes.`;

    await sendMail(email, subject, html, text);

    return res.status(200).json({ message: `OTP sent successfully` });
  } catch (error) {
    return res.status(500).json({ message: `Send OTP error ${error}` });
  }
};

// ------------------------ VERIFY OTP ------------------------
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.resetOtp != otp || user.otpExpires < Date.now()) {
      return res.status(404).json({ message: "Invalid OTP" });
    }

    user.isOtpVerified = true;
    user.resetOtp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.status(200).json({ message: `OTP verified successfully` });
  } catch (error) {
    return res.status(500).json({ message: `Verify OTP error ${error}` });
  }
};

// ------------------------ RESET PASSWORD ------------------------
export const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.isOtpVerified)
      return res.status(404).json({ message: "OTP verification required" });

    const hashPassword = await bcrypt.hash(password, 10);
    user.password = hashPassword;
    user.isOtpVerified = false;
    await user.save();

    const subject = "🔁 Password Reset Successful";
    const html = `
      <div style="font-family:Arial,sans-serif;text-align:center;padding:20px;">
        <h2>Hello ${user.name},</h2>
        <p>Your password has been reset successfully.</p>
        <p>If you didn’t initiate this action, please change your password immediately.</p>
        <p style="margin-top:20px;color:#6b7280;">- The Ranbhoomi Team</p>
      </div>`;
    const text = `Hello ${user.name}, your password has been reset successfully. If you didn't initiate this, please change it immediately.`;

    await sendMail(email, subject, html, text);

    return res.status(200).json({ message: `Password reset successfully` });
  } catch (error) {
    return res.status(500).json({ message: `Reset password error ${error}` });
  }
};

// ------------------------ GOOGLE AUTH ------------------------
export const googleAuth = async (req, res) => {
  try {
    const { name, email } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({ name, email, role: "user" });

      // send welcome email
      const subject = "👋 Welcome to Ranbhoomi (Google Auth)";
      const html = `
        <div style="font-family:Arial,sans-serif;text-align:center;padding:20px;">
          <h2>Welcome ${name}!</h2>
          <p>You’ve signed in using Google successfully.</p>
          <p>Explore your dashboard and start your learning journey.</p>
          <p style="margin-top:20px;color:#6b7280;">- The Ranbhoomi Team</p>
        </div>`;
      const text = `Welcome ${name}! You’ve signed in to Ranbhoomi using Google successfully.`;

      await sendMail(email, subject, html, text);
    }

    const token = await genToken(user._id);
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json(user);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Authentication with Google error ${error}` });
  }
};
