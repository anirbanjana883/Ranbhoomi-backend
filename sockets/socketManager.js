import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie"; 
import InterviewSession from "../models/interviewSessionModel.js";
import Problem from "../models/problemModel.js";
import { handleRunCode } from "./runHandler.js";
import redisClient from "../config/redis.js"; // Note: 'connection' removed as it's no longer used here

// REDIS EXHAUST FIX: Node.js Memory Buffers
const roomStateBuffer = new Map(); 
const roomSaveTimers = new Map();  

const scheduleRedisSave = (roomID) => {
  if (roomSaveTimers.has(roomID)) {
    clearTimeout(roomSaveTimers.get(roomID));
  }

  // Wait 3 seconds after user STOP typing before hitting Redis
  roomSaveTimers.set(roomID, setTimeout(async () => {
    const state = roomStateBuffer.get(roomID);
    if (!state) return;

    try {
      if (state.code !== undefined) {
        await redisClient.set(`interview:session:${roomID}:code`, state.code, { ex: 86400 });
      }
      if (state.language !== undefined) {
        await redisClient.set(`interview:session:${roomID}:language`, state.language, { ex: 86400 });
      }
      console.log(`[Redis] 💾 Saved debounced state for room ${roomID}`);
    } catch (err) {
      console.error("[Redis] Background save error:", err);
    }
  }, 3000));
};

export const initSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", process.env.FRONTEND_URL],
      methods: ["GET", "POST", "PUT", "PATCH"],
      credentials: true,
    },
  });

  // AUTH MIDDLEWARE 
  io.use((socket, next) => {
    try {
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token && socket.handshake.headers.cookie) {
        const cookies = cookie.parse(socket.handshake.headers.cookie);
        token = cookies.token;
      }

      if (!token) {
        console.warn(`[Socket Auth] Blocked connection: No token provided.`);
        return next(new Error("Authentication required"));
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          console.error(`[Socket Auth] Token verification failed: ${err.message}`);
          return next(new Error("Invalid or expired token"));
        }
        socket.userId = String(decoded.userId || decoded.id);
        next();
      });
    } catch (error) {
      console.error("[Socket Auth] Middleware crash:", error);
      next(new Error("Internal server error"));
    }
  });

  // SOCKET EVENT LISTENERS
  io.on("connection", (socket) => {
    if (socket.userId) socket.join(socket.userId);

    let currentInterviewRoom = null;
    handleRunCode(socket);

    socket.on("join-contest", (contestId) => {
      if (!contestId) return;
      socket.join(`contest_${contestId}`);
    });

    socket.on("leave-contest", (contestId) => {
      if (!contestId) return;
      socket.leave(`contest_${contestId}`);
    });

    socket.on("join-room", async (roomID) => {
      if (!roomID || socket.rooms.has(roomID)) return;
      if (!socket.userId) return socket.emit("unauthorized-room", { message: "Authentication required" });

      try {
        const session = await InterviewSession.findOne({ roomID }).select("interviewer candidate").lean();
        if (!session) return socket.emit("unauthorized-room", { message: "Room not found." });

        const allowed = session.interviewer.toString() === socket.userId || session.candidate?.toString() === socket.userId;
        if (!allowed) return socket.emit("unauthorized-room", { message: "Not authorized to join." });

        socket.join(roomID);
        currentInterviewRoom = roomID;
        socket.to(roomID).emit("user-joined", { socketId: socket.id });
        console.log(`[Room] User ${socket.userId} joined room ${roomID}`);
      } catch (err) {
        console.error("[Room] Error joining room:", err);
      }
    });

    //  OPTIMIZED: Code Sync + Write-Behind Redis Persistence
    socket.on("code-change", async ({ roomID, code }) => {
      socket.to(roomID).emit("code-changed", { code });
      
      if (!roomStateBuffer.has(roomID)) roomStateBuffer.set(roomID, {});
      roomStateBuffer.get(roomID).code = code;

      scheduleRedisSave(roomID);
    });

    // OPTIMIZED: Language Sync + Write-Behind Redis Persistence
    socket.on("language-change", async ({ roomID, language }) => {
      socket.to(roomID).emit("language-changed", { language });
      
      if (!roomStateBuffer.has(roomID)) roomStateBuffer.set(roomID, {});
      roomStateBuffer.get(roomID).language = language;

      scheduleRedisSave(roomID);
    });

    socket.on("select-problem", async ({ roomID, problemId }) => {
      try {
        const problem = await Problem.findById(problemId)
          .populate({ path: "testCases", match: { isSample: true }, select: "input expectedOutput _id" })
          .lean();
        if (!problem) return;

        await InterviewSession.findOneAndUpdate({ roomID }, { problem: problemId });
        io.to(roomID).emit("problem-selected", { problem });
      } catch (err) {
        console.error("[DB] ERROR selecting problem:", err);
      }
    });

    socket.on("offer", ({ target, offer }) => io.to(target).emit("offer-received", { sender: socket.id, offer }));
    socket.on("answer", ({ target, answer }) => io.to(target).emit("answer-received", { sender: socket.id, answer }));
    socket.on("ice-candidate", ({ target, candidate }) => io.to(target).emit("ice-candidate-received", { sender: socket.id, candidate }));
    socket.on("tab-change", ({ roomID, tab }) => socket.to(roomID).emit("tab-changed", { tab }));
    socket.on("tldraw-changed", (payload) => socket.to(payload.roomID).emit("tldraw-update", { snapshot: payload.snapshot }));
    socket.on("tldraw-cursor", (payload) => socket.to(payload.roomID).emit("tldraw-cursor-update", { socketId: socket.id, cursor: payload.cursor }));

    //  Disconnect Handling (Force a final save!)
    socket.on("disconnecting", () => {
      if (currentInterviewRoom) {
        socket.to(currentInterviewRoom).emit("user-disconnected", { socketId: socket.id });
        
        scheduleRedisSave(currentInterviewRoom); 
      }
    });
  });

  return io;
};