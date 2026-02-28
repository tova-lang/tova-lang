mod scheduler;
mod executor;
mod channels;
mod host_imports;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;

#[napi]
pub fn health_check() -> String {
    "tova_runtime ok".to_string()
}

#[napi]
pub async fn spawn_task(value: i64) -> Result<i64> {
    let result = scheduler::TOKIO_RT
        .spawn(async move { value })
        .await
        .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_all(values: Vec<i64>) -> Result<Vec<i64>> {
    let mut handles = Vec::with_capacity(values.len());
    for val in values {
        handles.push(scheduler::TOKIO_RT.spawn(async move { val }));
    }
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let r = handle.await.map_err(|e| Error::from_reason(format!("join: {}", e)))?;
        results.push(r);
    }
    Ok(results)
}

// --- Channels ---

#[napi]
pub fn channel_create(capacity: u32) -> i64 {
    channels::create(capacity) as i64
}

#[napi]
pub fn channel_send(id: i64, value: i64) -> bool {
    channels::send(id as u64, value)
}

#[napi]
pub fn channel_receive(id: i64) -> Option<i64> {
    channels::receive(id as u64)
}

#[napi]
pub fn channel_close(id: i64) {
    channels::close(id as u64)
}

// --- WASM execution ---

#[napi(object)]
pub struct WasmTask {
    pub wasm: Buffer,
    pub func: String,
    pub args: Vec<i64>,
}

