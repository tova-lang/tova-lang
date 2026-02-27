use napi_derive::napi;

#[napi]
pub fn health_check() -> String {
    "tova_runtime ok".to_string()
}
