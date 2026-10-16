// Assuming these are stored in your shared constants file from earlier phases
import { ALLOWED_PROBLEM_TAGS, ALLOWED_COMPANY_TAGS } from "../../shared/utils/constants.js";

class TagService {
    getProblemTags() {
        // Return a sorted copy of the array
        return [...ALLOWED_PROBLEM_TAGS].sort();
    }

    getCompanyTags() {
        return [...ALLOWED_COMPANY_TAGS].sort();
    }
}

export default new TagService();