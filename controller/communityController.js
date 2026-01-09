import Post from "../models/postModel.js";
import Reply from "../models/replyModel.js"; 

// CREATE A NEW POST
export const createPost = async (req, res) => {
  try {
    const { title, content, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and Content are required" });
    }

    const newPost = await Post.create({
      author: req.userId, 
      title,
      content,
      tags: tags || [], 
    });

    await newPost.populate("author", "username photoUrl");

    res.status(201).json(newPost);
  } catch (error) {
    console.error("Create Post Error:", error);
    res.status(500).json({ message: "Failed to create post" });
  }
};

// GET COMMUNITY FEED 
export const getPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, tag } = req.query;

    const query = {};
    
    if (tag) {
      query.tags = tag;
    }
    
    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 }) 
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("author", "username photoUrl") 
      .populate("commentCount"); 

    const total = await Post.countDocuments(query);

    res.status(200).json({
      posts,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error("Get Posts Error:", error);
    res.status(500).json({ message: "Failed to load feed" });
  }
};

// ADD A REPLY
export const addReply = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const newReply = await Reply.create({
      author: req.userId,
      post: postId,
      content,
    });

    await newReply.populate("author", "username photoUrl");

    res.status(201).json(newReply);
  } catch (error) {
    console.error("Add Reply Error:", error);
    res.status(500).json({ message: "Failed to post reply" });
  }
};