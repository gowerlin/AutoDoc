/**
 * Snapshot Schema Definition
 * Task 8.1: 定義專案快照的完整資料結構
 */

/**
 * 專案快照 - 完整的專案狀態記錄
 */
export interface ProjectSnapshot {
  // 基本資訊
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: Date;
  createdBy: string;

  // 版本資訊
  version: SemanticVersion;
  tags: string[];
  metadata: SnapshotMetadata;

  // 探索資料
  explorationData: ExplorationData;

  // 內容資料
  contentData: ContentData;

  // 統計資訊
  statistics: SnapshotStatistics;

  // 檔案資訊
  files: SnapshotFiles;
}

/**
 * 語義化版本號
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  preRelease?: string;
  buildMetadata?: string;
}

/**
 * 快照元數據
 */
export interface SnapshotMetadata {
  // 產品資訊
  productName?: string;
  productVersion?: string;
  releaseDate?: Date;

  // 網站資訊
  entryUrl: string;
  baseDomain: string;
  siteName?: string;

  // 探索配置
  explorationConfig: {
    strategy: 'bfs' | 'dfs' | 'importance';
    maxDepth: number;
    maxPages: number;
    screenshotQuality: 'high' | 'medium' | 'low';
  };

  // 文檔資訊
  manualDocId?: string;
  manualTitle?: string;

  // 自訂欄位
  customFields?: Record<string, any>;
}

/**
 * 探索資料
 */
export interface ExplorationData {
  // 探索樹
  tree: ExplorationTreeNode;

  // 頁面資料
  pages: Map<string, PageData>;

  // DOM 基線資料
  domBaselines: Map<string, DOMBaseline>;

  // 截圖資料
  screenshots: Map<string, ScreenshotData>;

  // 探索路徑
  explorationPaths: ExplorationPath[];
}

/**
 * 探索樹節點
 */
export interface ExplorationTreeNode {
  id: string;
  url: string;
  title: string;
  depth: number;
  status: 'completed' | 'in_progress' | 'pending' | 'error';
  children: ExplorationTreeNode[];
  parent?: string;
  timestamp: Date;
}

/**
 * 頁面資料
 */
export interface PageData {
  url: string;
  title: string;
  description?: string;

  // DOM 資訊
  html: string;
  elements: ElementInfo[];

  // 互動元素
  interactiveElements: InteractiveElement[];

  // 表單
  forms: FormInfo[];

  // 導航結構
  navigation: NavigationStructure;

  // 頁面元數據
  metadata: {
    timestamp: Date;
    loadTime: number;
    viewport: { width: number; height: number };
    userAgent: string;
  };
}

/**
 * 元素資訊
 */
export interface ElementInfo {
  selector: string;
  tagName: string;
  textContent: string;
  attributes: Record<string, string>;
  position: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  importance: number;
}

/**
 * 互動元素
 */
export interface InteractiveElement {
  type: 'button' | 'link' | 'tab' | 'dropdown' | 'input' | 'checkbox' | 'radio';
  selector: string;
  label: string;
  action?: string;
  targetUrl?: string;
  importance: number;
}

/**
 * 表單資訊
 */
export interface FormInfo {
  selector: string;
  action: string;
  method: string;
  fields: FormField[];
}

/**
 * 表單欄位
 */
export interface FormField {
  name: string;
  type: string;
  label?: string;
  required: boolean;
  placeholder?: string;
  validationRules?: string[];
}

/**
 * 導航結構
 */
export interface NavigationStructure {
  topNav: NavigationItem[];
  sidebar: NavigationItem[];
  breadcrumbs: string[];
  footer: NavigationItem[];
}

/**
 * 導航項目
 */
export interface NavigationItem {
  label: string;
  url: string;
  children?: NavigationItem[];
}

/**
 * DOM 基線
 */
export interface DOMBaseline {
  url: string;
  structure: {
    hash: string;
    elementCount: number;
    interactiveElementCount: number;
    formCount: number;
    linkCount: number;
  };
  elements: ElementSnapshot[];
  capturedAt: Date;
}

