use once_cell::sync::Lazy;
use tokio::runtime::Runtime;

pub static TOKIO_RT: Lazy<Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(num_cpus())
        .build()
        .expect("Failed to create Tokio runtime")
});

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

pub fn spawn_task_inner(value: i64) -> i64 {
    value
}

pub async fn concurrent_all_inner(values: Vec<i64>) -> Vec<i64> {
    let mut handles = Vec::with_capacity(values.len());
    for val in values {
        handles.push(TOKIO_RT.spawn(async move { val }));
    }
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(handle.await.unwrap());
    }
    results
}
