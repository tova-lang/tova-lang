use wasmtime::*;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use crate::host_imports;

// Global cached Engine — Wasmtime's JIT pipeline initialization is expensive,
// reuse the engine across all WASM executions.
static WASM_ENGINE: Lazy<Engine> = Lazy::new(|| {
    let mut config = Config::new();
    config.consume_fuel(true);
    config.wasm_multi_value(true);
    Engine::new(&config).expect("failed to create WASM engine")
});

// Module cache — avoids recompiling the same WASM bytes on repeated calls.
// Keyed by a fast hash of the WASM bytes.
static MODULE_CACHE: Lazy<Mutex<HashMap<u64, Module>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn hash_wasm_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

fn get_or_compile_module(wasm_bytes: &[u8]) -> Result<Module, String> {
    let hash = hash_wasm_bytes(wasm_bytes);
    {
        let cache = MODULE_CACHE.lock().unwrap();
        if let Some(module) = cache.get(&hash) {
            return Ok(module.clone());
        }
    }
    let module = Module::new(&*WASM_ENGINE, wasm_bytes)
        .map_err(|e| format!("compile: {}", e))?;
    {
        let mut cache = MODULE_CACHE.lock().unwrap();
        cache.insert(hash, module.clone());
    }
    Ok(module)
}

pub fn exec_wasm_sync(wasm_bytes: &[u8], func_name: &str, args: &[i64]) -> Result<i64, String> {
    let engine = &*WASM_ENGINE;
    let module = get_or_compile_module(wasm_bytes)?;
    let mut store = Store::new(engine, ());
    store.set_fuel(1_000_000_000).map_err(|e| format!("fuel error: {}", e))?;
    let instance = Instance::new(&mut store, &module, &[])
        .map_err(|e| format!("WASM instantiation error: {}", e))?;
    let func = instance
        .get_func(&mut store, func_name)
        .ok_or_else(|| format!("function '{}' not found", func_name))?;
    let func_ty = func.ty(&store);
    let wasm_args: Vec<Val> = args
        .iter()
        .zip(func_ty.params())
        .map(|(&v, ty)| match ty {
            ValType::I32 => Val::I32(v as i32),
            ValType::I64 => Val::I64(v),
            _ => Val::I64(v),
        })
        .collect();
    let mut results = vec![Val::I64(0)];
    func.call(&mut store, &wasm_args, &mut results)
        .map_err(|e| format!("WASM execution error: {}", e))?;
    match results[0] {
        Val::I64(v) => Ok(v),
        Val::I32(v) => Ok(v as i64),
        _ => Err("unexpected return type".to_string()),
    }
}

pub fn exec_many_shared(
    wasm_bytes: &[u8],
    tasks: Vec<(String, Vec<i64>)>,
) -> Vec<Result<i64, String>> {
    let engine = &*WASM_ENGINE;
    let module = match get_or_compile_module(wasm_bytes) {
        Ok(m) => m,
        Err(e) => {
            return tasks.iter().map(|_| Err(e.clone())).collect();
        }
    };
    tasks
        .into_iter()
        .map(|(func_name, args)| {
            let mut store = Store::new(engine, ());
            store.set_fuel(1_000_000_000).map_err(|e| format!("fuel error: {}", e))?;
            let instance = Instance::new(&mut store, &module, &[])
                .map_err(|e| format!("instantiate: {}", e))?;
            let func = instance
                .get_func(&mut store, &func_name)
                .ok_or_else(|| format!("func '{}' not found", func_name))?;
            let func_ty = func.ty(&store);
            let wasm_args: Vec<Val> = args
                .iter()
                .zip(func_ty.params())
                .map(|(&v, ty)| match ty {
                    ValType::I32 => Val::I32(v as i32),
                    ValType::I64 => Val::I64(v),
                    _ => Val::I64(v),
                })
                .collect();
            let mut results = vec![Val::I64(0)];
            func.call(&mut store, &wasm_args, &mut results)
                .map_err(|e| format!("exec: {}", e))?;
            match results[0] {
                Val::I64(v) => Ok(v),
                Val::I32(v) => Ok(v as i64),
                _ => Err("unexpected return type".to_string()),
            }
        })
        .collect()
}

