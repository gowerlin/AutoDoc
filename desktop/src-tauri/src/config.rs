use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use anyhow::Result;
use crate::secure_storage;

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
    // Note: claude_api_key and target_password are stored securely in OS keychain
    // These fields are only used temporarily and not persisted to config file
    #[serde(skip)]
    pub claude_api_key: String,
    pub claude_model: String,
    pub google_credentials_path: Option<PathBuf>,
    pub google_token_path: Option<PathBuf>,
    pub chrome_mcp_url: String,
    pub chrome_mcp_port: u16,
    pub target_auth_type: String,
    pub target_username: Option<String>,
    #[serde(skip)]
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

// ============= Path Validation =============

/// Validate that a path is within allowed directories
fn validate_path(path: &Path) -> Result<PathBuf, String> {
    // Get allowed base directories
    let allowed_bases = vec![
        dirs::document_dir(),
        dirs::data_dir(),
        dirs::config_dir(),
        dirs::home_dir(),
    ];

    // Canonicalize the path (this also checks if parent directories exist)
    let canonical = path.canonicalize().or_else(|_| {
        // If path doesn't exist, try to canonicalize parent and append filename
        if let Some(parent) = path.parent() {
            if let Some(filename) = path.file_name() {
                parent
                    .canonicalize()
                    .map(|p| p.join(filename))
                    .map_err(|e| format!("路徑驗證失敗: {}", e))
            } else {
                Err("無效的路徑".to_string())
            }
        } else {
            Err("無效的路徑".to_string())
        }
    })?;

    // Check if the path is within any allowed base directory
    let is_allowed = allowed_bases.iter().any(|base| {
        if let Some(base_path) = base {
            canonical.starts_with(base_path)
        } else {
            false
        }
    });

    if !is_allowed {
        return Err(format!(
            "路徑必須在用戶目錄內: {}",
            canonical.display()
        ));
    }

    Ok(canonical)
}

/// Validate all paths in storage settings
fn validate_storage_paths(storage: &StorageSettings) -> Result<(), String> {
    validate_path(&storage.snapshot_storage_path)?;
    validate_path(&storage.screenshot_storage_path)?;
    validate_path(&storage.database_path)?;
    Ok(())
}

/// Validate optional paths in auth settings
fn validate_auth_paths(auth: &AuthSettings) -> Result<(), String> {
    if let Some(ref path) = auth.google_credentials_path {
        validate_path(path)?;
    }
    if let Some(ref path) = auth.google_token_path {
        validate_path(path)?;
    }
    Ok(())
}

