// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod sidecar;
mod secure_storage;
mod tray_v2;
mod updater;

use tray_v2 as tray;

use log::info;
use tauri::Manager;

fn main() {
    env_logger::init();

    info!("Starting AutoDoc Agent Desktop v{}...", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            info!("Application setup...");

            // Initialize tray icon
            tray::create_tray(app.handle())?;

            // 初始化 Backend Process
            let backend = sidecar::BackendProcess::new();
            app.manage(backend);

            // 載入或創建配置
            match config::load_config() {
                Ok(cfg) => {
                    info!("配置載入成功");
                    app.manage(cfg);
                }
                Err(e) => {
                    info!("使用預設配置: {}", e);
                    let default_cfg = config::AppConfig::default();
                    let _ = config::save_config(default_cfg.clone());
                    app.manage(default_cfg);
                }
            }

            // Note: Backend is now started manually via the UI to ensure proper path resolution
            // The backend requires AppHandle for path resolution, which is not available here
            info!("Backend will be started on demand via UI");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config commands
            config::load_config,
            config::save_config,
            config::validate_config,
            config::get_default_config,
            config::reset_config,
            // Secure storage commands
            secure_storage::store_secure_credential,
            secure_storage::get_secure_credential,
            secure_storage::delete_secure_credential,
            secure_storage::has_secure_credential,
            // Sidecar commands
            sidecar::start_backend,
            sidecar::stop_backend,
            sidecar::restart_backend,
            sidecar::check_backend_health,
            sidecar::get_backend_status,
            // Updater commands
            updater::check_for_updates,
            updater::install_update,
            updater::get_app_version,
            updater::download_update_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    info!("Application terminated");
}
