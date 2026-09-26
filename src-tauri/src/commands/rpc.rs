use serde_json::Value;

use crate::core::rpc;
use crate::storage::config;

#[tauri::command]
pub async fn rpc_test_connection(app: tauri::AppHandle) -> Result<Value, String> {
    let settings = config::load_settings(&app);
    rpc::test_connection(settings.rpc.clone()).await
}

#[tauri::command]
pub async fn rpc_set_idle_stats(
    app: tauri::AppHandle,
    downloads_count: u64,
    total_bytes: u64,
) -> Result<Value, String> {
    let settings = config::load_settings(&app);
    rpc::set_idle_stats(settings.rpc.clone(), downloads_count, total_bytes).await
}
