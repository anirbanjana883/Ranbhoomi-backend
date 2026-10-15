import { generateCppStarter, generateCppDriver } from "./codegen/cppGenerator.js";
import { generateJavaStarter, generateJavaDriver } from "./codegen/javaGenerator.js";
import { generatePythonStarter, generatePythonDriver } from "./codegen/pythonGenerator.js";

export const generateProblemCodes = (signature) => {
    const functionName = signature?.functionName ?? "solution";
    const returnType = signature?.returnType ?? "void";
    const parameters = signature?.parameters ?? [];
    return {
        starterCode: [
            { language: "cpp", code: generateCppStarter(functionName, returnType, parameters) },
            { language: "java", code: generateJavaStarter(functionName, returnType, parameters) },
            { language: "python", code: generatePythonStarter(functionName, returnType, parameters) }
        ],
        driverCode: [
            { language: "cpp", code: generateCppDriver(functionName, returnType, parameters) },
            { language: "java", code: generateJavaDriver(functionName, returnType, parameters) },
            { language: "python", code: generatePythonDriver(functionName, returnType, parameters) }
        ]
    };
};