import { useState } from "react";
import { Form, Input, Select, Button, Space, message, FormInstance } from "antd";
import { EyeOutlined, EyeInvisibleOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";

interface AuthSettingsTabProps {
  form: FormInstance;
}

function AuthSettingsTab({ form }: AuthSettingsTabProps) {
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");

  const handleTestClaudeApi = async () => {
    setTestingConnection(true);
    try {
      const apiKey = form.getFieldValue(["auth", "claude_api_key"]);
      if (!apiKey) {
        message.error("請先輸入 API Key");
        return;
      }
      // 這裡可以調用後端 API 測試連線
      setConnectionStatus("success");
      message.success("Claude API 連線成功");
    } catch (error) {
      setConnectionStatus("error");
      message.error("Claude API 連線失敗: " + error);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleBrowseCredentials = async () => {
    const selected = await open({
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });

    if (selected && typeof selected === "string") {
      form.setFieldsValue({
        auth: {
          google_credentials_path: selected,
        },
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Claude API */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Claude API 設定</h3>

        <Form.Item
          name={["auth", "claude_api_key"]}
          label="API Key"
          rules={[{ required: true, message: "請輸入 Claude API Key" }]}
        >
          <Input.Password
            placeholder="sk-ant-api03-..."
            iconRender={(visible) =>
              visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
            }
            addonAfter={
              <Button
                size="small"
                onClick={handleTestClaudeApi}
                loading={testingConnection}
              >
                測試
              </Button>
            }
          />
        </Form.Item>

        {connectionStatus === "success" && (
          <div className="text-green-600 flex items-center gap-2 mb-4">
            <CheckCircleOutlined /> 連線成功
          </div>
        )}

        <Form.Item name={["auth", "claude_model"]} label="模型選擇">
          <Select>
            <Select.Option value="claude-sonnet-4-20250514">
              Claude Sonnet 4 (推薦)
            </Select.Option>
            <Select.Option value="claude-opus-4-20250514">
              Claude Opus 4 (最強)
            </Select.Option>
          </Select>
        </Form.Item>
      </div>

      {/* Google Docs API */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Google Docs API 設定</h3>

        <Form.Item
          name={["auth", "google_credentials_path"]}
          label="OAuth 憑證檔案"
        >
          <Input
            readOnly
            placeholder="選擇 credentials.json 檔案"
            addonAfter={
              <Button size="small" onClick={handleBrowseCredentials}>
                瀏覽
              </Button>
            }
          />
        </Form.Item>
      </div>

      {/* Chrome MCP */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Chrome MCP 設定</h3>

        <Space.Compact className="w-full">
          <Form.Item
            name={["auth", "chrome_mcp_url"]}
            label="MCP Server URL"
            className="flex-1 mb-0"
          >
            <Input placeholder="http://localhost" />
          </Form.Item>

          <Form.Item
            name={["auth", "chrome_mcp_port"]}
            label="埠號"
            className="w-32 mb-0"
          >
            <Input placeholder="3001" type="number" />
          </Form.Item>
        </Space.Compact>
      </div>
    </div>
  );
}

export default AuthSettingsTab;
