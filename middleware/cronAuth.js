import { ApiError } from "../utils/ApiError.js";

export const verifyCronSecret = (req, res, next) => {
    // cron-job.org 
    //  Authorization: Bearer <YOUR_CRON_SECRET>
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next(new ApiError(401, "Unauthorized Cron Request"));
    }

    const token = authHeader.split(" ")[1];
    
    // Set this secret securely in your .env file
    if (token !== process.env.CRON_SECRET) {
        return next(new ApiError(403, "Forbidden: Invalid Cron Secret"));
    }

    next();
};