#[napi]
pub async fn exec_wasm(wasm: Buffer, func: String, args: Vec<i64>) -> Result<i64> {
    let wasm_bytes = wasm.to_vec();
    let result = scheduler::TOKIO_RT
        .spawn_blocking(move || {
            executor::exec_wasm_sync(&wasm_bytes, &func, &args)
        })
        .await
        .map_err(|e| Error::from_reason(format!("task join error: {}", e)))?
        .map_err(|e| Error::from_reason(e))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_wasm(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    let mut handles = Vec::with_capacity(tasks.len());

    for task in tasks {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        handles.push(scheduler::TOKIO_RT.spawn_blocking(move || {
            executor::exec_wasm_sync(&wasm_bytes, &func, &args)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let r = handle
            .await
            .map_err(|e| Error::from_reason(format!("join: {}", e)))?
            .map_err(|e| Error::from_reason(e))?;
        results.push(r);
    }
    Ok(results)
}

#[napi]
pub async fn concurrent_wasm_shared(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    if tasks.is_empty() {
        return Ok(vec![]);
    }

    let wasm_bytes = tasks[0].wasm.to_vec();
    let chunk_size = (tasks.len() + 7) / 8;
    let task_data: Vec<(String, Vec<i64>)> = tasks
        .into_iter()
        .map(|t| (t.func, t.args))
        .collect();

    let chunks: Vec<Vec<(String, Vec<i64>)>> = task_data
        .chunks(chunk_size.max(1))
        .map(|c| c.to_vec())
        .collect();

    let wasm_arc = Arc::new(wasm_bytes);
    let mut handles = Vec::new();

    for chunk in chunks {
        let wasm = Arc::clone(&wasm_arc);
        handles.push(scheduler::TOKIO_RT.spawn_blocking(move || {
            executor::exec_many_shared(&wasm, chunk)
        }));
    }

    let mut all_results = Vec::new();
    for handle in handles {
        let chunk_results = handle
            .await
            .map_err(|e| Error::from_reason(format!("join: {}", e)))?;
        for r in chunk_results {
            all_results.push(r.map_err(|e| Error::from_reason(e))?);
        }
    }
    Ok(all_results)
}

// --- Block mode variants for concurrent WASM ---

/// Race mode: return the first successful result, cancel others
#[napi]
pub async fn concurrent_wasm_first(tasks: Vec<WasmTask>) -> Result<i64> {
    use tokio::sync::oneshot;

    if tasks.is_empty() {
        return Err(Error::from_reason("no tasks provided".to_string()));
    }

    let (tx, rx) = oneshot::channel::<std::result::Result<i64, String>>();
    let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));

    let mut handles = Vec::with_capacity(tasks.len());
    for task in tasks {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        let tx = Arc::clone(&tx);
        handles.push(scheduler::TOKIO_RT.spawn(async move {
            let result = tokio::task::spawn_blocking(move || {
                executor::exec_wasm_sync(&wasm_bytes, &func, &args)
            }).await.unwrap_or_else(|e| Err(format!("join: {}", e)));
            if let Ok(v) = &result {
                if let Some(sender) = tx.lock().await.take() {
                    let _ = sender.send(Ok(*v));
                }
            }
            result
        }));
    }

    // Wait for first Ok, or collect all errors
    match rx.await {
        Ok(Ok(v)) => {
            // Abort remaining tasks
            for h in &handles { h.abort(); }
            Ok(v)
        }
        _ => {
            // All tasks failed or channel dropped — collect errors
            let mut last_err = "all tasks failed".to_string();
            for handle in handles {
                match handle.await {
                    Ok(Err(e)) => last_err = e,
                    Err(e) => last_err = format!("join: {}", e),
                    _ => {}
                }
            }
            Err(Error::from_reason(last_err))
        }
    }
}

/// Timeout mode: cancel all tasks after deadline
#[napi]
pub async fn concurrent_wasm_timeout(tasks: Vec<WasmTask>, timeout_ms: u32) -> Result<Vec<i64>> {
    let duration = std::time::Duration::from_millis(timeout_ms as u64);

    let mut handles = Vec::with_capacity(tasks.len());
    for task in tasks {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        handles.push(scheduler::TOKIO_RT.spawn_blocking(move || {
            executor::exec_wasm_sync(&wasm_bytes, &func, &args)
        }));
    }

    match tokio::time::timeout(duration, async {
        let mut results = Vec::with_capacity(handles.len());
        for handle in handles.iter_mut() {
            let r = handle
                .await
                .map_err(|e| format!("join: {}", e))?
                .map_err(|e| e)?;
            results.push(r);
        }
        Ok::<Vec<i64>, String>(results)
    }).await {
        Ok(Ok(results)) => Ok(results),
        Ok(Err(e)) => Err(Error::from_reason(e)),
        Err(_) => {
            for h in &handles { h.abort(); }
            Err(Error::from_reason("concurrent timeout".to_string()))
        }
    }
}

/// Cancel-on-error mode: abort all tasks on first error.
/// Uses try_join_all to poll all tasks concurrently — detects the first error
/// immediately rather than waiting sequentially for earlier tasks to complete.
#[napi]
pub async fn concurrent_wasm_cancel_on_error(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    // Spawn all tasks on the blocking thread pool
    let handles: Vec<_> = tasks.into_iter().map(|task| {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        scheduler::TOKIO_RT.spawn_blocking(move || {
            executor::exec_wasm_sync(&wasm_bytes, &func, &args)
        })
    }).collect();

    // Wrap each handle in a future that flattens the nested Results
    let futures: Vec<_> = handles.into_iter().map(|h| {
        async move {
            let inner = h.await
                .map_err(|e| Error::from_reason(format!("join: {}", e)))?;
            inner.map_err(|e| Error::from_reason(e))
        }
    }).collect();

    // try_join_all polls all futures concurrently and short-circuits on first error,
    // dropping remaining futures (which detaches the underlying blocking tasks).
    // Results are returned in original order.
    futures::future::try_join_all(futures).await
}

// --- WASM with channel host imports ---

#[napi]
pub async fn exec_wasm_with_channels(wasm: Buffer, func: String, args: Vec<i64>) -> Result<i64> {
    let wasm_bytes = wasm.to_vec();
    let result = scheduler::TOKIO_RT
        .spawn_blocking(move || {
            executor::exec_wasm_with_channels(&wasm_bytes, &func, &args)
        })
        .await
        .map_err(|e| Error::from_reason(format!("join: {}", e)))?
        .map_err(|e| Error::from_reason(e))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_wasm_with_channels(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    let mut handles = Vec::with_capacity(tasks.len());

    for task in tasks {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        handles.push(scheduler::TOKIO_RT.spawn_blocking(move || {
            executor::exec_wasm_with_channels(&wasm_bytes, &func, &args)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let r = handle
            .await
            .map_err(|e| Error::from_reason(format!("join: {}", e)))?
            .map_err(|e| Error::from_reason(e))?;
        results.push(r);
    }
    Ok(results)
}
