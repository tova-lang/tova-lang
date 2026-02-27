mod channels;
mod executor;
mod host_imports;
mod scheduler;

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
        .spawn(async move { scheduler::spawn_task_inner(value) })
        .await
        .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_all(values: Vec<i64>) -> Result<Vec<i64>> {
    let results = scheduler::concurrent_all_inner(values).await;
    Ok(results)
}

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
        .spawn(async move { executor::exec_wasm_sync(&wasm_bytes, &func, &args) })
        .await
        .map_err(|e| Error::from_reason(format!("join: {}", e)))?
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
        handles.push(scheduler::TOKIO_RT.spawn(async move {
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
    let task_data: Vec<(String, Vec<i64>)> =
        tasks.into_iter().map(|t| (t.func, t.args)).collect();
    let chunks: Vec<Vec<(String, Vec<i64>)>> = task_data
        .chunks(chunk_size.max(1))
        .map(|c| c.to_vec())
        .collect();
    let wasm_arc = Arc::new(wasm_bytes);
    let mut handles = Vec::new();
    for chunk in chunks {
        let wasm = Arc::clone(&wasm_arc);
        handles.push(
            scheduler::TOKIO_RT.spawn_blocking(move || executor::exec_many_shared(&wasm, chunk)),
        );
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

#[napi]
pub async fn exec_wasm_with_channels(wasm: Buffer, func: String, args: Vec<i64>) -> Result<i64> {
    let wasm_bytes = wasm.to_vec();
    let result = scheduler::TOKIO_RT
        .spawn(async move {
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
        handles.push(scheduler::TOKIO_RT.spawn(async move {
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

#[napi]
pub fn channel_create(capacity: u32) -> u32 {
    channels::create(capacity)
}

#[napi]
pub fn channel_send(id: u32, value: i64) -> bool {
    channels::send(id, value)
}

#[napi]
pub fn channel_receive(id: u32) -> Option<i64> {
    channels::receive(id)
}

#[napi]
pub fn channel_close(id: u32) {
    channels::close(id)
}
