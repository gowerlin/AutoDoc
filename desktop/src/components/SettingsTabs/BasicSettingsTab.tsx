import { Form, Input, Select, Switch } from "antd";

function BasicSettingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">應用程式設定</h3>

        <Form.Item
          name={["basic", "app_name"]}
          label="應用程式名稱"
          tooltip="顯示在標題列的名稱"
        >
          <Input placeholder="AutoDoc Agent" />
        </Form.Item>

        <Form.Item name={["basic", "language"]} label="介面語言">
          <Select>
            <Select.Option value="zh-TW">繁體中文</Select.Option>
            <Select.Option value="zh-CN">简体中文</Select.Option>
            <Select.Option value="en">English</Select.Option>
          </Select>
        </Form.Item>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">啟動選項</h3>

        <Form.Item
          name={["basic", "auto_start"]}
          label="開機自動啟動"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name={["basic", "minimize_to_tray"]}
          label="最小化到系統托盤"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name={["basic", "check_updates"]}
          label="自動檢查更新"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </div>
    </div>
  );
}

export default BasicSettingsTab;