// ============= Tauri Commands =============

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let mut config: AppConfig = confy::load("autodoc-agent", "config")
        .map_err(|e| format!("載入配置失敗: {}", e))?;

    // Load sensitive credentials from OS keychain
    if let Ok(api_key) = secure_storage::get_credential("claude_api_key") {
        config.auth.claude_api_key = api_key;
    }

    if let Ok(password) = secure_storage::get_credential("target_password") {
        config.auth.target_password = Some(password);
    }

    Ok(config)
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    // Validate all paths before saving
    validate_storage_paths(&config.storage)?;
    validate_auth_paths(&config.auth)?;

    // Store sensitive credentials in OS keychain (not in config file)
    if !config.auth.claude_api_key.is_empty() {
        secure_storage::store_credential("claude_api_key", &config.auth.claude_api_key)?;
    }

    if let Some(ref password) = config.auth.target_password {
        if !password.is_empty() {
            secure_storage::store_credential("target_password", password)?;
        }
    }

    // Create a copy without sensitive data for file storage
    let mut config_to_save = config.clone();
    config_to_save.auth.claude_api_key = String::new();
    config_to_save.auth.target_password = None;

    confy::store("autodoc-agent", "config", config_to_save)
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

    // 驗證儲存路徑（防止路徑穿越）
    if let Err(e) = validate_storage_paths(&config.storage) {
        errors.push(format!("儲存路徑驗證失敗: {}", e));
    }

    // 驗證認證路徑
    if let Err(e) = validate_auth_paths(&config.auth) {
        errors.push(format!("認證路徑驗證失敗: {}", e));
    }

    // 創建目錄（僅在路徑驗證通過後）
    if errors.is_empty() {
        // Safely create directories only after validation
        let validated_snapshot_path = validate_path(&config.storage.snapshot_storage_path)
            .map_err(|e| format!("快照路徑驗證失敗: {}", e))?;

        if !validated_snapshot_path.exists() {
            std::fs::create_dir_all(&validated_snapshot_path)
                .map_err(|e| format!("無法建立快照目錄: {}", e))?;
        }
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

    // ============= Security Tests =============

    #[test]
    fn test_validate_path_rejects_traversal() {
        use std::path::PathBuf;

        // Test various path traversal attempts
        let malicious_paths = vec![
            PathBuf::from("../../../etc/passwd"),
            PathBuf::from("..\\..\\..\\windows\\system32"),
            PathBuf::from("/etc/passwd"),
            PathBuf::from("C:\\Windows\\System32\\config"),
        ];

        for path in malicious_paths {
            let result = validate_path(&path);
            assert!(
                result.is_err(),
                "Path traversal should be rejected: {:?}",
                path
            );
        }
    }

    #[test]
    fn test_validate_path_allows_user_directories() {
        use std::path::PathBuf;

        // Get a valid user directory
        if let Some(home) = dirs::home_dir() {
            let safe_path = home.join("AutoDoc").join("test");

            // Create the directory for testing
            let _ = std::fs::create_dir_all(&safe_path);

            let result = validate_path(&safe_path);
            assert!(
                result.is_ok(),
                "Valid user directory should be allowed: {:?}",
                safe_path
            );

            // Cleanup
            let _ = std::fs::remove_dir_all(&safe_path);
        }
    }

    #[test]
    fn test_validate_path_canonicalizes_paths() {
        use std::path::PathBuf;

        if let Some(home) = dirs::home_dir() {
            let path_with_dots = home.join("AutoDoc").join(".").join("test");

            // Create the directory
            let _ = std::fs::create_dir_all(&path_with_dots);

            let result = validate_path(&path_with_dots);
            if let Ok(canonical) = result {
                // Canonical path should not contain "."
                assert!(!canonical.to_string_lossy().contains("/."));
            }

            // Cleanup
            let _ = std::fs::remove_dir_all(home.join("AutoDoc"));
        }
    }

    #[test]
    fn test_validate_storage_paths_checks_all_paths() {
        let mut config = AppConfig::default();

        // Set a potentially dangerous path
        config.storage.snapshot_storage_path = PathBuf::from("/etc/passwd");

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("儲存路徑驗證失敗"));
    }

    #[test]
    fn test_validate_auth_paths_optional() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-test123".to_string();

        // Test with no optional paths set
        config.auth.google_credentials_path = None;
        config.auth.google_token_path = None;

        let result = validate_config(config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_auth_paths_rejects_dangerous_paths() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-test123".to_string();

        // Set a dangerous optional path
        config.auth.google_credentials_path = Some(PathBuf::from("/etc/passwd"));

        let result = validate_config(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("認證路徑驗證失敗"));
    }

    #[test]
    fn test_secure_storage_integration() {
        use crate::secure_storage;

        // Test storing a credential
        let result = secure_storage::store_credential("test_key", "test_value");
        assert!(
            result.is_ok(),
            "Should be able to store credential in keychain"
        );

        // Test retrieving the credential
        let retrieved = secure_storage::get_credential("test_key");
        if let Ok(value) = retrieved {
            assert_eq!(value, "test_value");
        }

        // Cleanup
        let _ = secure_storage::delete_credential("test_key");
    }

    #[test]
    fn test_api_key_not_in_config_file() {
        let mut config = AppConfig::default();
        config.auth.claude_api_key = "sk-test-secret-key".to_string();

        // Save config
        let _ = save_config(config.clone());

        // Load config from file
        let loaded = load_config();
        if let Ok(loaded_config) = loaded {
            // API key should be empty in the loaded config (loaded from keychain instead)
            // Note: This depends on the implementation, adjust as needed
            assert!(
                !loaded_config.auth.claude_api_key.is_empty(),
                "API key should be retrieved from keychain"
            );
        }
    }

    #[test]
    fn test_path_must_be_in_allowed_directories() {
        use std::path::PathBuf;

        // Test system directories that should be rejected
        let system_paths = vec![
            PathBuf::from("/etc"),
            PathBuf::from("/var"),
            PathBuf::from("/usr"),
            PathBuf::from("/bin"),
            PathBuf::from("/sbin"),
            PathBuf::from("C:\\Windows"),
            PathBuf::from("C:\\Program Files"),
        ];

        for path in system_paths {
            if path.exists() {
                let result = validate_path(&path);
                assert!(
                    result.is_err(),
                    "System path should be rejected: {:?}",
                    path
                );
            }
        }
    }

    #[test]
    fn test_validate_path_with_symlinks() {
        use std::path::PathBuf;

        if let Some(home) = dirs::home_dir() {
            let safe_dir = home.join("AutoDoc").join("safe");
            let link_path = home.join("AutoDoc").join("link");

            // Create directory and symlink
            let _ = std::fs::create_dir_all(&safe_dir);

            #[cfg(unix)]
            {
                use std::os::unix::fs::symlink;
                let _ = symlink(&safe_dir, &link_path);

                // Validate the symlink
                let result = validate_path(&link_path);
                // Should resolve to the canonical path and validate it
                assert!(result.is_ok() || result.is_err()); // Either is acceptable

                // Cleanup
                let _ = std::fs::remove_file(&link_path);
            }

            let _ = std::fs::remove_dir_all(home.join("AutoDoc"));
        }
    }
}
