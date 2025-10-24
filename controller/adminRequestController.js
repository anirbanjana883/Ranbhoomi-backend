import AdminRequest from "../models/adminRequestModel.js";
import User from "../models/userModel.js";
import sendMail from "../config/sendMail.js";

// ---------------- REQUEST ADMIN ACCESS ----------------
export const requestAdmin = async (req, res) => {
  try {
    const { reason } = req.body;

    // Check if user already has a pending request
    const existingRequest = await AdminRequest.findOne({
      userId: req.userId,
      status: "pending",
    });
    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "You already have a pending admin request." });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const adminRequest = await AdminRequest.create({
      userId: user._id,
      email: user.email,
      reason,
    });

    // // Notify master of the new request
    // const subject = ` New Admin Access Request from ${user.name}`;
    // const html = `
    //   <h2>New Admin Request</h2>
    //   <p><strong>User:</strong> ${user.name} (${user.email})</p>
    //   <p><strong>Reason:</strong> ${reason}</p>
    //   <p>Login to your master dashboard to review the request.</p>
    // `;
    // const text = `New Admin Access Request from ${user.name} (${user.email}). Reason: ${reason}.`;

    // await sendMail(process.env.MASTER_EMAIL, subject, html, text);

    return res.status(201).json({
      message: "Admin request submitted successfully",
      adminRequest,
    });
  } catch (error) {
    return res.status(500).json({ message: `Request admin error: ${error}` });
  }
};

// ---------------- LIST PENDING REQUESTS (MASTER ONLY) ----------------
export const listPendingRequests = async (req, res) => {
  try {
    const requests = await AdminRequest.find({ status: "pending" }).populate(
      "userId",
      "name email role"
    );
    return res.status(200).json(requests);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `List pending requests error: ${error}` });
  }
};

// ---------------- APPROVE ADMIN REQUEST (MASTER ONLY) ----------------
export const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await AdminRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Update request status
    request.status = "approved";
    request.reviewedAt = Date.now();
    await request.save();

    // Update user role
    const user = await User.findById(request.userId);
    user.role = "admin";
    await user.save();

    // Send approval email
    const subject = " Admin Access Approved - Ranbhoomi";
    const html = `
      <h2>Hello ${user.name},</h2>
      <p>Congratulations! Your request for <strong>Admin Access</strong> has been approved.</p>
      <p>You can now log in and access the admin dashboard.</p>
      <br>
      <p>- The Ranbhoomi Team</p>
    `;
    const text = `Hello ${user.name}, your admin access request has been approved. You can now access the admin dashboard. - The Ranbhoomi Team`;

    await sendMail(user.email, subject, html, text);

    return res.status(200).json({ message: "Admin request approved", user });
  } catch (error) {
    return res.status(500).json({ message: `Approve request error: ${error}` });
  }
};

// ---------------- REJECT ADMIN REQUEST (MASTER ONLY) ----------------
export const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await AdminRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "rejected";
    request.reviewedAt = Date.now();
    await request.save();

    const user = await User.findById(request.userId);

    // Send rejection email
    const subject = " Admin Access Request Rejected - Ranbhoomi";
    const html = `
      <h2>Hello ${user.name},</h2>
      <p>We regret to inform you that your request for <strong>Admin Access</strong> has been rejected.</p>
      <p>If you believe this was a mistake, please contact the support team.</p>
      <br>
      <p>- The Ranbhoomi Team</p>
    `;
    const text = `Hello ${user.name}, your admin access request has been rejected. Please contact support if you have questions. - The Ranbhoomi Team`;

    await sendMail(user.email, subject, html, text);

    return res.status(200).json({ message: "Admin request rejected" });
  } catch (error) {
    return res.status(500).json({ message: `Reject request error: ${error}` });
  }
};

// getting all requests 
export const getAllUsers = async (req, res) => {
  try {
    
    const users = await User.find({ _id: { $ne: req.userId } })
                             .select("name username email role photoUrl createdAt")
                             .sort({ createdAt: -1 }); 
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: `Get all users error: ${error.message}` });
  }
};

// UPDATE USER ROLE (MASTER ONLY)
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params; 
    const { role } = req.body; 

    // Validate the new role
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified. Can only set to 'user' or 'admin'." });
    }

    // Prevent master from changing their own role via this endpoint
    if (userId === req.userId) {
       return res.status(400).json({ message: "Cannot change your own role here." });
    }

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      return res.status(404).json({ message: "User not found" });
    }
     // Prevent changing another master's role
    if (userToUpdate.role === 'master') {
       return res.status(403).json({ message: "Cannot change the role of another master account." });
    }

    userToUpdate.role = role;
    await userToUpdate.save();

     const updatedUser = await User.findById(userId).select("-password");

    return res.status(200).json({ message: `User role updated to ${role}`, user: updatedUser });
  } catch (error) {
    return res.status(500).json({ message: `Update user role error: ${error.message}` });
  }
};