import express from "express";
import {
  requestAdmin,
  listPendingRequests,
  approveRequest,
  rejectRequest,
  getAllUsers,      
  updateUserRole,   
} from "../controller/adminRequestController.js"; 
import isAuth from "../middleware/isAuth.js";
import isMaster from "../middleware/isMaster.js";

const adminRequestRouter = express.Router();


// Normal user requests admin access
adminRequestRouter.post("/request", isAuth, requestAdmin); 

// Master views all pending requests
adminRequestRouter.get("/requests/pending", isAuth, isMaster, listPendingRequests); 

// Master approves/rejects request
adminRequestRouter.patch("/requests/approve/:requestId", isAuth, isMaster, approveRequest); 
adminRequestRouter.patch("/requests/reject/:requestId", isAuth, isMaster, rejectRequest); 


// Master gets all users (excluding self)
adminRequestRouter.get("/users", isAuth, isMaster, getAllUsers); 

// Master updates a user's role (to admin or user)
adminRequestRouter.patch("/users/role/:userId", isAuth, isMaster, updateUserRole); 


export default adminRequestRouter;