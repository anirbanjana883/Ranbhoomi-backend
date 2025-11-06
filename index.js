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
import http from "http";
import { Server } from "socket.io";
import InterviewSession from './models/interviewSessionModel.js';
import Problem from './models/problemModel.js';

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

app.get("/", (req, res) => {
  res.send("Hello from RANBHOOMI ");
});

// This is the "phone operator"
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a user enters the interview room page
  socket.on("join-room", (roomID) => {
    socket.join(roomID);
    // console.log(`User ${socket.id} joined room ${roomID}`);

    socket.to(roomID).emit("user-joined", { socketId: socket.id });
  });

  // WebRTC Signaling: A user sends an "offer"
  socket.on("offer", (payload) => {
    // console.log(`Offer from ${socket.id} to ${payload.target}`);
    io.to(payload.target).emit("offer-received", {
      offer: payload.offer,
      sender: socket.id,
    });
  });

  // WebRTC Signaling: A user sends an "answer"
  socket.on("answer", (payload) => {
    // console.log(`Answer from ${socket.id} to ${payload.target}`);
    io.to(payload.target).emit("answer-received", {
      answer: payload.answer,
      sender: socket.id,
    });
  });

  // WebRTC Signaling: Passing connection candidates
  socket.on("ice-candidate", (payload) => {
    socket.to(payload.target).emit("ice-candidate-received", {
      candidate: payload.candidate,
      sender: socket.id,
    });
  });

  // Handle user leaving
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    // We can emit a 'user-left' event here later
  });

  socket.on("tab-change", (payload) => {
    // Send the active tab to everyone else in the room
    socket.to(payload.roomID).emit("tab-changed", {
      tab: payload.tab,
    });
  });

  socket.on('select-problem', async (payload) => {
    try {
      const { roomID, problemId } = payload;
      
      // Find the problem and populate its sample test cases
      const problem = await Problem.findById(problemId).populate({
        path: "testCases",
        match: { isSample: true },
        select: "input expectedOutput _id",
      });

      if (!problem) {
        // Handle error (e.g., emit back to sender)
        return;
      }
      
      // Update the session in the database
      await InterviewSession.findOneAndUpdate(
        { roomID: roomID },
        { problem: problemId }
      );
      
      // Broadcast the *full problem object* to everyone in the room
      io.to(roomID).emit('problem-selected', { problem: problem });

    } catch (error) {
      console.error("Error selecting problem:", error);
    }
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
