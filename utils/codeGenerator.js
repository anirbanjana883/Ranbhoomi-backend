// utils/codeGenerator.js

// --- TYPE MAPPING DICTIONARY ---
const TYPE_MAP = {
    cpp: {
        int: "int",
        float: "double",
        string: "string",
        boolean: "bool",
        "int[]": "vector<int>",
        "string[]": "vector<string>",
        void: "void"
    },
    java: {
        int: "int",
        float: "double",
        string: "String",
        boolean: "boolean",
        "int[]": "int[]",
        "string[]": "String[]",
        void: "void"
    },
    python: {
        int: "int",
        float: "float",
        string: "str",
        boolean: "bool",
        "int[]": "List[int]",
        "string[]": "List[str]",
        void: "None"
    }
};

// ======================================================
// STARTER CODE GENERATORS
// (Must contain standard imports for top-to-bottom compilers)
// ======================================================

const generateCppStarter = (funcName, returnType, params) => {
    const cppReturn = TYPE_MAP.cpp[returnType] ?? "void";

    const cppParams = params.map(p => {
        const type = TYPE_MAP.cpp[p.type] ?? "auto";
        return type.includes("vector")
            ? `${type}& ${p.name}`
            : `${type} ${p.name}`;
    }).join(", ");

    return `#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n\nusing namespace std;\n\nclass Solution {\npublic:\n    ${cppReturn} ${funcName}(${cppParams}) {\n        \n    }\n};`;
};

const generateJavaStarter = (funcName, returnType, params) => {
    const javaReturn = TYPE_MAP.java[returnType] ?? "void";

    const javaParams = params.map(
        p => `${TYPE_MAP.java[p.type] ?? "Object"} ${p.name}`
    ).join(", ");

    return `import java.util.*;\n\nclass Solution {\n    public ${javaReturn} ${funcName}(${javaParams}) {\n        \n    }\n}`;
};

const generatePythonStarter = (funcName, returnType, params) => {
    const pyReturn = TYPE_MAP.python[returnType] ?? "None";

    const pyParams = params.map(
        p => `${p.name}: ${TYPE_MAP.python[p.type] ?? "Any"}`
    ).join(", ");

    return `from typing import List, Any\n\nclass Solution:\n    def ${funcName}(self, ${pyParams}) -> ${pyReturn}:\n        pass`;
};

// ======================================================
// DRIVER GENERATORS
// (Hidden Execution Engine)
// ======================================================

const generateCppDriver = (funcName, returnType, params) => {
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

const generateJavaDriver = (funcName, returnType, params) => {
    const parser = `
class Main {
    public static int[] parseIntArray(String s) {
        s = s.trim();
        if(s.startsWith("[")) s = s.substring(1);
        if(s.endsWith("]")) s = s.substring(0, s.length() - 1);
        if(s.trim().isEmpty()) return new int[0];
        String[] parts = s.split(",");
        int[] res = new int[parts.length];
        for(int i=0; i<parts.length; i++) res[i] = Integer.parseInt(parts[i].trim());
        return res;
    }

    public static String[] parseStringArray(String s) {
        s = s.trim();
        if(s.startsWith("[")) s = s.substring(1);
        if(s.endsWith("]")) s = s.substring(0, s.length() - 1);
        if(s.trim().isEmpty()) return new String[0];
        String[] parts = s.split(",");
        for(int i=0; i<parts.length; i++) {
            parts[i] = parts[i].trim().replaceAll("^\\"|\\"$|^'|'$", "");
        }
        return parts;
    }
`;

    const decl = params.map(p => {
        const type = TYPE_MAP.java[p.type] ?? "Object";
        return `${type} ${p.name};`;
    }).join("\n            ");

    const parse = params.map((p, i) => {
        if(p.type === "int") return `${p.name} = Integer.parseInt(lines.get(${i}));`;
        if(p.type === "float") return `${p.name} = Double.parseDouble(lines.get(${i}));`;
        if(p.type === "boolean") return `${p.name} = Boolean.parseBoolean(lines.get(${i}));`;
        if(p.type === "int[]") return `${p.name} = parseIntArray(lines.get(${i}));`;
        if(p.type === "string[]") return `${p.name} = parseStringArray(lines.get(${i}));`;
        if(p.type === "string") return `${p.name} = lines.get(${i});`;
        return `${p.name} = lines.get(${i});`;
    }).join("\n            ");

    const paramNames = params.map(p => p.name).join(", ");

    let exec;
    if(returnType === "void") {
        exec = `obj.${funcName}(${paramNames});`;
    } else if(returnType === "int[]" || returnType === "string[]") {
        exec = `System.out.println(java.util.Arrays.toString(obj.${funcName}(${paramNames})).replaceAll(" ", ""));`;
    } else {
        exec = `System.out.println(obj.${funcName}(${paramNames}));`;
    }

    return `${parser}\n    public static void main(String[] args) {\n        java.util.Scanner scanner = new java.util.Scanner(System.in);\n        java.util.List<String> lines = new java.util.ArrayList<>();\n        while(scanner.hasNextLine()) {\n            String line = scanner.nextLine();\n            if(!line.trim().isEmpty()) lines.add(line);\n        }\n        if(lines.size() < ${params.length}) return;\n        try {\n            Solution obj = new Solution();\n            ${decl}\n            ${parse}\n            ${exec}\n        } catch(Exception e) {\n            e.printStackTrace();\n        }\n    }\n}`;
};

const generatePythonDriver = (funcName, returnType, params) => {
    const parse = params.map((p, i) => {
        if(p.type === "string") return `${p.name} = lines[${i}]`;
        return `${p.name} = json.loads(lines[${i}])`;
    }).join("\n            ");

    const paramNames = params.map(p => p.name).join(", ");

    let exec;
    if(returnType === "void") {
        exec = `solution.${funcName}(${paramNames})`;
    } else {
        exec = `result = solution.${funcName}(${paramNames})\n            if isinstance(result, list):\n                print(json.dumps(result).replace(" ", ""))\n            elif isinstance(result, bool):\n                print(str(result).lower())\n            else:\n                print(result)`;
    }

    return `\nimport sys\nimport json\nfrom typing import *\n\nif __name__ == "__main__":\n    lines = [l.strip() for l in sys.stdin.read().splitlines() if l.strip()]\n    if len(lines) >= ${params.length}:\n        try:\n            ${parse}\n            solution = Solution()\n            ${exec}\n        except Exception as e:\n            print(f"Runtime Error: {e}", file=sys.stderr)\n`;
};

// ======================================================
// MAIN GENERATOR
// ======================================================

export const generateProblemCodes = (signature) => {
    const functionName = signature?.functionName ?? "solution";
    const returnType = signature?.returnType ?? "void";
    const parameters = signature?.parameters ?? [];

    const starterCode = [
        { language: "cpp", code: generateCppStarter(functionName, returnType, parameters) },
        { language: "java", code: generateJavaStarter(functionName, returnType, parameters) },
        { language: "python", code: generatePythonStarter(functionName, returnType, parameters) }
    ];

    const driverCode = [
        { language: "cpp", code: generateCppDriver(functionName, returnType, parameters) },
        { language: "java", code: generateJavaDriver(functionName, returnType, parameters) },
        { language: "python", code: generatePythonDriver(functionName, returnType, parameters) }
    ];

    return { starterCode, driverCode };
};