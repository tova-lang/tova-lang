/**
 * Generate WASM binary modules with host imports for channel operations.
 * Producer sends values through a channel, Consumer receives and sums them.
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

const I32 = 0x7F;
const I64 = 0x7E;
const FUNC_TYPE = 0x60;

/**
 * Producer: sends values 0..count-1 to channel, returns count
 * Exports: producer(channel_id: i32, count: i64) -> i64
 * Imports: tova.chan_send(ch: i32, val: i64) -> i32
 */
function generateProducerModule() {
    const bytes = [];
    // WASM magic + version
    bytes.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00);

    // Type section: 2 types
    //   type0 = chan_send(i32, i64) -> i32
    //   type1 = producer(i32, i64) -> i64
    const typeBody = [
        2,                          // 2 types
        FUNC_TYPE, 2, I32, I64, 1, I32,  // type0: (i32, i64) -> i32
        FUNC_TYPE, 2, I32, I64, 1, I64,  // type1: (i32, i64) -> i64
    ];
    bytes.push(...encodeSection(1, typeBody));

    // Import section: 1 import — tova.chan_send as func 0, type 0
    const importBody = [
        1,                                  // 1 import
        ...encodeString("tova"),
        ...encodeString("chan_send"),
        0x00, 0,                            // kind=func, type index 0
    ];
    bytes.push(...encodeSection(2, importBody));

    // Function section: 1 function (func index 1) using type index 1
    bytes.push(...encodeSection(3, [1, 1]));

    // Export section: export "producer" as func 1
    const exportBody = [
        1,                                  // 1 export
        ...encodeString("producer"),
        0x00, 1,                            // kind=func, func index 1
    ];
    bytes.push(...encodeSection(7, exportBody));

    // Code section: producer function body
    // Params: local 0 = ch_id (i32), local 1 = count (i64)
    // Locals: local 2 = i (i64), initialized to 0
    //
    // Algorithm:
    //   block
    //     loop
    //       br_if 1 (i >= count)      -- exit block if done
    //       call chan_send(ch_id, i)
    //       drop result
    //       i = i + 1
    //       br 0                       -- continue loop
    //     end loop
    //   end block
    //   return count
    const funcBody = [
        1,                              // 1 local declaration
        1, I64,                         // 1x i64 (local 2 = i)

        // block $break
        0x02, 0x40,
          // loop $continue
          0x03, 0x40,
            // if i >= count: br_if 1
            0x20, 0x02,                 // local.get 2 (i)
            0x20, 0x01,                 // local.get 1 (count)
            0x59,                       // i64.ge_s  (IMPORTANT: 0x59, NOT 0x53)
            0x0D, 0x01,                 // br_if 1 (break out of block)

            // chan_send(ch_id, i)
            0x20, 0x00,                 // local.get 0 (ch_id)
            0x20, 0x02,                 // local.get 2 (i)
            0x10, 0x00,                 // call func 0 (chan_send)
            0x1A,                       // drop (discard i32 result)

            // i = i + 1
            0x20, 0x02,                 // local.get 2 (i)
            0x42, 0x01,                 // i64.const 1
            0x7C,                       // i64.add
            0x21, 0x02,                 // local.set 2 (i)

            // continue loop
            0x0C, 0x00,                 // br 0
          0x0B,                         // end loop
        0x0B,                           // end block

        // return count
        0x20, 0x01,                     // local.get 1 (count)
        0x0B,                           // end function
    ];

    bytes.push(...encodeSection(10, [1, ...uleb128(funcBody.length), ...funcBody]));
    return new Uint8Array(bytes);
}

/**
 * Consumer: receives count values from channel, returns their sum
 * Exports: consumer(channel_id: i32, count: i64) -> i64
 * Imports: tova.chan_receive(ch: i32) -> i64
 *   Returns the received value, or i64::MIN (0x8000000000000000) when closed
 */
function generateConsumerModule() {
    const bytes = [];
    // WASM magic + version
    bytes.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00);

    // Type section: 2 types
    //   type0 = chan_receive(i32) -> i64
    //   type1 = consumer(i32, i64) -> i64
    const typeBody = [
        2,                          // 2 types
        FUNC_TYPE, 1, I32, 1, I64,       // type0: (i32) -> i64
        FUNC_TYPE, 2, I32, I64, 1, I64,  // type1: (i32, i64) -> i64
    ];
    bytes.push(...encodeSection(1, typeBody));

    // Import section: 1 import — tova.chan_receive as func 0, type 0
    const importBody = [
        1,                                  // 1 import
        ...encodeString("tova"),
        ...encodeString("chan_receive"),
        0x00, 0,                            // kind=func, type index 0
    ];
    bytes.push(...encodeSection(2, importBody));

    // Function section: 1 function (func index 1) using type index 1
    bytes.push(...encodeSection(3, [1, 1]));

    // Export section: export "consumer" as func 1
    const exportBody = [
        1,                                  // 1 export
        ...encodeString("consumer"),
        0x00, 1,                            // kind=func, func index 1
    ];
    bytes.push(...encodeSection(7, exportBody));

    // Code section: consumer function body
    // Params: local 0 = ch_id (i32), local 1 = count (i64)
    // Locals: local 2 = sum (i64), local 3 = i (i64)
    //
    // Algorithm:
    //   block
    //     loop
    //       br_if 1 (i >= count)
    //       sum = sum + chan_receive(ch_id)
    //       i = i + 1
    //       br 0
    //     end loop
    //   end block
    //   return sum
    const funcBody = [
        2,                              // 2 local declarations
        1, I64,                         // 1x i64 (local 2 = sum)
        1, I64,                         // 1x i64 (local 3 = i)

        // block $break
        0x02, 0x40,
          // loop $continue
          0x03, 0x40,
            // if i >= count: br_if 1
            0x20, 0x03,                 // local.get 3 (i)
            0x20, 0x01,                 // local.get 1 (count)
            0x59,                       // i64.ge_s  (0x59)
            0x0D, 0x01,                 // br_if 1

            // sum = sum + chan_receive(ch_id)
            0x20, 0x02,                 // local.get 2 (sum)
            0x20, 0x00,                 // local.get 0 (ch_id)
            0x10, 0x00,                 // call func 0 (chan_receive)
            0x7C,                       // i64.add
            0x21, 0x02,                 // local.set 2 (sum)

            // i = i + 1
            0x20, 0x03,                 // local.get 3 (i)
            0x42, 0x01,                 // i64.const 1
            0x7C,                       // i64.add
            0x21, 0x03,                 // local.set 3 (i)

            // continue loop
            0x0C, 0x00,                 // br 0
          0x0B,                         // end loop
        0x0B,                           // end block

        // return sum
        0x20, 0x02,                     // local.get 2 (sum)
        0x0B,                           // end function
    ];

    bytes.push(...encodeSection(10, [1, ...uleb128(funcBody.length), ...funcBody]));
    return new Uint8Array(bytes);
}

module.exports = { generateProducerModule, generateConsumerModule };
