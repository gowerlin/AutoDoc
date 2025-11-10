use log::{error, info};
use std::process::{Child, Command as StdCommand, Stdio};
use std::sync::Mutex;
use tauri::State;

pub struct BackendProcess {
    child: Mutex<Option<Child>>,
}

impl BackendProcess {
    pub fn new() -> Self {
        BackendProcess {
            child: Mutex::new(None),
        }
    }

    pub fn start(&self, port: u16) -> Result<(), String> {
        info!("啟動 Node.js Backend Sidecar on port {}", port);

        // 檢查是否已經在運行
        let mut child_lock = self.child.lock().unwrap();
        if child_lock.is_some() {
            return Err("Backend 已經在運行".to_string());
        }

        // 啟動後端進程
        // 注意：在開發階段，我們先使用 Node.js 直接運行
        // 在生產環境中，這將是打包的二進制文件
        let child = StdCommand::new("node")
            .arg("../backend/dist/index.js")
            .arg("--port")
            .arg(port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("啟動後端失敗: {}", e))?;

        *child_lock = Some(child);

        // 等待後端啟動
        std::thread::sleep(std::time::Duration::from_secs(2));

        info!("Backend Sidecar 啟動成功");
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut child_lock = self.child.lock().unwrap();

        if let Some(mut child) = child_lock.take() {
            match child.kill() {
                Ok(_) => {
                    info!("Node.js Backend Sidecar stopped");
                    Ok(())
                }
                Err(e) => {
                    error!("停止後端失敗: {}", e);
                    Err(format!("停止後端失敗: {}", e))
                }
            }
        } else {
            Err("Backend 未在運行".to_string())
        }
    }

    pub fn restart(&self, port: u16) -> Result<(), String> {
        self.stop().ok(); // 嘗試停止，忽略錯誤
        std::thread::sleep(std::time::Duration::from_secs(1));
        self.start(port)
    }

    pub fn is_running(&self) -> bool {
        let child_lock = self.child.lock().unwrap();
        child_lock.is_some()
    }
}

#[tauri::command]
pub fn start_backend(
    backend: State<BackendProcess>,
    port: Option<u16>,
) -> Result<String, String> {
    let port = port.unwrap_or(3000);
    backend.start(port)?;
    Ok(format!("Backend 已在端口 {} 啟動", port))
}

#[tauri::command]
pub fn stop_backend(backend: State<BackendProcess>) -> Result<String, String> {
    backend.stop()?;
    Ok("Backend 已停止".to_string())
}

#[tauri::command]
pub fn restart_backend(
    backend: State<BackendProcess>,
    port: Option<u16>,
) -> Result<String, String> {
    let port = port.unwrap_or(3000);
    backend.restart(port)?;
    Ok(format!("Backend 已在端口 {} 重啟", port))
}

#[tauri::command]
pub fn check_backend_health() -> Result<bool, String> {
    // 檢查後端是否正常運作
    let client = reqwest::blocking::Client::new();
    match client
        .get("http://localhost:3000/health")
        .timeout(std::time::Duration::from_secs(5))
        .send()
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn get_backend_status(backend: State<BackendProcess>) -> Result<BackendStatus, String> {
    let is_running = backend.is_running();
    let is_healthy = if is_running {
        check_backend_health().unwrap_or(false)
    } else {
        false
    };

    Ok(BackendStatus {
        running: is_running,
        healthy: is_healthy,
    })
}

#[derive(serde::Serialize)]
pub struct BackendStatus {
    pub running: bool,
    pub healthy: bool,
}
