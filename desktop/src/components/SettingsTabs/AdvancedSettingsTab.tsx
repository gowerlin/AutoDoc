import { Form, Input, Select, Slider, Switch } from "antd";

function AdvancedSettingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">日誌設定</h3>

        <Form.Item name={["advanced", "log_level"]} label="日誌等級">
          <Select>
            <Select.Option value="debug">Debug</Select.Option>
            <Select.Option value="info">Info</Select.Option>
            <Select.Option value="warn">Warn</Select.Option>
            <Select.Option value="error">Error</Select.Option>
          </Select>
        </Form.Item>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">性能設定</h3>

        <Form.Item name={["advanced", "concurrent_tabs"]} label="並行標籤頁數">
          <Slider
            min={1}
            max={5}
            marks={{
              1: "1",
              3: "3",
              5: "5",
            }}
            tooltip={{
              formatter: (value) => `${value} 個`,
            }}
          />
        </Form.Item>

        <Form.Item
          name={["advanced", "api_rate_limit"]}
          label="API 調用限制 (每分鐘)"
        >
          <Slider
            min={10}
            max={60}
            marks={{
              10: "10",
              20: "20",
              60: "60",
            }}
            tooltip={{
              formatter: (value) => `${value} 次/分`,
            }}
          />
        </Form.Item>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">其他選項</h3>

        <Form.Item
          name={["advanced", "enable_telemetry"]}
          label="啟用匿名使用統計"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item name={["advanced", "proxy_url"]} label="HTTP 代理 (選填)">
          <Input placeholder="http://proxy.example.com:8080" />
        </Form.Item>
      </div>
    </div>
  );
}

export default AdvancedSettingsTab;
