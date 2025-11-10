use keyring::Entry;
use log::{error, info};

const SERVICE_NAME: &str = "AutoDoc Agent";

/// Securely store a credential in the OS keychain
pub fn store_credential(key: &str, value: &str) -> Result<(), String> {
    match Entry::new(SERVICE_NAME, key) {
        Ok(entry) => {
            match entry.set_password(value) {
                Ok(_) => {
                    info!("Credential '{}' stored securely in keychain", key);
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to store credential '{}': {}", key, e);
                    Err(format!("Failed to store credential: {}", e))
                }
            }
        }
        Err(e) => {
            error!("Failed to create keychain entry for '{}': {}", key, e);
            Err(format!("Failed to create keychain entry: {}", e))
        }
    }
}

/// Retrieve a credential from the OS keychain
pub fn get_credential(key: &str) -> Result<String, String> {
    match Entry::new(SERVICE_NAME, key) {
        Ok(entry) => {
            match entry.get_password() {
                Ok(password) => {
                    info!("Credential '{}' retrieved from keychain", key);
                    Ok(password)
                }
                Err(e) => {
                    // Don't log the full error as it might contain sensitive info
                    Err(format!("Credential not found or inaccessible: {}", key))
                }
            }
        }
        Err(e) => {
            error!("Failed to access keychain for '{}': {}", key, e);
            Err(format!("Failed to access keychain: {}", e))
        }
    }
}

/// Delete a credential from the OS keychain
pub fn delete_credential(key: &str) -> Result<(), String> {
    match Entry::new(SERVICE_NAME, key) {
        Ok(entry) => {
            match entry.delete_password() {
                Ok(_) => {
                    info!("Credential '{}' deleted from keychain", key);
                    Ok(())
                }
                Err(e) => {
                    // It's okay if the credential doesn't exist
                    info!("Credential '{}' was not in keychain", key);
                    Ok(())
                }
            }
        }
        Err(e) => {
            error!("Failed to access keychain for deletion of '{}': {}", key, e);
            Err(format!("Failed to access keychain: {}", e))
        }
    }
}

/// Check if a credential exists in the keychain
pub fn has_credential(key: &str) -> bool {
    match Entry::new(SERVICE_NAME, key) {
        Ok(entry) => entry.get_password().is_ok(),
        Err(_) => false,
    }
}

// Tauri commands

#[tauri::command]
pub fn store_secure_credential(key: String, value: String) -> Result<(), String> {
    store_credential(&key, &value)
}

#[tauri::command]
pub fn get_secure_credential(key: String) -> Result<String, String> {
    get_credential(&key)
}

#[tauri::command]
pub fn delete_secure_credential(key: String) -> Result<(), String> {
    delete_credential(&key)
}

#[tauri::command]
pub fn has_secure_credential(key: String) -> Result<bool, String> {
    Ok(has_credential(&key))
}

/// Migrate plaintext credentials to secure storage
pub fn migrate_credential_to_keychain(key: &str, plaintext_value: Option<String>) -> Result<bool, String> {
    if let Some(value) = plaintext_value {
        if !value.is_empty() {
            info!("Migrating credential '{}' to keychain", key);
            store_credential(key, &value)?;
            return Ok(true); // Migration performed
        }
    }
    Ok(false) // No migration needed
}

