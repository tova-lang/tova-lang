use wasmtime::*;
use once_cell::sync::Lazy;
use crate::host_imports;

// Global cached Engine — Wasmtime's JIT pipeline initialization is expensive,
// reuse the engine across all WASM executions.
static WASM_ENGINE: Lazy<Engine> = Lazy::new(|| Engine::default());

pub fn exec_wasm_sync(wasm_bytes: &[u8], func_name: &str, args: &[i64]) -> Result<i64, String> {
    let engine = &*WASM_ENGINE;
    let module = Module::new(engine, wasm_bytes)
        .map_err(|e| format!("WASM compile error: {}", e))?;
    let mut store = Store::new(engine, ());
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
    let module = match Module::new(engine, wasm_bytes) {
        Ok(m) => m,
        Err(e) => {
            let err = format!("compile: {}", e);
            return tasks.iter().map(|_| Err(err.clone())).collect();
        }
    };
    tasks
        .into_iter()
        .map(|(func_name, args)| {
            let mut store = Store::new(engine, ());
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

pub fn exec_wasm_with_channels(wasm_bytes: &[u8], func_name: &str, args: &[i64]) -> Result<i64, String> {
    let engine = &*WASM_ENGINE;
    let module = Module::new(engine, wasm_bytes)
        .map_err(|e| format!("WASM compile error: {}", e))?;
    let mut linker = Linker::new(engine);
    host_imports::add_channel_imports(&mut linker)?;
    let mut store = Store::new(engine, ());
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
