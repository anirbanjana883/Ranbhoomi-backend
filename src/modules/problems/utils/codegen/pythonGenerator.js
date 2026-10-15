import { TYPE_MAP } from "./typeMap.js";

export const generatePythonStarter = (funcName, returnType, params) => {
    const pyReturn = TYPE_MAP.python[returnType] ?? "None";
    const pyParams = params.map(p => `${p.name}: ${TYPE_MAP.python[p.type] ?? "Any"}`).join(", ");
    return `from typing import List, Any\n\nclass Solution:\n    def ${funcName}(self, ${pyParams}) -> ${pyReturn}:\n        pass`;
};

export const generatePythonDriver = (funcName, returnType, params) => {
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