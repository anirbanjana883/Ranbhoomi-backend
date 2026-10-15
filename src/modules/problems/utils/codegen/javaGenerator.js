import { TYPE_MAP } from "./typeMap.js";

export const generateJavaStarter = (funcName, returnType, params) => {
    const javaReturn = TYPE_MAP.java[returnType] ?? "void";
    const javaParams = params.map(p => `${TYPE_MAP.java[p.type] ?? "Object"} ${p.name}`).join(", ");
    return `import java.util.*;\n\nclass Solution {\n    public ${javaReturn} ${funcName}(${javaParams}) {\n        \n    }\n}`;
};

export const generateJavaDriver = (funcName, returnType, params) => {
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
        for(int i=0; i<parts.length; i++) parts[i] = parts[i].trim().replaceAll("^\\"|\\"$|^'|'$", "");
        return parts;
    }
`;
    const decl = params.map(p => `${TYPE_MAP.java[p.type] ?? "Object"} ${p.name};`).join("\n            ");
    const parse = params.map((p, i) => {
        if(p.type === "int") return `${p.name} = Integer.parseInt(lines.get(${i}));`;
        if(p.type === "float") return `${p.name} = Double.parseDouble(lines.get(${i}));`;
        if(p.type === "boolean") return `${p.name} = Boolean.parseBoolean(lines.get(${i}));`;
        if(p.type === "int[]") return `${p.name} = parseIntArray(lines.get(${i}));`;
        if(p.type === "string[]") return `${p.name} = parseStringArray(lines.get(${i}));`;
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