use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use anyhow::Result;

// ============= 配置結構定義 =============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub basic: BasicSettings,
    pub auth: AuthSettings,
    pub exploration: ExplorationSettings,
    pub storage: StorageSettings,
    pub advanced: AdvancedSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BasicSettings {
    pub app_name: String,
    pub language: String,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub check_updates: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthSettings {
    pub claude_api_key: String,
    pub claude_model: String,
    pub google_credentials_path: Option<PathBuf>,
    pub google_token_path: Option<PathBuf>,
    pub chrome_mcp_url: String,
    pub chrome_mcp_port: u16,
    pub target_auth_type: String,
    pub target_username: Option<String>,
    pub target_password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplorationSettings {
    pub strategy: String,
    pub max_depth: u32,
    pub max_pages: u32,
    pub screenshot_quality: String,
    pub network_timeout: u32,
    pub wait_for_network_idle: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageSettings {
    pub snapshot_storage_path: PathBuf,
    pub screenshot_storage_path: PathBuf,
    pub database_path: PathBuf,
    pub enable_compression: bool,
    pub auto_cleanup: bool,
    pub retention_days: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdvancedSettings {
    pub log_level: String,
    pub enable_telemetry: bool,
    pub concurrent_tabs: u32,
    pub api_rate_limit: u32,
    pub proxy_url: Option<String>,
    pub custom_user_agent: Option<String>,
}

// ============= 預設配置 =============

impl Default for AppConfig {
    fn default() -> Self {
        let docs_dir = dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("AutoDoc");

        AppConfig {
            basic: BasicSettings {
                app_name: "AutoDoc Agent".to_string(),
                language: "zh-TW".to_string(),
                auto_start: false,
                minimize_to_tray: true,
                check_updates: true,
            },
            auth: AuthSettings {
                claude_api_key: String::new(),
                claude_model: "claude-sonnet-4-20250514".to_string(),
                google_credentials_path: None,
                google_token_path: None,
                chrome_mcp_url: "http://localhost".to_string(),
                chrome_mcp_port: 3001,
                target_auth_type: "none".to_string(),
                target_username: None,
                target_password: None,
            },
            exploration: ExplorationSettings {
                strategy: "importance".to_string(),
                max_depth: 5,
                max_pages: 100,
                screenshot_quality: "medium".to_string(),
                network_timeout: 30,
                wait_for_network_idle: true,
            },
            storage: StorageSettings {
                snapshot_storage_path: docs_dir.join("snapshots"),
                screenshot_storage_path: docs_dir.join("screenshots"),
                database_path: docs_dir.join("autodoc.db"),
                enable_compression: true,
                auto_cleanup: false,
                retention_days: 0,
            },
            advanced: AdvancedSettings {
                log_level: "info".to_string(),
                enable_telemetry: false,
                concurrent_tabs: 3,
                api_rate_limit: 20,
                proxy_url: None,
                custom_user_agent: None,
            },
        }
    }
}

// ============= Tauri Commands =============

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    confy::load("autodoc-agent", "config")
        .map_err(|e| format!("載入配置失敗: {}", e))
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    confy::store("autodoc-agent", "config", config)
        .map_err(|e| format!("保存配置失敗: {}", e))
}

#[tauri::command]
pub fn validate_config(config: AppConfig) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();

    // 驗證 Claude API Key
    if config.auth.claude_api_key.is_empty() {
        errors.push("Claude API Key 不能為空".to_string());
    } else if !config.auth.claude_api_key.starts_with("sk-") {
        errors.push("Claude API Key 格式不正確".to_string());
    }

    // 驗證探索設定
    if config.exploration.max_depth == 0 || config.exploration.max_depth > 10 {
        errors.push("最大深度必須在 1-10 之間".to_string());
    }

    if config.exploration.max_pages < 10 || config.exploration.max_pages > 1000 {
        errors.push("最大頁面數必須在 10-1000 之間".to_string());
    }

    // 驗證儲存路徑
    if !config.storage.snapshot_storage_path.exists() {
        std::fs::create_dir_all(&config.storage.snapshot_storage_path)
            .map_err(|e| format!("無法建立快照目錄: {}", e))?;
    }

    if errors.is_empty() {
        Ok(vec!["配置驗證通過".to_string()])
    } else {
        Err(errors.join("; "))
    }
}

#[tauri::command]
pub fn get_default_config() -> AppConfig {
    AppConfig::default()
}

#[tauri::command]
pub fn reset_config() -> Result<(), String> {
    let default_config = AppConfig::default();
    save_config(default_config)
}

// ============= Tests =============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();

        // 測試基本設定預設值
        assert_eq!(config.basic.app_name, "AutoDoc Agent");
        assert_eq!(config.basic.language, "zh-TW");
        assert_eq!(config.basic.auto_start, false);
        assert_eq!(config.basic.minimize_to_tray, true);
        assert_eq!(config.basic.check_updates, true);

        // 測試認證設定預設值
        assert_eq!(config.auth.claude_api_key, "");
        assert_eq!(config.auth.claude_model, "claude-sonnet-4-20250514");
        assert_eq!(config.auth.chrome_mcp_url, "http://localhost");
        assert_eq!(config.auth.chrome_mcp_port, 3001);

        // 測試探索設定預設值
        assert_eq!(config.exploration.strategy, "importance");
        assert_eq!(config.exploration.max_depth, 5);
        assert_eq!(config.exploration.max_pages, 100);
        assert_eq!(config.exploration.screenshot_quality, "medium");
        assert_eq!(config.exploration.wait_for_network_idle, true);

        // 測試進階設定預設值
        assert_eq!(config.advanced.log_level, "info");
        assert_eq!(config.advanced.enable_telemetry, false);
        assert_eq!(config.advanced.concurrent_tabs, 3);
        assert_eq!(config.advanced.api_rate_limit, 20);
    }

    #[test]
    fn test_validate_config_valid() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-ant-api03-test123".to_string();

        let result = validate_config(config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_config_empty_api_key() {
        let config = AppConfig::default();
        // API Key 為空

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Claude API Key 不能為空"));
    }

    #[test]
    fn test_validate_config_invalid_api_key_format() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "invalid-key".to_string();

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("格式不正確"));
    }

    #[test]
    fn test_validate_config_invalid_max_depth() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-ant-api03-test".to_string();
        config.exploration.max_depth = 0; // 無效值

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("最大深度"));
    }

    #[test]
    fn test_validate_config_max_depth_too_large() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-ant-api03-test".to_string();
        config.exploration.max_depth = 11; // 超過最大值

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("最大深度"));
    }

    #[test]
    fn test_validate_config_invalid_max_pages() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-ant-api03-test".to_string();
        config.exploration.max_pages = 5; // 小於最小值

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("最大頁面數"));
    }

    #[test]
    fn test_get_default_config_command() {
        let config = get_default_config();

        assert_eq!(config.basic.app_name, "AutoDoc Agent");
        assert_eq!(config.basic.language, "zh-TW");
    }

    #[test]
    fn test_storage_paths_exist() {
        let config = AppConfig::default();

        // 測試路徑是否包含 "AutoDoc"
        assert!(config
            .storage
            .snapshot_storage_path
            .to_string_lossy()
            .contains("AutoDoc"));
        assert!(config
            .storage
            .screenshot_storage_path
            .to_string_lossy()
            .contains("AutoDoc"));
        assert!(config
            .storage
            .database_path
            .to_string_lossy()
            .contains("AutoDoc"));
    }
}
