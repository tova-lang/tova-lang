mod scheduler;

use napi::bindgen_prelude::*;
use napi_derive::napi;

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
