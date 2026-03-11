import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie"; // 🚀 Required to extract HTTP-only cookies
import InterviewSession from "../models/interviewSessionModel.js";
import Problem from "../models/problemModel.js";
import { handleRunCode } from "./runHandler.js";
import connection from "../config/queue.js";
import redisClient from "../config/redis.js";

export const initSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", process.env.CLIENT_URL],
      methods: ["GET", "POST", "PUT", "PATCH"],
      credentials: true,
    },
  });

  // ==========================================
  // 🚀 AUTH MIDDLEWARE (Cookie Enabled)
  // ==========================================
  io.use((socket, next) => {
    try {
      // 1. Try to get token from handshake auth or query
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;

      // 2. Fallback: Parse token from HTTP Headers (Required for your Auth setup)
      if (!token && socket.handshake.headers.cookie) {
        const cookies = cookie.parse(socket.handshake.headers.cookie);
        token = cookies.token;
      }

      if (!token) {
        console.warn(`[Socket Auth] Blocked connection: No token provided.`);
        return next(new Error("Authentication required"));
      }

      // 3. Verify JWT
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          console.error(
            `[Socket Auth] Token verification failed: ${err.message}`,
          );
          return next(new Error("Invalid or expired token"));
        }

        // Standardize userId as a string for perfect database matching
        socket.userId = String(decoded.userId || decoded.id);
        next();
      });
    } catch (error) {
      console.error("[Socket Auth] Middleware crash:", error);
      next(new Error("Internal server error"));
    }
  });

  // ==========================================
  // 🚀 SOCKET EVENT LISTENERS
  // ==========================================
  io.on("connection", (socket) => {
    // Join a private room for user-specific events (like personal submissions)
    if (socket.userId) socket.join(socket.userId);

    // Track active room for disconnect handling
    let currentInterviewRoom = null;

    // Initialize run code handler
    handleRunCode(socket);

    // --- CONTEST LOGIC ---
    socket.on("join-contest", (contestId) => {
      if (!contestId) return;
      socket.join(`contest_${contestId}`);
    });

    socket.on("leave-contest", (contestId) => {
      if (!contestId) return;
      socket.leave(`contest_${contestId}`);
    });

    // --- INTERVIEW ROOM LOGIC ---

    // 🔒 Validate Membership & Join Room
    socket.on("join-room", async (roomID) => {
      if (!roomID || socket.rooms.has(roomID)) return;

      if (!socket.userId) {
        return socket.emit("unauthorized-room", {
          message: "Authentication required",
        });
      }

      try {
        const session = await InterviewSession.findOne({ roomID })
          .select("interviewer candidate")
          .lean();

        if (!session) {
          return socket.emit("unauthorized-room", {
            message: "Room not found.",
          });
        }

        // 🚀 Strict String Comparison guarantees MongoDB ObjectIDs match JWT strings
        const allowed =
          session.interviewer.toString() === socket.userId ||
          session.candidate?.toString() === socket.userId;

        if (!allowed) {
          return socket.emit("unauthorized-room", {
            message: "Not authorized to join.",
          });
        }

        socket.join(roomID);
        currentInterviewRoom = roomID;

        // Notify others in the room
        socket.to(roomID).emit("user-joined", {
          socketId: socket.id,
        });

        console.log(`[Room] User ${socket.userId} joined room ${roomID}`);
      } catch (err) {
        console.error("[Room] Error joining room:", err);
      }
    });

    // 💾 Code Sync + Redis Persistence (TTL 24h to prevent memory leaks)
    socket.on("code-change", async ({ roomID, code }) => {
      socket.to(roomID).emit("code-changed", { code });
      try {
        await redisClient.set(`interview:session:${roomID}:code`, code, {
          ex: 86400,
        });
      } catch (err) {
        console.error("[Redis] Code save error:", err);
      }
    });

    // 💾 Language Sync + Redis Persistence
    socket.on("language-change", async ({ roomID, language }) => {
      socket.to(roomID).emit("language-changed", { language });
      try {
        await redisClient.set(
          `interview:session:${roomID}:language`,
          language,
          {
            ex: 86400,
          },
        );
      } catch (err) {
        console.error("[Redis] Language save error:", err);
      }
    });

    // 📚 Problem Selection
    socket.on("select-problem", async ({ roomID, problemId }) => {
      try {
        const problem = await Problem.findById(problemId)
          .populate({
            path: "testCases",
            match: { isSample: true },
            select: "input expectedOutput _id",
          })
          .lean();
        if (!problem) return;

        await InterviewSession.findOneAndUpdate(
          { roomID },
          { problem: problemId },
        );
        io.to(roomID).emit("problem-selected", { problem });
      } catch (err) {
        console.error("[DB] ERROR selecting problem:", err);
      }
    });

    // 🎥 WebRTC Signaling
    socket.on("offer", ({ target, offer }) =>
      io.to(target).emit("offer-received", { sender: socket.id, offer }),
    );

    socket.on("answer", ({ target, answer }) =>
      io.to(target).emit("answer-received", { sender: socket.id, answer }),
    );

    socket.on("ice-candidate", ({ target, candidate }) =>
      io
        .to(target)
        .emit("ice-candidate-received", { sender: socket.id, candidate }),
    );

    // 🔄 Workspace Sync
    socket.on("tab-change", ({ roomID, tab }) =>
      socket.to(roomID).emit("tab-changed", { tab }),
    );

    socket.on("tldraw-changed", (payload) =>
      socket
        .to(payload.roomID)
        .emit("tldraw-update", { snapshot: payload.snapshot }),
    );

    socket.on("tldraw-cursor", (payload) =>
      socket.to(payload.roomID).emit("tldraw-cursor-update", {
        socketId: socket.id,
        cursor: payload.cursor,
      }),
    );

    //  Disconnect Handling
    socket.on("disconnecting", () => {
      if (currentInterviewRoom) {
        // Broadcast the exact event name your React frontend is listening for
        socket
          .to(currentInterviewRoom)
          .emit("user-disconnected", { socketId: socket.id });
      }
    });
  });

  // ==========================================
  // 🚀 REDIS PUB/SUB (Leaderboards & Submissions)
  // ==========================================
  const subscriber = connection.duplicate();

  subscriber.subscribe(
    "submission-events",
    "leaderboard-events",
    (err, count) => {
      if (err) console.error("[Redis] Failed to subscribe to channels", err);
    },
  );

  subscriber.on("message", (channel, message) => {
    try {
      const data = JSON.parse(message);
      if (channel === "submission-events") {
        if (data.userId) {
          io.to(String(data.userId)).emit("submission-events", data);
        }
      }
      if (channel === "leaderboard-events") {
        if (data.contestId) {
          io.to(`contest_${data.contestId}`).emit("leaderboard-updated", {
            userId: data.userId,
            newScore: data.newScore,
          });
        }
      }
    } catch (err) {
      console.error("[Redis] Error parsing message:", err);
    }
  });

  return io;
};
