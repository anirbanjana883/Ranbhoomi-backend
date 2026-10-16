import interviewRepository from "./interview.repository.js";
import problemRepository from "../problems/problem.repository.js";
import { redisCache } from "../../core/redis.js";

const roomStateBuffer = new Map(); 
const roomSaveTimers = new Map();  

const scheduleRedisSave = (roomID) => {
    if (roomSaveTimers.has(roomID)) clearTimeout(roomSaveTimers.get(roomID));

    roomSaveTimers.set(roomID, setTimeout(async () => {
        const state = roomStateBuffer.get(roomID);
        if (!state) return;

        try {
            if (state.code !== undefined) await redisCache.set(`interview:session:${roomID}:code`, state.code, { ex: 86400 });
            if (state.language !== undefined) await redisCache.set(`interview:session:${roomID}:language`, state.language, { ex: 86400 });
        } catch (err) {
            console.error("[Redis] Background save error:", err);
        }
    }, 3000));
};

export const registerInterviewHandlers = (io, socket) => {
    let currentInterviewRoom = null;

    socket.on("join-room", async (roomID) => {
        if (!roomID || socket.rooms.has(roomID)) return;
        try {
            const session = await interviewRepository.findByRoomID(roomID);
            if (!session) return socket.emit("unauthorized-room", { message: "Room not found." });

            const allowed = session.interviewer._id.toString() === socket.userId || session.candidate?.toString() === socket.userId;
            if (!allowed) return socket.emit("unauthorized-room", { message: "Not authorized to join." });

            socket.join(roomID);
            currentInterviewRoom = roomID;
            socket.to(roomID).emit("user-joined", { socketId: socket.id });
        } catch (err) {
            console.error("[Room] Error joining room:", err);
        }
    });

    socket.on("code-change", async ({ roomID, code }) => {
        socket.to(roomID).emit("code-changed", { code });
        if (!roomStateBuffer.has(roomID)) roomStateBuffer.set(roomID, {});
        roomStateBuffer.get(roomID).code = code;
        scheduleRedisSave(roomID);
    });

    socket.on("language-change", async ({ roomID, language }) => {
        socket.to(roomID).emit("language-changed", { language });
        if (!roomStateBuffer.has(roomID)) roomStateBuffer.set(roomID, {});
        roomStateBuffer.get(roomID).language = language;
        scheduleRedisSave(roomID);
    });

    socket.on("select-problem", async ({ roomID, problemId }) => {
        try {
            const problem = await problemRepository.findOne({ _id: problemId }).populate({ path: "testCases", match: { isSample: true }, select: "input expectedOutput _id" }).lean();
            if (!problem) return;

            await interviewRepository.updateProblem(roomID, problemId);
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

    socket.on("disconnecting", () => {
        if (currentInterviewRoom) {
            socket.to(currentInterviewRoom).emit("user-disconnected", { socketId: socket.id });
            scheduleRedisSave(currentInterviewRoom); 
        }
    });
};