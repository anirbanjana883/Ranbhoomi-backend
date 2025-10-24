export const ALLOWED_PROBLEM_TAGS = [
    // --- Core Data Structures ---
    "array", "string", "hash-table", "linked-list", "stack", "queue", "deque",

    // --- Trees ---
    "tree", "binary-tree", "binary-search-tree", "trie", "segment-tree",
    "fenwick-tree", "heap", "priority-queue",

    // --- Graphs ---
    "graph", "depth-first-search", "breadth-first-search", "union-find",
    "shortest-path", "minimum-spanning-tree", "topological-sort",

    // --- Common Algorithms & Techniques ---
    "sorting", "searching", "binary-search", "two-pointers", "sliding-window",
    "recursion", "backtracking", "dynamic-programming", "greedy",
    "divide-and-conquer", "memoization", "prefix-sum",

    // --- Math & Number Theory ---
    "math", "geometry", "bit-manipulation", "number-theory", "combinatorics",
    "probability",

    // --- String Specific ---
    "string-matching", "suffix-array", "suffix-tree",

    // --- Other Concepts ---
    "design", "simulation", "matrix", "monotonic-stack", "ordered-set",
    "randomized", "game-theory", "interactive", "concurrency", "database",
];

// --- Mapping for Aliases/Short Names ---
export const PROBLEM_TAG_ALIASES = {
    // Common Short Names
    "dp": "dynamic-programming",
    "bfs": "breadth-first-search",
    "dfs": "depth-first-search",
    "bst": "binary-search-tree",
    "pq": "priority-queue",
    "bit": "fenwick-tree", // Binary Indexed Tree is often called BIT
    "dsu": "union-find", // Disjoint Set Union
    "mst": "minimum-spanning-tree",
    "topo-sort": "topological-sort",

    // Alternative Names
    "map": "hash-table",
    "dictionary": "hash-table",
    "binary indexed tree": "fenwick-tree",
    "disjoint set union": "union-find",

    // Add more aliases as you see fit
};

// --- Function to Normalize Tags ---
// Takes a tag (potentially an alias) and returns the canonical tag from ALLOWED_PROBLEM_TAGS
export const normalizeProblemTag = (tag) => {
    if (!tag || typeof tag !== 'string') {
        return null; // Handle invalid input
    }
    const lowerTag = tag.toLowerCase().trim();
    // Check if the input is an alias, otherwise use the input itself
    const canonicalTag = PROBLEM_TAG_ALIASES[lowerTag] || lowerTag;

   
    if (!ALLOWED_PROBLEM_TAGS.includes(canonicalTag)) {
        console.warn(`Normalized tag "${canonicalTag}" is not in ALLOWED_PROBLEM_TAGS.`);
        return null; 
    }

    return canonicalTag;
};


export const DATA_STRUCTURE_TAGS = [
    "array", "string", "hash-table", "linked-list", "stack", "queue", "deque",
    "tree", "binary-tree", "binary-search-tree", "trie", "segment-tree",
    "fenwick-tree", "heap", "priority-queue", "graph", "union-find", "matrix",
    "monotonic-stack", "ordered-set"
];
export const ALGORITHM_TAGS = [
    "sorting", "searching", "binary-search", "two-pointers", "sliding-window",
    "recursion", "backtracking", "dynamic-programming", "greedy",
    "depth-first-search", "breadth-first-search", "divide-and-conquer", "memoization",
    "prefix-sum", "string-matching", "suffix-array", "suffix-tree",
    "shortest-path", "minimum-spanning-tree", "topological-sort", "game-theory"
];