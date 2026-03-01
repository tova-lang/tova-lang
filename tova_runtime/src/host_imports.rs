use wasmtime::*;
use crate::channels;

/// Sentinel value returned by chan_receive when channel is closed/empty.
/// Using i64::MIN avoids collision with legitimate -1 values.
pub const CHAN_CLOSED_SENTINEL: i64 = i64::MIN; // 0x8000000000000000

pub fn add_channel_imports(linker: &mut Linker<()>) -> Result<(), String> {
    linker
        .func_wrap("tova", "chan_send", |ch_id: i32, value: i64| -> i32 {
            match channels::send(ch_id as u64, value) {
                Ok(true) => 0,
                Ok(false) => -1,
                Err(_) => -1,  // closed channel
            }
        })
        .map_err(|e| format!("failed to add chan_send: {}", e))?;

    linker
        .func_wrap("tova", "chan_receive", |ch_id: i32| -> i64 {
            channels::receive_blocking(ch_id as u64).unwrap_or(CHAN_CLOSED_SENTINEL)
        })
        .map_err(|e| format!("failed to add chan_receive: {}", e))?;

    Ok(())
}
