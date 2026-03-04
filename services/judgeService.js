import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const JUDGE0_URL = `https://${process.env.JUDGE0_API_HOST}`;
const HEADERS = {
    'x-rapidapi-key': process.env.JUDGE0_API_KEY,
    'x-rapidapi-host': process.env.JUDGE0_API_HOST,
    'Content-Type': 'application/json'
};

export const formatSubmissions = (code, languageId, testCases) => {
    const encodedCode = Buffer.from(code).toString('base64');
    return testCases.map(tc => ({
        source_code: encodedCode,
        language_id: languageId,
        stdin: Buffer.from(tc.input || "").toString('base64'),
        expected_output: Buffer.from(tc.expectedOutput || "").toString('base64'),
    }));
};

export const submitToJudge0 = async (submissions) => {
    const response = await axios.post(
        `${JUDGE0_URL}/submissions/batch?base64_encoded=true`,
        { submissions },
        { headers: HEADERS, timeout: 5000 }
    );
    
    if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Invalid response from Judge0 on submission");
    }
    return response.data.map(s => s.token);
};

// checks Judge0 exactly ONCE and returns.
export const pollJudge0Batch = async (tokens) => {
    const tokenString = tokens.join(",");
    
    const response = await axios.get(
        `${JUDGE0_URL}/submissions/batch`,
        {
            params: {
                tokens: tokenString,
                base64_encoded: "true",
                fields: "token,status,stdout,stderr,compile_output,time,memory"
            },
            headers: HEADERS,
            timeout: 5000
        }
    );
    
    return response.data.submissions;
};