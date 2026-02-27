/**
 * Generate WASM binary modules for testing the Wasmtime executor.
 * Uses manual binary encoding (LEB128, WASM section format) — no external tools needed.
 */

function uleb128(value) {
    const r = [];
    do {
        let b = value & 0x7F;
        value >>>= 7;
        if (value !== 0) b |= 0x80;
        r.push(b);
    } while (value !== 0);
    return r;
}

function encodeSection(id, contents) {
    return [id, ...uleb128(contents.length), ...contents];
}

function encodeString(s) {
    const bytes = new TextEncoder().encode(s);
    return [...uleb128(bytes.length), ...bytes];
}

const I64 = 0x7E;
const FUNC_TYPE = 0x60;

/**
 * Generate a WASM module exporting `add(i64, i64) -> i64`
 */
function generateAddModule() {
    const bytes = [];
    // WASM magic number + version
    bytes.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00);
    // Type section: 1 type = (i64, i64) -> i64
    const typeBody = [1, FUNC_TYPE, 2, I64, I64, 1, I64];
    bytes.push(...encodeSection(1, typeBody));
    // Function section: 1 function using type index 0
    bytes.push(...encodeSection(3, [1, 0]));
    // Export section: export "add" as function index 0
    const exportBody = [1, ...encodeString("add"), 0x00, 0];
    bytes.push(...encodeSection(7, exportBody));
    // Code section: function body = local.get 0, local.get 1, i64.add, end
    const funcBody = [0, 0x20, 0x00, 0x20, 0x01, 0x7C, 0x0B];
    bytes.push(...encodeSection(10, [1, ...uleb128(funcBody.length), ...funcBody]));
    return new Uint8Array(bytes);
}

/**
 * Generate a WASM module exporting `fib(i64) -> i64` (iterative fibonacci)
 */
function generateFibModule() {
    const bytes = [];
    // WASM magic number + version
    bytes.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00);
    // Type section: 1 type = (i64) -> i64
    const typeBody = [1, FUNC_TYPE, 1, I64, 1, I64];
    bytes.push(...encodeSection(1, typeBody));
    // Function section: 1 function using type index 0
    bytes.push(...encodeSection(3, [1, 0]));
    // Export section: export "fib" as function index 0
    const exportBody = [1, ...encodeString("fib"), 0x00, 0];
    bytes.push(...encodeSection(7, exportBody));
    // Code section: iterative fibonacci
    // locals: $a (i64), $b (i64), $i (i64)
    // $a = 0 (param 0 default? no, we set it)
    // Algorithm:
    //   local $a: i64 = 0  (but we use $1=prev, $2=curr, $3=counter)
    //   Actually: param $n = local 0
    //   local $prev = local 1 (init 0)
    //   local $curr = local 2 (init 1)
    //   local $i = local 3 (init 0)
    //   loop:
    //     if $i >= $n: break
    //     $temp = $prev + $curr
    //     $prev = $curr
    //     $curr = $temp
    //     $i = $i + 1
    //     br loop
    //   return $prev  (for fib(0)=0, fib(1)=1, fib(2)=1, etc.)
    //
    // Wait — let's be precise about what fib(n) means:
    //   fib(0) = 0, fib(1) = 1, fib(2) = 1, fib(3) = 2, ..., fib(10) = 55
    //   Using: prev=0, curr=1, iterate n times, return prev
    //   After 0 iterations: prev=0 → fib(0)=0
    //   After 1 iteration: prev=1, curr=1 → fib(1)=1
    //   After 2 iterations: prev=1, curr=2 → fib(2)=1
    //   After 10 iterations: prev=55 → fib(10)=55 ✓
    //
    // WASM bytecode for the function body:
    const wrappedFuncBody = [
        // 3 locals, each i64
        3,                          // 3 local declarations
        1, I64,                     // 1x i64 (local 1 = prev, starts at 0)
        1, I64,                     // 1x i64 (local 2 = curr)
        1, I64,                     // 1x i64 (local 3 = i, counter)

        // curr = 1
        0x42, 0x01,                 // i64.const 1
        0x21, 0x02,                 // local.set 2 (curr = 1)

        // block $break
        0x02, 0x40,                 // block (void)
          // loop $continue
          0x03, 0x40,              // loop (void)
            // if i >= n, break
            0x20, 0x03,            // local.get 3 (i)
            0x20, 0x00,            // local.get 0 (n)
            0x59,                  // i64.ge_s
            0x0D, 0x01,            // br_if 1 (break out of block)

            // temp = prev + curr (left on stack)
            0x20, 0x01,            // local.get 1 (prev)
            0x20, 0x02,            // local.get 2 (curr)
            0x7C,                  // i64.add

            // prev = curr
            0x20, 0x02,            // local.get 2 (curr)
            0x21, 0x01,            // local.set 1 (prev = curr)

            // curr = temp (from stack)
            0x21, 0x02,            // local.set 2 (curr = temp)

            // i = i + 1
            0x20, 0x03,            // local.get 3 (i)
            0x42, 0x01,            // i64.const 1
            0x7C,                  // i64.add
            0x21, 0x03,            // local.set 3 (i = i + 1)

            // continue loop
            0x0C, 0x00,            // br 0 (continue loop)
          0x0B,                    // end loop
        0x0B,                      // end block

        // return prev
        0x20, 0x01,                // local.get 1 (prev)
        0x0B,                      // end function
    ];
    bytes.push(...encodeSection(10, [1, ...uleb128(wrappedFuncBody.length), ...wrappedFuncBody]));
    return new Uint8Array(bytes);
}

module.exports = { generateAddModule, generateFibModule };
