import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
    let error = err;

    // If the error thrown is a standard Error (not our custom ApiError), 
    // we wrap it in an ApiError so the format remains consistent.
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || "Internal Server Error";
        error = new ApiError(statusCode, message, error?.errors || [], err.stack);
    }

    // Format the response payload. 
    // IMPORTANT: Make sure this matches what your Axios/Fetch calls in the frontend currently expect!
    const response = {
        success: error.success, // always false
        message: error.message,
        ...(error.errors.length > 0 && { errors: error.errors }),
        // Only leak stack traces in development mode for security
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {})
    };

    return res.status(error.statusCode).json(response);
};

export { errorHandler };