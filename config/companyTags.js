// config/companyTags.js

// List of common company tags associated with coding problems.

export const ALLOWED_COMPANY_TAGS = [
    "google",
    "facebook", // or "meta"
    "amazon",
    "apple",
    "microsoft",
    "netflix",
    "airbnb",
    "uber",
    "linkedin",
    "twitter", 
    "snapchat", 
    "tiktok", 
    "bloomberg",
    "adobe",
    "oracle",
    "salesforce",
    "cisco",
    "paypal",
    "ebay",
    "intuit",
    "yahoo",
    "vmware",
    "goldman sachs",
    "jpmorgan chase",
    "capital one",
    "atlassian",
    "spotify",
    "roblox",
    "doordash",
    "square", 
    "stripe",
    "twilio",
    "nvidia",
];

export const COMPANY_TAG_ALIASES = {
    "meta": "facebook",
    "x": "twitter",
    "snap": "snapchat",
    "bytedance": "tiktok",
    "block": "square",
};

export const normalizeCompanyTag = (tag) => {
    const lowerTag = tag.toLowerCase().trim();
    return COMPANY_TAG_ALIASES[lowerTag] || lowerTag;
};