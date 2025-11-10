import { Form, Radio, Slider, Select, Switch } from "antd";

function ExplorationSettingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">探索策略</h3>

        <Form.Item name={["exploration", "strategy"]}>
          <Radio.Group className="flex flex-col gap-3">
            <Radio value="importance">
              <div>
                <div className="font-medium">重要性優先（推薦）⭐</div>
                <div className="text-sm text-gray-500">
                  優先探索重要功能，如按鈕、連結、表單等
                </div>
              </div>
            </Radio>
            <Radio value="bfs">
              <div>
                <div className="font-medium">廣度優先 (BFS)</div>
                <div className="text-sm text-gray-500">
                  按層級依序探索所有元素
                </div>
              </div>
            </Radio>
            <Radio value="dfs">
              <div>
                <div className="font-medium">深度優先 (DFS)</div>
                <div className="text-sm text-gray-500">
                  深入探索單一路徑後再探索其他路徑
                </div>
              </div>
            </Radio>
          </Radio.Group>
        </Form.Item>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">探索範圍</h3>

        <Form.Item name={["exploration", "max_depth"]} label="最大深度">
          <Slider
            min={1}
            max={10}
            marks={{
              1: "1",
              5: "5",
              10: "10",
            }}
            tooltip={{
              formatter: (value) => `深度: ${value}`,
            }}
          />
        </Form.Item>

        <Form.Item name={["exploration", "max_pages"]} label="最大頁面數">
          <Slider
            min={10}
            max={1000}
            marks={{
              10: "10",
              100: "100",
              1000: "1000",
            }}
            tooltip={{
              formatter: (value) => `${value} 頁`,
            }}
          />
        </Form.Item>

        <Form.Item
          name={["exploration", "screenshot_quality"]}
          label="截圖品質"
        >
          <Select>
            <Select.Option value="high">高（檔案較大）</Select.Option>
            <Select.Option value="medium">中（推薦）⭐</Select.Option>
            <Select.Option value="low">低（檔案較小）</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name={["exploration", "wait_for_network_idle"]}
          label="等待網路閒置後再截圖"
          valuePropName="checked"
          tooltip="確保動態內容載入完成"
        >
          <Switch />
        </Form.Item>
      </div>
    </div>
  );
}

export default ExplorationSettingsTab;
