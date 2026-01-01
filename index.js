import express from "express";
import dotenv from "dotenv";
import connectDb from "./config/connectDB.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import cron from "node-cron";
import { publishEndedContestProblems } from "./services/contestPublisher.js";
import authRouter from "./route/authRoute.js";
import userRouter from "./route/userRoute.js";
import adminRequestRouter from "./route/adminRequestRoute.js";
import problemRouter from "./route/problemRoute.js";
import tagRouter from "./route/tagRoutes.js";
import submissionRouter from "./route/submissionRoutes.js";
import contestRouter from "./route/contestRoutes.js";
import contestSubmissionRouter from "./route/contestSubmissionRoute.js";
import interviewRouter from "./route/interviewRoute.js";
import commentRouter from "./route/commentRoute.js";
import aiRouter from "./route/aiRoute.js";
import http from "http";
import { Server } from "socket.io";
import InterviewSession from "./models/interviewSessionModel.js";
import Problem from "./models/problemModel.js";
import paymentRouter from "./route/paymentRoute.js";

dotenv.config();

const port = process.env.PORT || 5000;

const app = express();

// ---  HTTP SERVER & SOCKET.IO SETUP ---
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRequestRouter);
app.use("/api/problems", problemRouter);
app.use("/api/tags", tagRouter);
app.use("/api/submissions", submissionRouter);
app.use("/api/contests", contestRouter);
app.use("/api/contest-submissions", contestSubmissionRouter);
app.use("/api/interview", interviewRouter);
app.use('/api/comments', commentRouter);
app.use("/api/ai", aiRouter);
app.use("/api/payment", paymentRouter);

app.get("/", (req, res) => {
  res.send("Hello from RANBHOOMI ");
});

// This is the "phone operator"
io.on("connection", (socket) => {
  console.log(`⚡ Connected: ${socket.id}`);

  socket.onAny((event, payload) => {
    console.log(`📨 Event: ${event}`, payload?.roomID || "");
  });

  socket.on("join-room", (roomID) => {
    if (!roomID) return;
    if (Array.from(socket.rooms).includes(roomID)) return; // ✅ already joined

    socket.join(roomID);
    console.log(`📡 ${socket.id} joined room ${roomID}`);
    socket.to(roomID).emit("user-joined", { socketId: socket.id });
  });

  // --- WebRTC Signaling ---
  socket.on("offer", ({ target, offer }) => {
    io.to(target).emit("offer-received", { sender: socket.id, offer });
  });

  socket.on("answer", ({ target, answer }) => {
    io.to(target).emit("answer-received", { sender: socket.id, answer });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate-received", {
      sender: socket.id,
      candidate,
    });
  });

  // --- Sync events (tabs, code, etc.) ---
  socket.on("tab-change", ({ roomID, tab }) => {
    socket.to(roomID).emit("tab-changed", { tab });
  });

  socket.on("code-change", ({ roomID, code }) => {
    socket.to(roomID).emit("code-changed", { code });
  });

  socket.on("language-change", ({ roomID, language }) => {
    socket.to(roomID).emit("language-changed", { language });
  });

  socket.on("select-problem", async ({ roomID, problemId }) => {
    console.log(`[Socket] Event: 'select-problem' received for room ${roomID}`); // <-- ADD THIS
    try {
      const problem = await Problem.findById(problemId).populate({
        path: "testCases",
        match: { isSample: true },
        select: "input expectedOutput _id",
      });

      if (!problem) {
        console.error("❌ Error: Problem not found with ID:", problemId); // <-- ADD THIS
        return;
      }

      await InterviewSession.findOneAndUpdate(
        { roomID },
        { problem: problemId }
      );

      console.log(`[Socket] Event: 'problem-selected' emitting to room ${roomID}`); // <-- ADD THIS
      io.to(roomID).emit("problem-selected", { problem });

    } catch (err) {
      console.error("❌ FATAL ERROR selecting problem:", err); // <-- This will catch crashes
    }
  });

  socket.on("tldraw-changed", (payload) => {
    // Just relay the snapshot to everyone else in the room
    socket.to(payload.roomID).emit("tldraw-update", { 
      snapshot: payload.snapshot 
    });
  });

  socket.on("tldraw-cursor", (payload) => {
    // Just relay the cursor data to everyone else in the room
    socket.to(payload.roomID).emit("tldraw-cursor-update", {
      socketId: socket.id,
      cursor: payload.cursor
    });
  });


  socket.on("disconnect", () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

// --- auto update unppublished problem to published  ---
const startServer = async () => {
  try {
    await connectDb();

    httpServer.listen(port, () => {
      console.log(`Server is running on port : ${port}`);
      console.log("Socket.io listening for connections..."); // New log

      cron.schedule("30 * * * *", () => {
        console.log("Scheduler: Checking for contests to publish...");
        publishEndedContestProblems();
      });
      console.log("Scheduled contest publisher to run hourly.");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// app.listen(port,() =>{
//     console.log(`Server is running on port : ${port}`)
//     connectDb()
// })
