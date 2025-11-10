use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem,
};

pub fn create_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "顯示主視窗");
    let hide = CustomMenuItem::new("hide".to_string(), "隱藏視窗");
    let settings = CustomMenuItem::new("settings".to_string(), "設定");
    let about = CustomMenuItem::new("about".to_string(), "關於");
    let quit = CustomMenuItem::new("quit".to_string(), "退出");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(settings)
        .add_item(about)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick {
            position: _,
            size: _,
            ..
        } => {
            if let Some(window) = app.get_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "show" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.hide();
                }
            }
            "settings" => {
                // 發送事件到前端，開啟設定視窗
                let _ = app.emit_all("open-settings", ());
            }
            "about" => {
                // 顯示關於對話框
                if let Some(window) = app.get_window("main") {
                    tauri::api::dialog::message(
                        Some(&window),
                        "關於 AutoDoc Agent",
                        "AutoDoc Agent v2.0\n智能探索式使用手冊生成器\n\n© 2025 AutoDoc Team",
                    );
                }
            }
            "quit" => {
                std::process::exit(0);
            }
            _ => {}
        },
        _ => {}
    }
}
