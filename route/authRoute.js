import express from "express"
import { googleAuth, logIn, logOut, resetPassword, sendOtp, signup, verifyOtp } from "../controller/authController.js"

const authRouter = express.Router()

authRouter.post("/signup",signup)
authRouter.post("/login",logIn)
authRouter.get("/logout",logOut)
authRouter.post("/sendotp",sendOtp)
authRouter.post("/verifyotp",verifyOtp)
authRouter.post("/resetpassword",resetPassword)
authRouter.post("/googleauth",googleAuth)

export default authRouter;