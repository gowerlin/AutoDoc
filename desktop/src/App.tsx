import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { ConfigProvider, message } from "antd";
import zhTW from "antd/locale/zh_TW";
import SettingsWindow from "./components/SettingsWindow";
import WelcomeWizard from "./components/WelcomeWizard";
import MainWindow from "./components/MainWindow";

interface AppConfig {
  basic: {
    app_name: string;
    language: string;
    auto_start: boolean;
    minimize_to_tray: boolean;
    check_updates: boolean;
  };
  auth: {
    claude_api_key: string;
    claude_model: string;
    chrome_mcp_url: string;
    chrome_mcp_port: number;
  };
  exploration: {
    strategy: string;
    max_depth: number;
    max_pages: number;
    screenshot_quality: string;
    wait_for_network_idle: boolean;
  };
  storage: {
    snapshot_storage_path: string;
    screenshot_storage_path: string;
    database_path: string;
    enable_compression: boolean;
    auto_cleanup: boolean;
    retention_days: number;
  };
  advanced: {
    log_level: string;
    enable_telemetry: boolean;
    concurrent_tabs: number;
    api_rate_limit: number;
    proxy_url?: string;
  };
}

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 載入配置
    loadConfig();

    // 監聽系統托盤的設定事件
    const unlisten = listen("open-settings", () => {
      setShowSettings(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await invoke<AppConfig>("load_config");
      setConfig(cfg);

      // 檢查是否首次啟動（API Key 為空）
      if (!cfg.auth.claude_api_key) {
        setShowWizard(true);
      }
    } catch (error) {
      message.error("載入配置失敗: " + error);
      // 顯示首次啟動精靈
      setShowWizard(true);
    } finally {
      setLoading(false);
    }
  };

  const handleWizardComplete = async () => {
    setShowWizard(false);
    await loadConfig();
  };

  const handleSettingsSave = async (newConfig: AppConfig) => {
    try {
      await invoke("save_config", { config: newConfig });
      setConfig(newConfig);
      message.success("配置已保存");
      setShowSettings(false);
    } catch (error) {
      message.error("保存配置失敗: " + error);
    }
  };

  if (loading) {
    return (
      <ConfigProvider locale={zhTW}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-2xl mb-4">🤖</div>
            <div>載入中...</div>
          </div>
        </div>
      </ConfigProvider>
    );
  }

  if (showWizard) {
    return (
      <ConfigProvider locale={zhTW}>
        <WelcomeWizard onComplete={handleWizardComplete} />
      </ConfigProvider>
    );
  }

  if (showSettings) {
    return (
      <ConfigProvider locale={zhTW}>
        <SettingsWindow
          config={config!}
          onSave={handleSettingsSave}
          onCancel={() => setShowSettings(false)}
        />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={zhTW}>
      <MainWindow
        config={config!}
        onOpenSettings={() => setShowSettings(true)}
      />
    </ConfigProvider>
  );
}

export default App;
