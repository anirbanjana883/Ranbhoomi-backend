# System Documentation: Auto-Compiler & Code Generation Engine

## 1. System Overview

The Auto-Compiler & Code Generation Engine is a core sub-system of the Ranbhoomi Competitive Programming platform. In modern coding platforms (like LeetCode or HackerRank), users are not expected to write standard I/O boilerplate (e.g., `cin`, `Scanner`, `sys.stdin`). They simply complete a target function or class.

This module acts as a **Domain Specific Language (DSL) Compiler**. It takes a standardized problem signature (function name, parameters, return type) and dynamically generates:

- **Starter Code**: The user-facing boilerplate (e.g., `class Solution { ... }`).
- **Hidden Driver Code**: The backend execution wrapper that securely parses stdin, invokes the user's function, and formats the output to stdout for the Judge0 execution engine.

---

## ⚠️ Current Limitations

- **Limited Data Types**  
  Only supports: `int`, `float`, `string`, `boolean`, `int[]`, `string[]`.  
  Complex types like `int[][]`, `Linked List`, `Binary Tree`, and `Graph` are not yet supported.

- **Manual C++ Parsing**  
  C++ driver currently uses custom parsers (e.g., `parseIntArray`) which may not scale well for complex nested inputs.

- **Judge0 Dependency**  
  Code execution relies on the Judge0 API, so performance and availability depend on the external service.

- **Limited Language Support**  
  Currently supports only **C++**, **Java**, and **Python**.

- **Simplified Input Format**  
  Test cases use a simple line-based input model. Complex structured inputs are not fully supported yet.

- **Static Worker Scaling**  
  Worker services are currently fixed and not dynamically autoscaled.

These limitations are intentional for the current version and will be addressed in future iterations.


## 2. Functional Requirements

- **Multi-Language Support**: Generate syntactically correct code for C++, Java, and Python 3.
- **Dynamic Type Mapping**: Automatically translate universal types (`int`, `int[]`, `string`, `boolean`) into language-specific constructs (e.g., `vector<int>`, `List[str]`).
- **Robust I/O Parsing**: Handle edge cases in competitive programming inputs, such as nested arrays, trailing spaces, and bracketed comma-separated strings (e.g., `[1, 2, 3]`).
- **Execution Isolation**: Ensure the generated driver code does not conflict with user-submitted imports or namespaces.
- **Deterministic Output Formatting**: Format outputs uniformly across all languages (e.g., ensuring booleans output as `true`/`false` in Python, or arrays print without spaces) to allow exact string matching by the Judge service.

---

## 3. Non-Functional Requirements

- **Scalability**: The generation logic must be completely stateless, allowing it to run horizontally across any number of Node.js instances.
- **Performance**: Code generation must execute in $< 10$ milliseconds to ensure snappy Admin UI responses when forging problems.
- **Reliability**: The generator must produce 100% compilable code under all valid signature combinations.
- **Concurrency Considerations**: Generation is CPU-bound but lightweight; it must not block the Node.js event loop during high-throughput problem ingestion.

---

## 4. Data Model Design

The Code Generation Engine primarily interacts with the `Problem` collection in MongoDB.

### MongoDB Schema (Problem):

```javascript
{
  _id: ObjectId,
  title: String,
  signature: {
    functionName: String,
    returnType: String,
    parameters: [{ name: String, type: String }]
  },
  starterCode: {
    cpp: String,
    java: String,
    python: String
  },
  driverCode: {
    cpp: String,
    java: String,
    python: String
  }
}
```

### Design Decisions:

- **Write-Time Generation**: `starterCode` and `driverCode` are generated and stored in the database at the time of problem creation/update by the Admin. They are not generated on the fly when a user opens a problem.
- **Reason**: Reduces CPU load on the backend during massive contest traffic. It converts a runtime compute cost into a one-time storage cost.

---

## 5. API Design

### 1. Forge Problem (Admin Only)

- **Endpoint**: `POST /api/v1/admin/problems`
- **Description**: Accepts problem metadata and signature, triggers the Code Generator, and saves the complete problem document.

**Request Body:**

```json
{
  "title": "Two Sum",
  "signature": {
    "functionName": "twoSum",
    "returnType": "int[]",
    "parameters": [
      { "name": "nums", "type": "int[]" },
      { "name": "target", "type": "int" }
    ]
  }
}
```

**Response**: `201 Created` (Returns saved problem).

---

### 2. Get Problem Boilerplate (User)

- **Endpoint**: `GET /api/v1/problems/:id/boilerplate`
- **Description**: Fetches the pre-generated `starterCode` for the requested problem.

**Response**: `200 OK`

