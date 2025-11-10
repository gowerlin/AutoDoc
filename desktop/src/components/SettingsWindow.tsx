import { useState } from "react";
import { Tabs, Form, Button, message } from "antd";
import { invoke } from "@tauri-apps/api/tauri";
import BasicSettingsTab from "./SettingsTabs/BasicSettingsTab";
import AuthSettingsTab from "./SettingsTabs/AuthSettingsTab";
import ExplorationSettingsTab from "./SettingsTabs/ExplorationSettingsTab";
import StorageSettingsTab from "./SettingsTabs/StorageSettingsTab";
import AdvancedSettingsTab from "./SettingsTabs/AdvancedSettingsTab";

interface SettingsWindowProps {
  config: any;
  onSave: (config: any) => void;
  onCancel: () => void;
}

function SettingsWindow({ config, onSave, onCancel }: SettingsWindowProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();

      // 驗證配置
      await invoke("validate_config", { config: values });

      // 保存配置
      await onSave(values);
    } catch (error: any) {
      message.error("保存失敗: " + error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      const defaultConfig = await invoke("get_default_config");
      form.setFieldsValue(defaultConfig);
      message.info("已重置為預設值");
    } catch (error) {
      message.error("重置失敗: " + error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* 標題欄 */}
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">⚙️ 設定</h1>
      </div>

      {/* 內容區域 */}
      <div className="flex-1 overflow-hidden">
        <Form
          form={form}
          layout="vertical"
          initialValues={config}
          className="h-full"
        >
          <Tabs
            tabPosition="left"
            className="h-full"
            items={[
              {
                key: "basic",
                label: "📋 基本設定",
                children: (
                  <div className="px-6 py-4">
                    <BasicSettingsTab />
                  </div>
                ),
              },
              {
                key: "auth",
                label: "🔐 認證設定",
                children: (
                  <div className="px-6 py-4">
                    <AuthSettingsTab form={form} />
                  </div>
                ),
              },
              {
                key: "exploration",
                label: "🔍 探索設定",
                children: (
                  <div className="px-6 py-4">
                    <ExplorationSettingsTab />
                  </div>
                ),
              },
              {
                key: "storage",
                label: "💾 儲存設定",
                children: (
                  <div className="px-6 py-4">
                    <StorageSettingsTab form={form} />
                  </div>
                ),
              },
              {
                key: "advanced",
                label: "⚡ 進階選項",
                children: (
                  <div className="px-6 py-4">
                    <AdvancedSettingsTab />
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </div>

      {/* 底部按鈕 */}
      <div className="border-t px-6 py-4 flex justify-between bg-gray-50">
        <Button onClick={handleReset}>重置為預設</Button>
        <div className="space-x-2">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleSave} loading={loading}>
            確定
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SettingsWindow;
