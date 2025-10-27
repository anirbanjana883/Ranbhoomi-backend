
// Common language IDs for Judge0 CE
export const LANGUAGE_IDS = {
  "javascript": 93, // (Node.js 18.15.0)
  "python": 92,     // (Python 3.11.2)
  "cpp": 54,        // (GCC 9.2.0) - C++17
  "c": 50,          // (GCC 9.2.0) - C
  "java": 91,       // (JDK 17.0.6)
};

// Helper to get ID
export const getLanguageId = (langName) => {
    return LANGUAGE_IDS[langName.toLowerCase()] || null;
}