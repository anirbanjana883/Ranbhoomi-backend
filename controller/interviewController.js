import InterviewSession from "../models/interviewSessionModel.js";
import Problem from "../models/problemModel.js";
import { v4 as uuidV4 } from "uuid";



export const createInterviewSession = async (req, res) => {
  try {
    //  Create the session 
    const roomID = uuidV4();
    const session = new InterviewSession({
      roomID,
      participants: [req.userId], 
      status: "Scheduled",
      problem: null 
    });

    await session.save();

    //  Return the new session
    res.status(201).json(session);
  } catch (error) {
    console.error("Error creating interview session:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getInterviewSession = async (req, res) => {
  try {
    const session = await InterviewSession.findOne({
      roomID: req.params.roomID,
    }).populate("problem"); 

    if (!session) {
      return res.status(404).json({ message: "Interview session not found" });
    }

    //  Check if user is a participant
    const isParticipant = session.participants.some(
      (p) => p.toString() === req.userId.toString() // <-- FIX: Use req.userId
    );

    if (!isParticipant) {
      // If they are not in the list, add them (for 2nd user joining)
      session.participants.push(req.userId); 
      await session.save();
    }

    res.status(200).json(session);
  } catch (error) {
    console.error("Error fetching interview session:", error);
    res.status(500).json({ message: "Server error" });
  }
};