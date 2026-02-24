import { Lexer } from "./src/lexer/lexer.js";
import { Parser } from "./src/parser/parser.js";
import { CodeGenerator } from "./src/codegen/codegen.js";

function compile(src) {
  const l = new Lexer(src); const t = l.tokenize();
  const p = new Parser(t); const a = p.parse();
  return new CodeGenerator(a).generate();
}

// Test 1: basic server withLock/fetch
const r = compile('server { fn hello() { "ok" } }');
const lines = r.server.split("\n");
for (const line of lines) {
  if (line.includes("withLock") || line.includes("__locks") || line.includes("__getLock")) {
    console.log("LOCK:", line.trim());
  }
}
for (const line of lines) {
  if (line.includes("__errorResponse(")) {
    console.log("ERR:", line.trim());
  }
}
for (const line of lines) {
  if (line.includes("fetch:") || line.includes("__idempotent")) {
    console.log("FETCH:", line.trim());
  }
}

// Test 2: validation
console.log("\n--- VALIDATION ---");
const r2 = compile('server { fn create_user(name: String, age: Int) { name } }');
for (const line of r2.server.split("\n")) {
  if (line.includes("400") || line.includes("VALIDATION") || line.includes("validationErrors") || line.includes("__errorResponse")) {
    console.log("VAL:", line.trim());
  }
}

// Test 3: body too large / 413
console.log("\n--- BODY TOO LARGE ---");
const r3 = compile(`
  server {
    cors { origins: ["*"] }
    fn create(name) { name }
    route POST "/api/items" => create
  }
`);
for (const line of r3.server.split("\n")) {
  if (line.includes("413") || line.includes("BODY_TOO_LARGE") || line.includes("PAYLOAD_TOO_LARGE")) {
    console.log("413:", line.trim());
  }
}

// Test 4: compression fetch
console.log("\n--- COMPRESSION ---");
const r4 = compile(`
  server {
    compression { min_size: 1024 }
    fn hello() { "world" }
  }
`);
for (const line of r4.server.split("\n")) {
  if (line.includes("fetch:") || line.includes("__compress") || line.includes("__fetchHandler") || line.includes("__idempotent")) {
    console.log("COMP:", line.trim());
  }
}

// Test 5: auth 401
console.log("\n--- AUTH 401 ---");
const r5 = compile(`
  server {
    auth { type: "jwt", secret: "secret" }
    ws {
      on_message fn(ws, msg) { print(msg) }
    }
  }
`);
for (const line of r5.server.split("\n")) {
  if (line.includes("401") || line.includes("AUTH_REQUIRED")) {
    console.log("AUTH:", line.trim());
  }
}

// Test 6: CSRF 403
console.log("\n--- CSRF 403 ---");
const r6 = compile(`
  server {
    auth { type: "jwt", secret: "test-secret" }
    fn hello() { "world" }
  }
`);
for (const line of r6.server.split("\n")) {
  if (line.includes("403") || line.includes("CSRF")) {
    console.log("CSRF:", line.trim());
  }
}
