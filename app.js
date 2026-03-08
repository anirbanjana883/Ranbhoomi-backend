// app.js
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

// Routes
import authRouter from "./route/authRoute.js";
import userRouter from "./route/userRoute.js";
import communityRouter from "./route/communityRoutes.js";
import adminRequestRouter from "./route/adminRequestRoute.js";
import problemRouter from "./route/problemRoute.js";
import tagRouter from "./route/tagRoutes.js";
import submissionRouter from "./route/submissionRoutes.js";
import contestRouter from "./route/contestRoutes.js";
import contestSubmissionRouter from "./route/contestSubmissionRoute.js";
import interviewRouter from "./route/interviewRoute.js";
import commentRouter from "./route/commentRoute.js";
import aiRouter from "./route/aiRoute.js";
import paymentRouter from "./route/paymentRoute.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: ["'self'", "http://localhost:5173", "ws://localhost:5000", process.env.CLIENT_URL || "http://localhost:5173"],
                imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com", "https://cdn-icons-png.flaticon.com"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
            },
        },
    })
);

app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.originalUrl}`);
    next();
});

// --- ROUTES ---
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
app.use("/api/community", communityRouter);

app.get("/", (req, res) => res.send("RANBHOOMI API Operational ⚔️"));

app.use(errorHandler);

export default app;