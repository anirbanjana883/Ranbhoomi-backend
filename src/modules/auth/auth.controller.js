import authService from "./auth.service.js";
import validator from "validator";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { ApiError } from "../../shared/utils/ApiError.js";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const signup = async (req, res) => {
  if (!validator.isEmail(req.body.email)) throw new ApiError(400, "Invalid email");
  if (req.body.password.length < 8) throw new ApiError(400, "Password too weak");
  
  const { user, token } = await authService.signup(req.body);
  res.cookie("token", token, getCookieOptions()).status(201).json(new ApiResponse(201, user, "Signup successful"));
};

export const logIn = async (req, res) => {
  const { user, token } = await authService.login(req.body.email, req.body.password);
  res.cookie("token", token, getCookieOptions()).status(200).json(new ApiResponse(200, user, "Login successful"));
};

export const logOut = async (req, res) => {
  const options = getCookieOptions();
  delete options.maxAge;
  res.clearCookie("token", options).status(200).json(new ApiResponse(200, null, "Logged out"));
};

export const sendOtp = async (req, res) => {
  await authService.sendOtp(req.body.email);
  res.status(200).json(new ApiResponse(200, null, "OTP Sent"));
};

export const verifyOtp = async (req, res) => {
  await authService.verifyOtp(req.body.email, req.body.otp);
  res.status(200).json(new ApiResponse(200, null, "OTP Verified"));
};

export const resetPassword = async (req, res) => {
  await authService.resetPassword(req.body.email, req.body.password);
  res.status(200).json(new ApiResponse(200, null, "Password Reset"));
};

export const googleAuth = async (req, res) => {
  const { user, token } = await authService.googleAuth(req.body.name, req.body.email);
  res.cookie("token", token, getCookieOptions()).status(200).json(new ApiResponse(200, user, "Google Auth successful"));
};