/**
 * 元素快照
 */
export interface ElementSnapshot {
  selector: string;
  tagName: string;
  textContent: string;
  attributes: Record<string, string>;
  position: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
}

/**
 * 截圖資料
 */
export interface ScreenshotData {
  url: string;
  screenshot: Buffer;
  thumbnail?: Buffer;
  timestamp: Date;
  dimensions: { width: number; height: number };
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

/**
 * 探索路徑
 */
export interface ExplorationPath {
  id: string;
  startUrl: string;
  endUrl: string;
  steps: ExplorationStep[];
  purpose?: string;
}

/**
 * 探索步驟
 */
export interface ExplorationStep {
  action: 'navigate' | 'click' | 'input' | 'scroll' | 'wait';
  target?: string;
  value?: string;
  timestamp: Date;
  screenshotBefore?: string;
  screenshotAfter?: string;
}

/**
 * 內容資料
 */
export interface ContentData {
  // 生成的內容
  sections: ContentSection[];

  // AI 分析結果
  aiAnalysis: AIAnalysisResult[];

  // 術語庫
  terminology: TerminologyEntry[];

  // 內容元數據
  metadata: {
    totalSections: number;
    totalWords: number;
    totalImages: number;
    generatedAt: Date;
  };
}

/**
 * 內容章節
 */
export interface ContentSection {
  id: string;
  title: string;
  level: number;
  content: string;
  sourceUrl?: string;
  screenshots: string[];
  subsections: ContentSection[];
  metadata: {
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedTime: string;
    category?: string;
    tags?: string[];
  };
}

/**
 * AI 分析結果
 */
export interface AIAnalysisResult {
  url: string;
  type: 'functionality' | 'steps' | 'ui_elements';
  analysis: {
    functionality?: FunctionalityDescription;
    steps?: StepGuide[];
    uiElements?: UIElementDescription[];
  };
  timestamp: Date;
  model: string;
}

/**
 * 功能描述
 */
export interface FunctionalityDescription {
  name: string;
  purpose: string;
  preconditions?: string[];
  actions: string[];
  results: string[];
  category?: string;
}

/**
 * 步驟指南
 */
export interface StepGuide {
  stepNumber: number;
  action: string;
  target?: string;
  expectedResult?: string;
  warning?: string;
  screenshot?: string;
}

/**
 * UI 元素描述
 */
export interface UIElementDescription {
  element: string;
  description: string;
  purpose: string;
  interactions?: string[];
}

/**
 * 術語條目
 */
export interface TerminologyEntry {
  term: string;
  definition: string;
  category?: string;
  synonyms?: string[];
  usage?: string;
  frequency: number;
}

/**
 * 快照統計
 */
export interface SnapshotStatistics {
  // 探索統計
  exploration: {
    totalPages: number;
    exploredPages: number;
    pendingPages: number;
    errorPages: number;
    totalDepth: number;
    explorationTime: number;
  };

  // 內容統計
  content: {
    totalSections: number;
    totalWords: number;
    totalScreenshots: number;
    totalTerms: number;
  };

  // 檔案統計
  files: {
    totalSize: number;
    compressedSize: number;
    compressionRatio: number;
    fileCount: number;
  };
}

/**
 * 快照檔案
 */
export interface SnapshotFiles {
  // 主檔案
  manifestFile: string;

  // 資料檔案
  dataFiles: {
    exploration: string;
    content: string;
    screenshots: string;
    metadata: string;
  };

  // 壓縮檔案
  archiveFile?: string;

  // 匯出檔案
  exports?: {
    markdown?: string;
    pdf?: string;
    html?: string;
  };
}

/**
 * 快照差異
 */
export interface SnapshotDiff {
  // 基本資訊
  id: string;
  snapshot1Id: string;
  snapshot2Id: string;
  comparedAt: Date;

  // 版本資訊
  version1: SemanticVersion;
  version2: SemanticVersion;

  // 差異摘要
  summary: DiffSummary;

  // 詳細差異
  details: {
    pages: PageDiff[];
    content: ContentDiff[];
    structure: StructureDiff[];
  };

