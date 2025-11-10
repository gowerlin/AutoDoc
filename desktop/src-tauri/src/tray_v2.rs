use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, Emitter,
};

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // Create menu items
    let show = MenuItem::with_id(app, "show", "顯示主視窗", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隱藏視窗", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "設定", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "about", "關於", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    // Build menu
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &about,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    // Create tray icon
    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "settings" => {
                // 發送事件到前端，開啟設定視窗
                let _ = app.emit("open-settings", ());
            }
            "about" => {
                // 顯示關於對話框 - 使用 Tauri v2 的 dialog plugin
                use tauri_plugin_dialog::DialogExt;
                app.dialog()
                    .message("AutoDoc Agent v2.0\n智能探索式使用手冊生成器\n\n© 2025 AutoDoc Team")
                    .title("關於 AutoDoc Agent")
                    .blocking_show();
            }
            "quit" => {
                std::process::exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
