// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod sidecar;
mod tray;
mod updater;

use log::info;
use tauri::Manager;

fn main() {
    env_logger::init();

    info!("Starting AutoDoc Agent Desktop v{}...", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .setup(|app| {
            info!("Application setup...");

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

            // 自動啟動後端
            let backend_state = app.state::<sidecar::BackendProcess>();
            if let Err(e) = backend_state.start(3000) {
                log::warn!("無法啟動後端: {}. 將在稍後重試.", e);
            }

            Ok(())
        })
        .system_tray(tray::create_tray())
        .on_system_tray_event(tray::handle_tray_event)
        .invoke_handler(tauri::generate_handler![
            // Config commands
            config::load_config,
            config::save_config,
            config::validate_config,
            config::get_default_config,
            config::reset_config,
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
