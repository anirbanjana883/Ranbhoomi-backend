import User from "./user.model.js";
import AdminRequest from "./adminRequest.model.js";

class UserRepository {
  async findByEmail(email) {
    return User.findOne({ email });
  }

  async findByUsername(username) {
    return User.findOne({ username });
  }

  async findById(id) {
    return User.findById(id);
  }

  async findByIdWithoutPassword(id) {
    return User.findById(id).select("-password");
  }

  async createUser(userData) {
    return User.create(userData);
  }

  async save(userDoc) {
    return userDoc.save();
  }

  async getAllUsers(excludeUserId) {
    return User.find({ _id: { $ne: excludeUserId } })
      .select("name username email role photoUrl createdAt")
      .sort({ createdAt: -1 });
  }

  async findPendingRequest(userId) {
    return AdminRequest.findOne({ userId, status: "pending" });
  }

  async createAdminRequest(data) {
    return AdminRequest.create(data);
  }

  async findAdminRequestById(id) {
    return AdminRequest.findById(id);
  }

  async getAllPendingRequests() {
    return AdminRequest.find({ status: "pending" }).populate("userId", "name email role");
  }

  async saveAdminRequest(requestDoc) {
    return requestDoc.save();
  }
}

export default new UserRepository();