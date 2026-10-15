export const TYPE_MAP = {
    cpp: { int: "int", float: "double", string: "string", boolean: "bool", "int[]": "vector<int>", "string[]": "vector<string>", void: "void" },
    java: { int: "int", float: "double", string: "String", boolean: "boolean", "int[]": "int[]", "string[]": "String[]", void: "void" },
    python: { int: "int", float: "float", string: "str", boolean: "bool", "int[]": "List[int]", "string[]": "List[str]", void: "None" }
};