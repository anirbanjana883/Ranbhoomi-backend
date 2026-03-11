import InterviewSession from "../models/interviewSessionModel.js";
import { v4 as uuidV4 } from "uuid";
import redisClient from "../config/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const createInterviewSession = asyncHandler(async (req, res) => {
  if (!req.userId) throw new ApiError(401, "Unauthorized request");

  const roomID = uuidV4();
  const session = await InterviewSession.create({
    roomID,
    interviewer: req.userId,
    candidate: null,
    status: "Scheduled",
    problem: null,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(201, session, "Interview session created successfully"),
    );
});

export const getInterviewSession = asyncHandler(async (req, res) => {
  const { roomID } = req.params;
  if (!roomID) throw new ApiError(400, "Room ID is required");

  let session = await InterviewSession.findOne({ roomID })
    .populate("problem")
    .lean();

  if (!session) throw new ApiError(404, "Interview session not found");

  let role = "observer";

  if (session.interviewer.toString() === req.userId.toString()) {
    role = "interviewer";
  } else if (
    session.candidate &&
    session.candidate.toString() === req.userId.toString()
  ) {
    role = "candidate";
  } else if (!session.candidate) {
    // ATOMIC UPDATE: Safe assignment using lean: true
    const updatedSession = await InterviewSession.findOneAndUpdate(
      { roomID: req.params.roomID, candidate: null },
      {
        candidate: req.userId,
        status: session.status === "Scheduled" ? "Live" : session.status,
        startedAt:
          session.status === "Scheduled" ? new Date() : session.startedAt,
      },
      { new: true, lean: true },
    ).populate("problem");

    if (updatedSession) {
      session = updatedSession;
      role = "candidate";
    } else {
      role = "observer";
    }
  }

  let currentCode = session.code;
  let currentLanguage = session.language;

  try {
    const [cachedCode, cachedLang] = await Promise.all([
      redisClient.get(`interview:session:${roomID}:code`),
      redisClient.get(`interview:session:${roomID}:language`),
    ]);

    if (cachedCode) currentCode = cachedCode;
    if (cachedLang) currentLanguage = cachedLang;
  } catch (redisErr) {
    console.error("Redis fetch failed, falling back to DB:", redisErr);
  }

  // Notice we don't need `session.toObject()` anymore because of .lean()
  const responseData = {
    ...session,
    role,
    code: currentCode,
    language: currentLanguage,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        responseData,
        "Interview session fetched successfully",
      ),
    );
});

export const endInterviewSession = asyncHandler(async (req, res) => {
  const { roomID } = req.params;
  if (!roomID) throw new ApiError(400, "Room ID is required");

  const session = await InterviewSession.findOne({ roomID });
  if (!session) throw new ApiError(404, "Interview session not found");

  //  SECURITY: Only the Interviewer has the authority to end the session
  if (session.interviewer.toString() !== req.userId.toString()) {
    throw new ApiError(403, "Only the interviewer can end this session");
  }

  if (session.status === "Completed") {
    throw new ApiError(400, "Interview is already completed");
  }

  //. Extract the final, un-saved code from Redis
  const [finalCode, finalLang] = await Promise.all([
    redisClient.get(`interview:session:${roomID}:code`),
    redisClient.get(`interview:session:${roomID}:language`)
  ]);

  // Archive to MongoDB & Update Status
  session.status = "Completed";
  session.endedAt = new Date();
  if (finalCode) session.code = finalCode;
  if (finalLang) session.language = finalLang;
  
  await session.save();

  //  THE CLEANUP: Nuke the Redis keys to prevent memory leaks
  await Promise.all([
    redisClient.del(`interview:session:${roomID}:code`),
    redisClient.del(`interview:session:${roomID}:language`)
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, session, "Interview completed and data archived successfully"));
});