  // 嚴重度
  severity: {
    critical: number;
    major: number;
    minor: number;
    total: number;
  };
}

/**
 * 差異摘要
 */
export interface DiffSummary {
  totalChanges: number;
  pagesAdded: number;
  pagesRemoved: number;
  pagesModified: number;
  contentAdded: number;
  contentRemoved: number;
  contentModified: number;
  visualChanges: number;
}

/**
 * 頁面差異
 */
export interface PageDiff {
  url: string;
  changeType: 'added' | 'removed' | 'modified';
  domChanges: DOMChange[];
  visualChanges: VisualChange[];
  severity: 'critical' | 'major' | 'minor';
}

/**
 * DOM 變更
 */
export interface DOMChange {
  type: 'added' | 'removed' | 'modified';
  selector: string;
  before?: ElementSnapshot;
  after?: ElementSnapshot;
  description: string;
  severity: 'critical' | 'major' | 'minor';
}

/**
 * 視覺變更
 */
export interface VisualChange {
  type: 'visual';
  url: string;
  differencePercentage: number;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  diffImage?: Buffer;
}

/**
 * 內容差異
 */
export interface ContentDiff {
  sectionId: string;
  changeType: 'added' | 'removed' | 'modified';
  before?: string;
  after?: string;
  similarity?: number;
}

/**
 * 結構差異
 */
export interface StructureDiff {
  type: 'navigation' | 'form' | 'interaction';
  changeType: 'added' | 'removed' | 'modified';
  description: string;
  impact: 'high' | 'medium' | 'low';
}

/**
 * 更新策略
 */
export interface UpdateStrategy {
  id: string;
  name: string;
  description: string;

  // 策略類型
  type: 'full_regenerate' | 'incremental_update' | 'manual_review' | 'no_action';

  // 估算
  estimation: {
    time: string;
    pagesAffected: number;
    effort: 'low' | 'medium' | 'high';
    cost?: number;
  };

  // 建議操作
  recommendedActions: RecommendedAction[];

  // 風險評估
  risks: Risk[];

  // 優先級
  priority: number;
}

/**
 * 建議操作
 */
export interface RecommendedAction {
  action: 'reexplore' | 'update_content' | 'update_screenshots' | 'add_section' | 'remove_section';
  target: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * 風險
 */
export interface Risk {
  type: 'data_loss' | 'inconsistency' | 'breaking_change' | 'quality_degradation';
  description: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  mitigation?: string;
}

/**
 * 快照比對報告
 */
export interface ComparisonReport {
  id: string;
  title: string;
  createdAt: Date;

  // 比對的快照
  snapshot1: {
    id: string;
    version: SemanticVersion;
    name: string;
  };
  snapshot2: {
    id: string;
    version: SemanticVersion;
    name: string;
  };

  // 差異資訊
  diff: SnapshotDiff;

  // 更新策略
  recommendedStrategy: UpdateStrategy;
  alternativeStrategies: UpdateStrategy[];

  // 報告內容
  sections: ReportSection[];

  // 匯出格式
  exports: {
    markdown?: string;
    html?: string;
    pdf?: string;
    json?: string;
  };
}

/**
 * 報告章節
 */
export interface ReportSection {
  title: string;
  content: string;
  type: 'summary' | 'changes' | 'recommendations' | 'risks' | 'appendix';
  data?: any;
}

/**
 * 序列化工具類
 */
export class SnapshotSerializer {
  /**
   * 序列化快照為 JSON
   */
  static serialize(snapshot: ProjectSnapshot): string {
    return JSON.stringify(
      {
        ...snapshot,
        createdAt: snapshot.createdAt.toISOString(),
        explorationData: {
          ...snapshot.explorationData,
          pages: Array.from(snapshot.explorationData.pages.entries()),
          domBaselines: Array.from(snapshot.explorationData.domBaselines.entries()),
          screenshots: Array.from(snapshot.explorationData.screenshots.entries()).map(
            ([url, data]) => [
              url,
              {
                ...data,
                screenshot: data.screenshot.toString('base64'),
                thumbnail: data.thumbnail?.toString('base64'),
                timestamp: data.timestamp.toISOString(),
              },
            ]
          ),
        },
      },
      null,
      2
    );
  }

