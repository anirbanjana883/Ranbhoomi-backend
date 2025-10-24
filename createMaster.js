import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "./models/userModel.js";

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const createMaster = async () => {
  try {
    const email = process.env.MASTER_EMAIL;
    const password = process.env.MASTER_PASSWORD;

    const existing = await User.findOne({ email });
    if (existing) {
      console.log("Master account already exists");
      process.exit();
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const masterUser = await User.create({
      name: "Master Account",
      username: "masteradmin",
      email,
      password: hashedPassword,
      role: "master",
    });

    console.log("Master account created successfully:", masterUser);
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

createMaster();