```json
{ "cpp": "...", "java": "...", "python": "..." }
```

---

## 6. System Flow

The lifecycle of code generation and execution is divided into two phases: **Forge Phase (Admin)** and **Execution Phase (User)**.

### Phase 1: Problem Forging (Admin)

```
[Admin UI] --> (POST /problems) --> [Node.js Backend]
                                         |
                                         v
                              [CodeGenerator Module]
                                 - Maps Types
                                 - Injects C++ Headers
                                 - Fully Qualifies Java Classes
                                 - Generates Python JSON parsers
                                         |
                                         v
                                   [MongoDB] (Saves Starter + Driver)
```

### Phase 2: User Submission Execution

```
[User IDE] --> (Submits Code) --> [Node.js Backend]
                                         |
                                         v
                                  [MongoDB] (Fetches Driver Code)
                                         |
                                         v
                             [Concatenation Engine]
                          (User Code + \n + Driver Code)
                                         |
                                         v
                                         |
                                         v
                                 [Judge0 / BullMQ]
```

---

## 7. Performance Optimization

- **Write-Time Precomputation**: As mentioned, driver and starter codes are generated exactly once during problem creation.
- **Memory Efficiency**: String interpolations and array mapping logic are used instead of heavy AST (Abstract Syntax Tree) libraries to keep memory overhead near zero.
- **Regex / Parsing Offload**: The generated driver code offloads input parsing to the Judge environment's CPU (e.g., using C++ `stringstream` or Python `json.loads`) rather than making the Node.js backend parse and pass arguments.

---

## 8. Fault Tolerance

- **Missing Signature Fallbacks**: The generator safely defaults to `void` return types and generic object handlers if invalid types are passed by the Admin.
- **Language-Specific Protections (The "Java Import" Problem)**: The Java driver explicitly uses Fully Qualified Class Names (e.g., `java.util.Scanner` instead of `import java.util.*;`). This prevents fatal compilation errors that occur if imports are injected below user-defined code during file concatenation.
- **C++ Compilation Order**: Standard libraries (e.g., `<vector>`) are injected into the User Starter Code rather than just the driver, ensuring the top-to-bottom C++ compiler does not fail on the user's `class Solution`.

---

## 9. Consistency Model

- **Strong Consistency (Problem Creation)**: The generation of code and its database insertion operate within a highly consistent paradigm. A problem cannot be published without valid driver code.
- **Immutability Strategy**: Once a problem is active in a contest, its signature (and consequently its driver code) should be treated as immutable. If an update is required, the problem record is locked, updated, and re-generated to prevent race conditions where users fetch an outdated starter code but are evaluated against a newly generated driver.

---

## 10. Security Considerations

- **Namespace Collisions**: The driver code encapsulates its execution logic (e.g., wrapping in `class Main` for Java, or `if __name__ == "__main__":` in Python) to prevent users from accidentally or maliciously overriding driver execution variables.
- **Input Sanitization (Admin)**: Function names and parameter names are strictly validated against regex `^[a-zA-Z_][a-zA-Z0-9_]*$` to prevent code injection via malicious parameter naming during problem forging.
- **Stderr Separation**: The driver explicitly catches execution exceptions and prints them to stderr (e.g., `cerr` in C++, `sys.stderr` in Python) to prevent standard output pollution, ensuring the Judge Worker strictly separates runtime errors from logic output.

---

## 11. Trade-offs

### String Interpolation vs. AST Manipulation

- **Trade-off**: We used Template Literals (String Interpolation) instead of full Abstract Syntax Tree (AST) generation.
- **Reason**: ASTs are incredibly complex to maintain across three different languages. Template literals are vastly faster, highly readable, and perfectly sufficient for generating predictable I/O wrappers.

### Concatenation vs. Multi-File Compilation

- **Trade-off**: We append the driver code directly to the bottom of the user's file instead of compiling them as separate linked files.
- **Reason**: Greatly simplifies the payload sent to Judge0 (requiring only a single `source_code` string) and speeds up compilation time inside the sandbox.

---

## 12. Future Improvements

- **Custom Judge Images**: Migrating from standard Judge0 to custom Docker images with pre-compiled parsing libraries (e.g., `#include "RanbhoomiIO.h"`). This would completely remove the need to append parsing logic to every submission, saving bandwidth and compilation time.
- **WASM Client-Side Execution**: Compiling the generated C++ driver code into WebAssembly (WASM) to allow users to execute test cases locally in their browser without pinging the backend, reducing server costs by up to 80% for "Run" actions.
- **Expanded Language DSL**: Adding generators for Rust, Go, and JavaScript (Node), which require specialized memory management and async/await driver wrappers.