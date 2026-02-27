use once_cell::sync::Lazy;
use tokio::runtime::Runtime;

// Global Tokio runtime — multi-threaded, work-stealing scheduler
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
