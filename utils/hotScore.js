export const calculateHotScore = (upvotes, downvotes, createdAt) => {
    // If net score is negative, we keep it at 0 so bad posts don't break sorting math
    const score = Math.max(upvotes - downvotes, 0); 
    
    const hoursSincePost = (Date.now() - new Date(createdAt).getTime()) / 3600000;
    
    // HackerNews gravity formula (G=1.5)
    return score / Math.pow(Math.max(hoursSincePost, 0) + 2, 1.5);
};