  /**
   * 反序列化 JSON 為快照
   */
  static deserialize(json: string): ProjectSnapshot {
    const data = JSON.parse(json);

    return {
      ...data,
      createdAt: new Date(data.createdAt),
      explorationData: {
        ...data.explorationData,
        pages: new Map(data.explorationData.pages),
        domBaselines: new Map(data.explorationData.domBaselines),
        screenshots: new Map(
          data.explorationData.screenshots.map(
            ([url, data]: [string, any]) => [
              url,
              {
                ...data,
                screenshot: Buffer.from(data.screenshot, 'base64'),
                thumbnail: data.thumbnail ? Buffer.from(data.thumbnail, 'base64') : undefined,
                timestamp: new Date(data.timestamp),
              },
            ]
          )
        ),
      },
    };
  }

  /**
   * 驗證快照資料
   */
  static validate(snapshot: ProjectSnapshot): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 基本欄位驗證
    if (!snapshot.id) errors.push('Missing snapshot ID');
    if (!snapshot.projectId) errors.push('Missing project ID');
    if (!snapshot.name) errors.push('Missing snapshot name');
    if (!snapshot.version) errors.push('Missing version');

    // 版本號驗證
    if (snapshot.version) {
      if (
        typeof snapshot.version.major !== 'number' ||
        typeof snapshot.version.minor !== 'number' ||
        typeof snapshot.version.patch !== 'number'
      ) {
        errors.push('Invalid semantic version');
      }
    }

    // 探索資料驗證
    if (!snapshot.explorationData) {
      errors.push('Missing exploration data');
    } else {
      if (!snapshot.explorationData.tree) errors.push('Missing exploration tree');
      if (!snapshot.explorationData.pages || snapshot.explorationData.pages.size === 0) {
        errors.push('No pages in snapshot');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 版本號工具類
 */
export class VersionUtils {
  /**
   * 將語義化版本轉為字串
   */
  static toString(version: SemanticVersion): string {
    let versionString = `${version.major}.${version.minor}.${version.patch}`;
    if (version.preRelease) versionString += `-${version.preRelease}`;
    if (version.buildMetadata) versionString += `+${version.buildMetadata}`;
    return versionString;
  }

  /**
   * 解析版本號字串
   */
  static parse(versionString: string): SemanticVersion {
    const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;
    const match = versionString.match(regex);

    if (!match) {
      throw new Error(`Invalid version string: ${versionString}`);
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      preRelease: match[4],
      buildMetadata: match[5],
    };
  }

  /**
   * 比較兩個版本
   */
  static compare(v1: SemanticVersion, v2: SemanticVersion): number {
    if (v1.major !== v2.major) return v1.major - v2.major;
    if (v1.minor !== v2.minor) return v1.minor - v2.minor;
    if (v1.patch !== v2.patch) return v1.patch - v2.patch;

    // Pre-release 版本比較
    if (v1.preRelease && !v2.preRelease) return -1;
    if (!v1.preRelease && v2.preRelease) return 1;
    if (v1.preRelease && v2.preRelease) {
      return v1.preRelease.localeCompare(v2.preRelease);
    }

    return 0;
  }

  /**
   * 遞增版本號
   */
  static increment(
    version: SemanticVersion,
    type: 'major' | 'minor' | 'patch'
  ): SemanticVersion {
    const newVersion = { ...version };

    switch (type) {
      case 'major':
        newVersion.major++;
        newVersion.minor = 0;
        newVersion.patch = 0;
        break;
      case 'minor':
        newVersion.minor++;
        newVersion.patch = 0;
        break;
      case 'patch':
        newVersion.patch++;
        break;
    }

    // 清除 pre-release 和 build metadata
    delete newVersion.preRelease;
    delete newVersion.buildMetadata;

    return newVersion;
  }
}
