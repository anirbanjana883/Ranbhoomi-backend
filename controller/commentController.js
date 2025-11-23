import Comment from "../models/commentModel.js";

// Get all comments for a problem
export const getComments = async (req, res) => {
  try {
    const { slug } = req.params;
    const comments = await Comment.find({ problemSlug: slug })
      .populate("user", "name username photoUrl") // Get user details
      .sort({ createdAt: -1 }); // Newest first

    res.status(200).json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Post a comment
export const addComment = async (req, res) => {
  try {
    const { slug } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    const newComment = new Comment({
      user: req.userId, 
      problemSlug: slug,
      text: text,
    });

    await newComment.save();
    
    await newComment.populate("user", "name username photoUrl");

    res.status(201).json(newComment);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete a comment
export const deleteComment = async (req, res) => {
    try {
        const { id } = req.params;
        const comment = await Comment.findById(id);

        if(!comment) return res.status(404).json({message: "Comment not found"});

        if(comment.user.toString() !== req.userId) {
            return res.status(403).json({message: "Not authorized to delete this comment"});
        }

        await comment.deleteOne();
        res.status(200).json({message: "Comment deleted"});

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
}