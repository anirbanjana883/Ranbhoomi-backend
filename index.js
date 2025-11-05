import express from 'express';
import dotenv from 'dotenv';
import connectDb from './config/connectDB.js';
import cookieParser from 'cookie-parser';
import cors from "cors"
import cron from "node-cron";
import { publishEndedContestProblems } from "./services/contestPublisher.js";
import authRouter from './route/authRoute.js';
import userRouter from './route/userRoute.js';
import adminRequestRouter from './route/adminRequestRoute.js';
import problemRouter from './route/problemRoute.js';
import tagRouter from './route/tagRoutes.js';
import submissionRouter from './route/submissionRoutes.js';
import contestRouter from './route/contestRoutes.js';
import contestSubmissionRouter from './route/contestSubmissionRoute.js';


dotenv.config();

const port  = process.env.PORT || 5000

const app = express()

app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin : "http://localhost:5173",
    credentials : true
}))

app.use("/api/auth",authRouter)
app.use("/api/user",userRouter)
app.use("/api/admin",adminRequestRouter)
app.use("/api/problems",problemRouter)
app.use('/api/tags', tagRouter);
app.use('/api/submissions', submissionRouter);
app.use('/api/contests', contestRouter);
app.use('/api/contest-submissions', contestSubmissionRouter);



app.get('/', (req, res) => {
    res.send('Hello from RANBHOOMI ')
})


// --- auto update unppublished problem to published  ---
const startServer = async () => {
    try {
        await connectDb(); 

        
        app.listen(port, () => {
            console.log(`Server is running on port : ${port}`);

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