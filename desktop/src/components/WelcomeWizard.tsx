import { useState } from "react";
import { Steps, Button, Form, Input, Select, message } from "antd";
import { invoke } from "@tauri-apps/api/tauri";
import { EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";

interface WelcomeWizardProps {
  onComplete: () => void;
}

function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
  const [current, setCurrent] = useState(0);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const steps = [
    {
      title: "歡迎",
      description: "歡迎使用 AutoDoc Agent",
    },
    {
      title: "語言",
      description: "選擇介面語言",
    },
    {
      title: "Claude API",
      description: "設定 AI 服務",
    },
    {
      title: "儲存路徑",
      description: "選擇資料儲存位置",
    },
    {
      title: "完成",
      description: "開始使用",
    },
  ];

  const next = () => {
    setCurrent(current + 1);
  };

  const prev = () => {
    setCurrent(current - 1);
  };

  const handleFinish = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();

      // 取得預設配置
      const defaultConfig = await invoke("get_default_config");

      // 合併用戶輸入的配置
      const config = {
        ...defaultConfig,
        basic: {
          ...defaultConfig.basic,
          language: values.language || "zh-TW",
        },
        auth: {
          ...defaultConfig.auth,
          claude_api_key: values.claude_api_key || "",
          claude_model: values.claude_model || "claude-sonnet-4-20250514",
        },
      };

      // 保存配置
      await invoke("save_config", { config });

      message.success("設定完成！");
      onComplete();
    } catch (error) {
      message.error("保存設定失敗: " + error);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (current) {
      case 0:
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-6">🤖</div>
            <h2 className="text-3xl font-bold mb-4">
              歡迎使用 AutoDoc Agent
            </h2>
            <p className="text-gray-600 text-lg mb-8">
              智能探索式使用手冊生成器
            </p>
            <p className="text-gray-500">
              讓我們花幾分鐘時間完成初始設定
            </p>
          </div>
        );

      case 1:
        return (
          <div className="py-8 max-w-md mx-auto">
            <h3 className="text-2xl font-semibold mb-6 text-center">
              選擇介面語言
            </h3>
            <Form.Item name="language" initialValue="zh-TW">
              <Select size="large">
                <Select.Option value="zh-TW">🇹🇼 繁體中文</Select.Option>
                <Select.Option value="zh-CN">🇨🇳 简体中文</Select.Option>
                <Select.Option value="en">🇺🇸 English</Select.Option>
              </Select>
            </Form.Item>
            <p className="text-gray-500 text-sm text-center mt-4">
              您可以稍後在設定中更改語言
            </p>
          </div>
        );

      case 2:
        return (
          <div className="py-8 max-w-md mx-auto">
            <h3 className="text-2xl font-semibold mb-6 text-center">
              設定 Claude API
            </h3>
            <Form.Item
              name="claude_api_key"
              label="Claude API Key"
              rules={[
                { required: true, message: "請輸入 API Key" },
                {
                  pattern: /^sk-/,
                  message: "API Key 格式不正確",
                },
              ]}
            >
              <Input.Password
                size="large"
                placeholder="sk-ant-api03-..."
                iconRender={(visible) =>
                  visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
                }
              />
            </Form.Item>

            <Form.Item name="claude_model" label="模型選擇" initialValue="claude-sonnet-4-20250514">
              <Select size="large">
                <Select.Option value="claude-sonnet-4-20250514">
                  Claude Sonnet 4 (推薦)
                </Select.Option>
                <Select.Option value="claude-opus-4-20250514">
                  Claude Opus 4 (最強)
                </Select.Option>
              </Select>
            </Form.Item>

            <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-4">
              <p className="text-sm text-blue-800">
                💡 提示：您需要有 Anthropic API 帳號才能使用此服務。
                <br />
                前往{" "}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  className="text-blue-600 underline"
                >
                  Anthropic Console
                </a>{" "}
                取得 API Key
              </p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="py-8 max-w-md mx-auto">
            <h3 className="text-2xl font-semibold mb-6 text-center">
              儲存路徑設定
            </h3>
            <div className="bg-gray-50 border rounded p-6 text-center">
              <div className="text-4xl mb-4">💾</div>
              <p className="text-gray-700 mb-2">
                預設儲存位置：
              </p>
              <p className="text-sm text-gray-600 font-mono">
                ~/Documents/AutoDoc/
              </p>
              <p className="text-xs text-gray-500 mt-4">
                您可以稍後在設定中更改儲存路徑
              </p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-6">✅</div>
            <h2 className="text-3xl font-bold mb-4">設定完成！</h2>
            <p className="text-gray-600 text-lg mb-8">
              您已經完成所有必要的設定
            </p>
            <div className="bg-green-50 border border-green-200 rounded p-6 max-w-md mx-auto">
              <h4 className="font-semibold mb-2 text-green-800">下一步：</h4>
              <ul className="text-left text-sm text-green-700 space-y-1">
                <li>• 探索您的產品網站</li>
                <li>• 自動生成使用手冊</li>
                <li>• 匯出為 Google Docs</li>
              </ul>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* 標題欄 */}
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">初始設定精靈</h1>
      </div>

      {/* 步驟指示器 */}
      <div className="px-12 py-6 border-b">
        <Steps current={current} items={steps} />
      </div>

      {/* 內容區域 */}
      <div className="flex-1 overflow-auto px-6">
        <Form form={form} layout="vertical" className="h-full">
          {renderStepContent()}
        </Form>
      </div>

      {/* 底部按鈕 */}
      <div className="border-t px-6 py-4 flex justify-between bg-gray-50">
        <div>
          {current > 0 && (
            <Button size="large" onClick={prev}>
              上一步
            </Button>
          )}
        </div>
        <div>
          {current < steps.length - 1 && (
            <Button type="primary" size="large" onClick={next}>
              下一步
            </Button>
          )}
          {current === steps.length - 1 && (
            <Button
              type="primary"
              size="large"
              onClick={handleFinish}
              loading={loading}
            >
              完成設定
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WelcomeWizard;
