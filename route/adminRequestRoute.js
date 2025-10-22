import express from "express";
import {
  requestAdmin,
  listPendingRequests,
  approveRequest,
  rejectRequest,
} from "../controller/adminRequestController.js";
import isAuth from "../middleware/isAuth.js";
import isMaster from "../middleware/isMaster.js";

const adminRequestRouter = express.Router();

// Normal user requests admin access
adminRequestRouter.post("/request", isAuth, requestAdmin);

// Master views all pending requests
adminRequestRouter.get("/pending", isAuth, isMaster, listPendingRequests);

// Master approves/rejects request
adminRequestRouter.patch("/approve/:requestId", isAuth, isMaster, approveRequest);
adminRequestRouter.patch("/reject/:requestId", isAuth, isMaster, rejectRequest);

export default adminRequestRouter;
