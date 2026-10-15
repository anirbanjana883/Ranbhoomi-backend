import { TYPE_MAP } from "./typeMap.js";

export const generateCppStarter = (funcName, returnType, params) => {
    const cppReturn = TYPE_MAP.cpp[returnType] ?? "void";
    const cppParams = params.map(p => {
        const type = TYPE_MAP.cpp[p.type] ?? "auto";
        return type.includes("vector") ? `${type}& ${p.name}` : `${type} ${p.name}`;
    }).join(", ");
    return `#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n\nusing namespace std;\n\nclass Solution {\npublic:\n    ${cppReturn} ${funcName}(${cppParams}) {\n        \n    }\n};`;
};

export const generateCppDriver = (funcName, returnType, params) => {
    const parser = `
#include <sstream>

vector<int> parseIntArray(string s) {
    vector<int> res;
    if(s.empty()) return res;
    if(s.front() == '[') s.erase(0,1);
    if(!s.empty() && s.back() == ']') s.pop_back();
    replace(s.begin(), s.end(), ',', ' ');
    stringstream ss(s);
    int x;
    while(ss >> x) res.push_back(x);
    return res;
}

vector<string> parseStringArray(string s) {
    vector<string> res;
    if(s.empty()) return res;
    if(s.front() == '[') s.erase(0,1);
    if(!s.empty() && s.back() == ']') s.pop_back();
    stringstream ss(s);
    string item;
    while(getline(ss, item, ',')) {
        item.erase(remove(item.begin(), item.end(), '"'), item.end());
        item.erase(remove(item.begin(), item.end(), '\\''), item.end());
        size_t start = item.find_first_not_of(" ");
        if(start != string::npos) {
            size_t end = item.find_last_not_of(" ");
            res.push_back(item.substr(start, end - start + 1));
        }
    }
    return res;
}
`;
    const parseLogic = params.map((p, i) => {
        if(p.type === "int") return `int ${p.name} = stoi(lines[${i}]);`;
        if(p.type === "float") return `double ${p.name} = stod(lines[${i}]);`;
        if(p.type === "boolean") return `bool ${p.name} = (lines[${i}] == "true" || lines[${i}] == "1");`;
        if(p.type === "int[]") return `vector<int> ${p.name} = parseIntArray(lines[${i}]);`;
        if(p.type === "string[]") return `vector<string> ${p.name} = parseStringArray(lines[${i}]);`;
        if(p.type === "string") return `string ${p.name} = lines[${i}];`;
        return `// unsupported type`;
    }).join("\n        ");
    const paramNames = params.map(p => p.name).join(", ");
    const cppReturn = TYPE_MAP.cpp[returnType] ?? "void";
    let exec;
    if(cppReturn === "void") {
        exec = `obj.${funcName}(${paramNames});`;
    } else if(returnType === "int[]" || returnType === "string[]") {
        exec = `${cppReturn} result = obj.${funcName}(${paramNames});\n        cout << "[";\n        for(size_t i = 0; i < result.size(); i++) cout << result[i] << (i == result.size()-1 ? "" : ",");\n        cout << "]" << endl;`;
    } else if(returnType === "boolean") {
        exec = `bool result = obj.${funcName}(${paramNames});\n        cout << (result ? "true" : "false") << endl;`;
    } else {
        exec = `${cppReturn} result = obj.${funcName}(${paramNames});\n        cout << result << endl;`;
    }
    return `${parser}\nint main() {\n    string line;\n    vector<string> lines;\n    while(getline(cin, line)) {\n        if(!line.empty()) lines.push_back(line);\n    }\n    if(lines.size() < ${params.length}) return 0;\n    try {\n        ${parseLogic}\n        Solution obj;\n        ${exec}\n    } catch(exception &e) {\n        cerr << e.what() << endl;\n    }\n    return 0;\n}`;
};