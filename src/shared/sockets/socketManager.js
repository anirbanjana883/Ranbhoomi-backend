import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie"; 
import { registerExecutionHandlers } from "../../modules/codeexecution/execution.socket.js";
import { registerContestHandlers } from "../../modules/contests/contest.socket.js";
import { registerInterviewHandlers } from "../../modules/interview/interview.socket.js";

export const initSockets = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:5173", process.env.FRONTEND_URL],
            methods: ["GET", "POST", "PUT", "PATCH"],
            credentials: true,
        },
    });

    io.use((socket, next) => {
        try {
            let token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token && socket.handshake.headers.cookie) {
                const cookies = cookie.parse(socket.handshake.headers.cookie);
                token = cookies.token;
            }

            if (!token) return next(new Error("Authentication required"));

            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) return next(new Error("Invalid or expired token"));
                socket.userId = String(decoded.userId || decoded.id);
                next();
            });
        } catch (error) {
            next(new Error("Internal server error"));
        }
    });

    io.on("connection", (socket) => {
        if (socket.userId) socket.join(socket.userId);

        registerExecutionHandlers(io, socket);
        registerContestHandlers(io, socket);
        registerInterviewHandlers(io, socket);
    });

    return io;
};