use wasmtime::*;
use crate::channels;

pub fn add_channel_imports(linker: &mut Linker<()>) -> Result<(), String> {
    linker
        .func_wrap("tova", "chan_send", |ch_id: i32, value: i64| -> i32 {
            if channels::send(ch_id as u32, value) { 0 } else { -1 }
        })
        .map_err(|e| format!("failed to add chan_send: {}", e))?;

    linker
        .func_wrap("tova", "chan_receive", |ch_id: i32| -> i64 {
            channels::receive_blocking(ch_id as u32).unwrap_or(-1)
        })
        .map_err(|e| format!("failed to add chan_receive: {}", e))?;

    Ok(())
}