/// Optimized batch execution: reuse a single Store+Instance for all tasks in a chunk.
/// Uses TypedFunc for known signatures to avoid Val boxing overhead.
/// Safe for pure WASM functions with no mutable globals or linear memory side effects.
pub fn exec_many_shared_reuse(
    wasm_bytes: &[u8],
    tasks: Vec<(String, Vec<i64>)>,
) -> Vec<Result<i64, String>> {
    if tasks.is_empty() {
        return vec![];
    }

    let engine = &*WASM_ENGINE;
    let module = match get_or_compile_module(wasm_bytes) {
        Ok(m) => m,
        Err(e) => {
            return tasks.iter().map(|_| Err(e.clone())).collect();
        }
    };

    let mut store = Store::new(engine, ());
    if let Err(e) = store.set_fuel(1_000_000_000) {
        let err = format!("fuel error: {}", e);
        return tasks.iter().map(|_| Err(err.clone())).collect();
    }
    let instance = match Instance::new(&mut store, &module, &[]) {
        Ok(i) => i,
        Err(e) => {
            let err = format!("instantiate: {}", e);
            return tasks.iter().map(|_| Err(err.clone())).collect();
        }
    };

    // Detect signature from the first task's function to pick the fast typed path
    let first_func_name = &tasks[0].0;
    let first_nargs = tasks[0].1.len();

    // Try typed fast paths: (i32,i32)->i32, (i32)->i32, (i64)->i64, ()->i32
    // These avoid Val allocation/boxing per call.
    if let Some(results) = try_typed_batch(&mut store, &instance, &tasks, first_func_name, first_nargs) {
        return results;
    }

    // Fallback: dynamic Val-based path for unknown signatures
    let mut func_cache: HashMap<String, (Func, Vec<ValType>)> = HashMap::new();

    tasks
        .into_iter()
        .map(|(func_name, args)| {
            let (func, param_types) = if let Some(cached) = func_cache.get(&func_name) {
                (cached.0, cached.1.clone())
            } else {
                let f = instance
                    .get_func(&mut store, &func_name)
                    .ok_or_else(|| format!("func '{}' not found", func_name))?;
                let param_types: Vec<ValType> = f.ty(&store).params().collect();
                func_cache.insert(func_name.clone(), (f, param_types.clone()));
                (f, param_types)
            };

            let wasm_args: Vec<Val> = args
                .iter()
                .zip(param_types.iter())
                .map(|(&v, ty)| match ty {
                    ValType::I32 => Val::I32(v as i32),
                    ValType::I64 => Val::I64(v),
                    _ => Val::I64(v),
                })
                .collect();

            let mut results = vec![Val::I64(0)];
            func.call(&mut store, &wasm_args, &mut results)
                .map_err(|e| format!("exec: {}", e))?;

            match results[0] {
                Val::I64(v) => Ok(v),
                Val::I32(v) => Ok(v as i64),
                _ => Err("unexpected return type".to_string()),
            }
        })
        .collect()
}

/// Try to use TypedFunc for common WASM signatures.
/// Returns None if the signature doesn't match any fast path.
fn try_typed_batch(
    store: &mut Store<()>,
    instance: &Instance,
    tasks: &[(String, Vec<i64>)],
    func_name: &str,
    nargs: usize,
) -> Option<Vec<Result<i64, String>>> {
    // (i32, i32) -> i32  — e.g. add(a, b)
    if nargs == 2 {
        if let Ok(f) = instance.get_typed_func::<(i32, i32), i32>(&mut *store, func_name) {
            let mut results = Vec::with_capacity(tasks.len());
            for (_, args) in tasks {
                results.push(
                    f.call(&mut *store, (args[0] as i32, args[1] as i32))
                        .map(|v| v as i64)
                        .map_err(|e| format!("exec: {}", e))
                );
            }
            return Some(results);
        }
        if let Ok(f) = instance.get_typed_func::<(i64, i64), i64>(&mut *store, func_name) {
            let mut results = Vec::with_capacity(tasks.len());
            for (_, args) in tasks {
                results.push(
                    f.call(&mut *store, (args[0], args[1]))
                        .map_err(|e| format!("exec: {}", e))
                );
            }
            return Some(results);
        }
    }

    // (i32) -> i32  — e.g. fib(n)
    if nargs == 1 {
        if let Ok(f) = instance.get_typed_func::<i32, i32>(&mut *store, func_name) {
            let mut results = Vec::with_capacity(tasks.len());
            for (_, args) in tasks {
                results.push(
                    f.call(&mut *store, args[0] as i32)
                        .map(|v| v as i64)
                        .map_err(|e| format!("exec: {}", e))
                );
            }
            return Some(results);
        }
        if let Ok(f) = instance.get_typed_func::<i64, i64>(&mut *store, func_name) {
            let mut results = Vec::with_capacity(tasks.len());
            for (_, args) in tasks {
                results.push(
                    f.call(&mut *store, args[0])
                        .map_err(|e| format!("exec: {}", e))
                );
            }
            return Some(results);
        }
    }

    // () -> i32
    if nargs == 0 {
        if let Ok(f) = instance.get_typed_func::<(), i32>(&mut *store, func_name) {
            let mut results = Vec::with_capacity(tasks.len());
            for _ in tasks {
                results.push(
                    f.call(&mut *store, ())
                        .map(|v| v as i64)
                        .map_err(|e| format!("exec: {}", e))
                );
            }
            return Some(results);
        }
    }

    None
}

pub fn exec_wasm_with_channels(wasm_bytes: &[u8], func_name: &str, args: &[i64]) -> Result<i64, String> {
    let engine = &*WASM_ENGINE;
    let module = get_or_compile_module(wasm_bytes)?;
    let mut linker = Linker::new(engine);
    host_imports::add_channel_imports(&mut linker)?;
    let mut store = Store::new(engine, ());
    store.set_fuel(1_000_000_000).map_err(|e| format!("fuel error: {}", e))?;
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| format!("WASM instantiation error: {}", e))?;
    let func = instance
        .get_func(&mut store, func_name)
        .ok_or_else(|| format!("function '{}' not found", func_name))?;
    let func_ty = func.ty(&store);
    let wasm_args: Vec<Val> = args
        .iter()
        .zip(func_ty.params())
        .map(|(&v, ty)| match ty {
            ValType::I32 => Val::I32(v as i32),
            ValType::I64 => Val::I64(v),
            _ => Val::I64(v),
        })
        .collect();
    let mut results = vec![Val::I64(0)];
    func.call(&mut store, &wasm_args, &mut results)
        .map_err(|e| format!("WASM exec error: {}", e))?;
    match results[0] {
        Val::I64(v) => Ok(v),
        Val::I32(v) => Ok(v as i64),
        _ => Err("unexpected return type".to_string()),
    }
}
