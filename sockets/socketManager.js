import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import InterviewSession from "../models/interviewSessionModel.js";
import Problem from "../models/problemModel.js";
import { handleRunCode } from "./runHandler.js";
import connection from "../config/queue.js";

export const initSockets = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:5173", process.env.CLIENT_URL],
            methods: ["GET", "POST", "PUT", "PATCH"],
            credentials: true,
        },
    });

    // Auth Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (token) {
            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) return next(new Error("Authentication error"));
                socket.userId = decoded.userId || decoded.id; 
                next();
            });
        } else {
            socket.userId = null;
            next();
        }
    });

    io.on("connection", (socket) => {
        if (socket.userId) socket.join(socket.userId); 

        //  Register System 1: The Run Code Fast-Path
        handleRunCode(socket);

        // Interview Room Logic
        socket.on("join-room", (roomID) => {
            if (!roomID || Array.from(socket.rooms).includes(roomID)) return; 
            socket.join(roomID);
            socket.to(roomID).emit("user-joined", { socketId: socket.id });
        });

        socket.on("select-problem", async ({ roomID, problemId }) => {
            try {
                const problem = await Problem.findById(problemId).populate({
                    path: "testCases", match: { isSample: true }, select: "input expectedOutput _id",
                }).lean();
                if (!problem) return;
                await InterviewSession.findOneAndUpdate({ roomID }, { problem: problemId });
                io.to(roomID).emit("problem-selected", { problem });
            } catch (err) {
                console.error("ERROR selecting problem:", err); 
            }
        });

        socket.on("offer", ({ target, offer }) => io.to(target).emit("offer-received", { sender: socket.id, offer }));
        socket.on("answer", ({ target, answer }) => io.to(target).emit("answer-received", { sender: socket.id, answer }));
        socket.on("ice-candidate", ({ target, candidate }) => io.to(target).emit("ice-candidate-received", { sender: socket.id, candidate }));
        socket.on("tab-change", ({ roomID, tab }) => socket.to(roomID).emit("tab-changed", { tab }));
        socket.on("code-change", ({ roomID, code }) => socket.to(roomID).emit("code-changed", { code }));
        socket.on("language-change", ({ roomID, language }) => socket.to(roomID).emit("language-changed", { language }));
        socket.on("tldraw-changed", (payload) => socket.to(payload.roomID).emit("tldraw-update", { snapshot: payload.snapshot }));
        socket.on("tldraw-cursor", (payload) => socket.to(payload.roomID).emit("tldraw-cursor-update", { socketId: socket.id, cursor: payload.cursor }));
    });

    const subscriber = connection.duplicate();
    
    subscriber.subscribe("submission-events", (err, count) => {
        if (err) console.error("Failed to subscribe to submission-events", err);
        else console.log(`Socket server subscribed to ${count} Redis channels.`);
    });

    subscriber.on("message", (channel, message) => {
        if (channel === "submission-events") {
            try {
                const data = JSON.parse(message);
                if (data.userId) {
                    io.to(data.userId).emit("submission-events", data);
                }
            } catch (err) {
                console.error("Error parsing Redis message:", err);
            }
        }
    });

    return io;
};