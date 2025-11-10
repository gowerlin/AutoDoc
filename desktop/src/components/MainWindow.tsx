import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button, Card, Input, Select, Slider, Progress, message } from "antd";
import { SettingOutlined, PlayCircleOutlined } from "@ant-design/icons";

interface MainWindowProps {
  config: any;
  onOpenSettings: () => void;
}

interface BackendStatus {
  running: boolean;
  healthy: boolean;
}

function MainWindow({ config, onOpenSettings }: MainWindowProps) {
  const [productUrl, setProductUrl] = useState("");
  const [strategy, setStrategy] = useState("importance");
  const [maxDepth, setMaxDepth] = useState(5);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    running: false,
    healthy: false,
  });

  useEffect(() => {
    // 檢查後端狀態
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkBackendStatus = async () => {
    try {
      const status = await invoke<BackendStatus>("get_backend_status");
      setBackendStatus(status);
    } catch (error) {
      console.error("檢查後端狀態失敗:", error);
    }
  };

  const handleStartExploration = async () => {
    if (!productUrl) {
      message.error("請輸入產品 URL");
      return;
    }

    if (!backendStatus.healthy) {
      message.error("後端服務未就緒，請稍候");
      return;
    }

    message.info("探索任務已開始");
    // 這裡將調用後端 API 開始探索
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 標題欄 */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🤖</div>
          <div>
            <div className="text-lg font-semibold">{config.basic.app_name}</div>
            <div className="text-xs text-gray-500">v2.0.0</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1 rounded text-xs ${
              backendStatus.healthy
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {backendStatus.healthy ? "後端就緒" : "後端未就緒"}
          </div>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
          >
            設定
          </Button>
        </div>
      </div>

      {/* 主內容 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 新增探索任務 */}
          <Card title="📝 新增探索任務" className="shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  產品 URL
                </label>
                <Input
                  size="large"
                  placeholder="https://example.com/app"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  探索策略
                </label>
                <Select
                  size="large"
                  value={strategy}
                  onChange={setStrategy}
                  className="w-full"
                  options={[
                    {
                      value: "importance",
                      label: "重要性優先（推薦）",
                    },
                    { value: "bfs", label: "廣度優先 (BFS)" },
                    { value: "dfs", label: "深度優先 (DFS)" },
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  最大深度: {maxDepth}
                </label>
                <Slider
                  min={1}
                  max={10}
                  value={maxDepth}
                  onChange={setMaxDepth}
                  marks={{
                    1: "1",
                    5: "5",
                    10: "10",
                  }}
                />
              </div>

              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={handleStartExploration}
                block
              >
                開始探索
              </Button>
            </div>
          </Card>

          {/* 進行中的任務 */}
          <Card title="📊 進行中的任務" className="shadow-sm">
            <div className="text-center text-gray-400 py-8">
              暫無進行中的任務
            </div>
          </Card>

          {/* 已完成的專案 */}
          <Card title="📚 已完成的專案" className="shadow-sm">
            <div className="text-center text-gray-400 py-8">
              暫無已完成的專案
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default MainWindow;
