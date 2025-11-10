import { Form, Input, Switch, Slider, Button, FormInstance } from "antd";
import { open } from "@tauri-apps/api/dialog";

interface StorageSettingsTabProps {
  form: FormInstance;
}

function StorageSettingsTab({ form }: StorageSettingsTabProps) {
  const handleBrowseDirectory = async (fieldName: string[]) => {
    const selected = await open({
      directory: true,
    });

    if (selected && typeof selected === "string") {
      form.setFieldValue(fieldName, selected);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">儲存路徑</h3>

        <Form.Item
          name={["storage", "snapshot_storage_path"]}
          label="快照儲存路徑"
        >
          <Input
            readOnly
            placeholder="~/Documents/AutoDoc/snapshots"
            addonAfter={
              <Button
                size="small"
                onClick={() =>
                  handleBrowseDirectory(["storage", "snapshot_storage_path"])
                }
              >
                瀏覽
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          name={["storage", "screenshot_storage_path"]}
          label="截圖儲存路徑"
        >
          <Input
            readOnly
            placeholder="~/Documents/AutoDoc/screenshots"
            addonAfter={
              <Button
                size="small"
                onClick={() =>
                  handleBrowseDirectory(["storage", "screenshot_storage_path"])
                }
              >
                瀏覽
              </Button>
            }
          />
        </Form.Item>

        <Form.Item name={["storage", "database_path"]} label="資料庫路徑">
          <Input
            readOnly
            placeholder="~/Documents/AutoDoc/autodoc.db"
            addonAfter={
              <Button
                size="small"
                onClick={() =>
                  handleBrowseDirectory(["storage", "database_path"])
                }
              >
                瀏覽
              </Button>
            }
          />
        </Form.Item>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">儲存選項</h3>

        <Form.Item
          name={["storage", "enable_compression"]}
          label="啟用壓縮（節省空間）"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name={["storage", "auto_cleanup"]}
          label="自動清理舊資料"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name={["storage", "retention_days"]}
          label="保留天數 (0 = 永久保留)"
        >
          <Slider
            min={0}
            max={365}
            marks={{
              0: "0",
              30: "30",
              90: "90",
              180: "180",
              365: "365",
            }}
            tooltip={{
              formatter: (value) => (value === 0 ? "永久" : `${value} 天`),
            }}
          />
        </Form.Item>
      </div>
    </div>
  );
}

export default StorageSettingsTab;