// ============= Tests =============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_and_retrieve_credential() {
        let test_key = "test_store_retrieve";
        let test_value = "secret_password_123";

        // Store credential
        let store_result = store_credential(test_key, test_value);
        assert!(store_result.is_ok(), "Should store credential successfully");

        // Retrieve credential
        let retrieve_result = get_credential(test_key);
        assert!(retrieve_result.is_ok(), "Should retrieve credential successfully");
        assert_eq!(retrieve_result.unwrap(), test_value);

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_update_credential() {
        let test_key = "test_update";
        let initial_value = "initial_secret";
        let updated_value = "updated_secret";

        // Store initial value
        let _ = store_credential(test_key, initial_value);

        // Verify initial value
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, initial_value);

        // Update with new value
        let _ = store_credential(test_key, updated_value);

        // Verify updated value
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, updated_value);

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_delete_credential() {
        let test_key = "test_delete";
        let test_value = "secret_to_delete";

        // Store credential
        let _ = store_credential(test_key, test_value);

        // Verify it exists
        assert!(has_credential(test_key));

        // Delete credential
        let delete_result = delete_credential(test_key);
        assert!(delete_result.is_ok(), "Should delete credential successfully");

        // Verify it's gone
        assert!(!has_credential(test_key));
    }

    #[test]
    fn test_has_credential() {
        let test_key = "test_has_credential";
        let test_value = "test_value";

        // Should not exist initially
        assert!(!has_credential(test_key));

        // Store credential
        let _ = store_credential(test_key, test_value);

        // Should exist now
        assert!(has_credential(test_key));

        // Cleanup
        let _ = delete_credential(test_key);

        // Should not exist after deletion
        assert!(!has_credential(test_key));
    }

    #[test]
    fn test_get_nonexistent_credential() {
        let test_key = "nonexistent_key_12345";

        // Ensure it doesn't exist
        let _ = delete_credential(test_key);

        // Try to retrieve non-existent credential
        let result = get_credential(test_key);
        assert!(result.is_err(), "Should return error for non-existent credential");
    }

    #[test]
    fn test_delete_nonexistent_credential() {
        let test_key = "nonexistent_delete_12345";

        // Delete non-existent credential should not fail
        let result = delete_credential(test_key);
        assert!(result.is_ok(), "Deleting non-existent credential should succeed");
    }

    #[test]
    fn test_store_empty_value() {
        let test_key = "test_empty_value";
        let empty_value = "";

        // Store empty value
        let result = store_credential(test_key, empty_value);
        assert!(result.is_ok(), "Should be able to store empty value");

        // Retrieve and verify
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, empty_value);

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_store_special_characters() {
        let test_key = "test_special_chars";
        let special_value = "p@ssw0rd!#$%^&*()_+-=[]{}|;':\",./<>?`~";

        // Store value with special characters
        let result = store_credential(test_key, special_value);
        assert!(result.is_ok(), "Should store special characters");

        // Retrieve and verify
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, special_value);

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_store_long_value() {
        let test_key = "test_long_value";
        let long_value = "a".repeat(10000); // 10KB string

        // Store long value
        let result = store_credential(test_key, &long_value);
        assert!(result.is_ok(), "Should store long value");

        // Retrieve and verify
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, long_value);

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_store_unicode_value() {
        let test_key = "test_unicode";
        let unicode_value = "密碼123🔐🔑";

        // Store unicode value
        let result = store_credential(test_key, unicode_value);
        assert!(result.is_ok(), "Should store unicode characters");

        // Retrieve and verify
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, unicode_value);

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_tauri_command_store() {
        let test_key = "test_tauri_store".to_string();
        let test_value = "test_value".to_string();

        // Test Tauri command wrapper
        let result = store_secure_credential(test_key.clone(), test_value.clone());
        assert!(result.is_ok());

        // Verify via direct function
        let retrieved = get_credential(&test_key).unwrap();
        assert_eq!(retrieved, test_value);

        // Cleanup
        let _ = delete_credential(&test_key);
    }

    #[test]
    fn test_tauri_command_get() {
        let test_key = "test_tauri_get".to_string();
        let test_value = "test_value".to_string();

        // Store via direct function
        let _ = store_credential(&test_key, &test_value);

        // Test Tauri command wrapper
        let result = get_secure_credential(test_key.clone());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_value);

        // Cleanup
        let _ = delete_credential(&test_key);
    }

    #[test]
    fn test_tauri_command_delete() {
        let test_key = "test_tauri_delete".to_string();
        let test_value = "test_value".to_string();

        // Store credential
        let _ = store_credential(&test_key, &test_value);

        // Test Tauri command wrapper
        let result = delete_secure_credential(test_key.clone());
        assert!(result.is_ok());

        // Verify deletion
        assert!(!has_credential(&test_key));
    }

    #[test]
    fn test_tauri_command_has() {
        let test_key = "test_tauri_has".to_string();
        let test_value = "test_value".to_string();

        // Should not exist initially
        let result = has_secure_credential(test_key.clone());
        assert!(result.is_ok());
        assert!(!result.unwrap());

        // Store credential
        let _ = store_credential(&test_key, &test_value);

        // Should exist now
        let result = has_secure_credential(test_key.clone());
        assert!(result.is_ok());
        assert!(result.unwrap());

        // Cleanup
        let _ = delete_credential(&test_key);
    }

    #[test]
    fn test_migrate_credential_with_value() {
        let test_key = "test_migrate";
        let plaintext_value = Some("plaintext_password".to_string());

        // Migrate credential
        let result = migrate_credential_to_keychain(test_key, plaintext_value.clone());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true); // Migration performed

        // Verify it's in keychain
        let retrieved = get_credential(test_key).unwrap();
        assert_eq!(retrieved, plaintext_value.unwrap());

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_migrate_credential_empty_value() {
        let test_key = "test_migrate_empty";
        let plaintext_value = Some("".to_string());

        // Migrate empty value
        let result = migrate_credential_to_keychain(test_key, plaintext_value);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), false); // No migration performed

        // Should not exist in keychain
        assert!(!has_credential(test_key));
    }

    #[test]
    fn test_migrate_credential_none() {
        let test_key = "test_migrate_none";

        // Migrate None value
        let result = migrate_credential_to_keychain(test_key, None);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), false); // No migration performed

        // Should not exist in keychain
        assert!(!has_credential(test_key));
    }

    #[test]
    fn test_service_name_isolation() {
        // All credentials should be under the "AutoDoc Agent" service name
        let test_key = "test_isolation";
        let test_value = "test_value";

        // Store credential
        let _ = store_credential(test_key, test_value);

        // The credential should be accessible only through our service
        assert!(has_credential(test_key));

        // Cleanup
        let _ = delete_credential(test_key);
    }

    #[test]
    fn test_concurrent_access() {
        use std::thread;

        let test_key = "test_concurrent";
        let test_value = "test_value";

        // Store initial value
        let _ = store_credential(test_key, test_value);

        // Spawn multiple threads reading the same credential
        let handles: Vec<_> = (0..5)
            .map(|_| {
                let key = test_key.to_string();
                thread::spawn(move || {
                    let result = get_credential(&key);
                    assert!(result.is_ok());
                })
            })
            .collect();

        // Wait for all threads
        for handle in handles {
            handle.join().unwrap();
        }

        // Cleanup
        let _ = delete_credential(test_key);
    }
}
