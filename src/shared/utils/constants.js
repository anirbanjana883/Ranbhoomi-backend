export const PLANS = {
    Free: { price: 0, aiLimit: 3, canHostContest: false, mockInterviews: 1, accessCompanyTags: false },
    Warrior: { price: 49900, aiLimit: 1000, canHostContest: false, mockInterviews: 5, accessCompanyTags: true },
    Gladiator: { price: 99900, aiLimit: 10000, canHostContest: true, mockInterviews: 100, accessCompanyTags: true },
};

export const LANGUAGE_IDS = {
    javascript: 93,
    python: 92,
    cpp: 54,
    c: 50,
    java: 91,
};

export const getLanguageId = (lang) => LANGUAGE_IDS[lang.toLowerCase()] || null;

export const ALLOWED_COMPANY_TAGS = ["google", "facebook", "amazon", "apple", "microsoft", "netflix", "airbnb", "uber", "linkedin", "twitter", "snapchat", "tiktok", "bloomberg", "adobe", "oracle", "salesforce", "cisco", "paypal", "ebay", "intuit", "yahoo", "vmware", "goldman sachs", "jpmorgan chase", "capital one", "atlassian", "spotify", "roblox", "doordash", "square", "stripe", "twilio", "nvidia"];
export const COMPANY_TAG_ALIASES = { meta: "facebook", x: "twitter", snap: "snapchat", bytedance: "tiktok", block: "square" };

export const normalizeCompanyTag = (tag) => {
    const lower = tag.toLowerCase().trim();
    return COMPANY_TAG_ALIASES[lower] || lower;
};

export const ALLOWED_PROBLEM_TAGS = ["array", "string", "hash-table", "linked-list", "stack", "queue", "deque", "tree", "binary-tree", "binary-search-tree", "trie", "segment-tree", "fenwick-tree", "heap", "priority-queue", "graph", "depth-first-search", "breadth-first-search", "union-find", "shortest-path", "minimum-spanning-tree", "topological-sort", "sorting", "searching", "binary-search", "two-pointers", "sliding-window", "recursion", "backtracking", "dynamic-programming", "greedy", "divide-and-conquer", "memoization", "prefix-sum", "math", "geometry", "bit-manipulation", "number-theory", "combinatorics", "probability", "string-matching", "suffix-array", "suffix-tree", "design", "simulation", "matrix", "monotonic-stack", "ordered-set", "randomized", "game-theory", "interactive", "concurrency", "database"];
export const PROBLEM_TAG_ALIASES = { dp: "dynamic-programming", bfs: "breadth-first-search", dfs: "depth-first-search", bst: "binary-search-tree", pq: "priority-queue", bit: "fenwick-tree", dsu: "union-find", mst: "minimum-spanning-tree", "topo-sort": "topological-sort", map: "hash-table", dictionary: "hash-table", "binary indexed tree": "fenwick-tree", "disjoint set union": "union-find" };

export const normalizeProblemTag = (tag) => {
    if (!tag || typeof tag !== 'string') return null;
    const lower = tag.toLowerCase().trim();
    const canonical = PROBLEM_TAG_ALIASES[lower] || lower;
    return ALLOWED_PROBLEM_TAGS.includes(canonical) ? canonical : null;
};