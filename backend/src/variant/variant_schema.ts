/**
 * Variant Schema
 * Task 9.1: 機種系統設計 - 定義多機種手冊的資料結構
 */

/**
 * 產品機種定義
 */
export interface ProductVariant {
  // 基本資訊
  id: string;
  name: string;
  displayName: string;
  description?: string;

  // 版本資訊
  version: string;
  firmwareVersion?: string;
  hardwareVersion?: string;

  // 分類
  category?: string;
  series?: string;
  tier?: 'basic' | 'standard' | 'premium' | 'enterprise';

  // URL 配置
  entryUrl: string;
  baseUrls: string[];

  // 特性標籤
  features: string[];
  tags: string[];

  // 元數據
  metadata: {
    releaseDate?: Date;
    eolDate?: Date;
    targetMarket?: string[];
    language?: string;
    region?: string;
  };

  // 狀態
  status: 'active' | 'deprecated' | 'beta' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 內容項目
 */
export interface ContentItem {
  id: string;
  type: 'section' | 'subsection' | 'paragraph' | 'image' | 'table' | 'list';
  title?: string;
  content: string;
  order: number;

  // 來源資訊
  sourceUrl?: string;
  sourcePageTitle?: string;
  extractedAt?: Date;

  // 關聯
  parentId?: string;
  children?: ContentItem[];

  // 元數據
  metadata: {
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    estimatedTime?: string;
    category?: string;
    tags?: string[];
  };
}

/**
 * 共用內容
 */
export interface SharedContent {
  id: string;
  title: string;
  content: ContentItem[];

  // 適用的機種
  applicableVariants: string[];

  // 相似度資訊
  similarity: {
    source: 'manual' | 'auto_detected';
    confidence: number;
    detectionMethod?: string;
  };

  // 版本控制
  version: number;
  lastModified: Date;
  modifiedBy: string;

  // 同步狀態
  syncStatus: {
    [variantId: string]: {
      synced: boolean;
      lastSyncedAt?: Date;
      needsUpdate: boolean;
    };
  };
}

/**
 * 機種專屬內容
 */
export interface VariantSpecificContent {
  id: string;
  variantId: string;
  title: string;
  content: ContentItem[];

  // 類型
  type: 'exclusive_feature' | 'variant_specific_setting' | 'custom_workflow' | 'override';

  // 如果是 override，記錄被覆寫的共用內容
  overrides?: {
    sharedContentId: string;
    reason: string;
    differences: string[];
  };

  // 版本
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 手冊結構
 */
export interface ManualStructure {
  id: string;
  variantId: string;
  title: string;
  version: string;

  // 章節結構
  sections: ManualSection[];

  // 文檔元數據
  metadata: {
    generatedAt: Date;
    totalSections: number;
    sharedSections: number;
    exclusiveSections: number;
    wordCount: number;
    pageCount: number;
  };

  // Google Docs 資訊
  googleDocsId?: string;
  publishedUrl?: string;
}

/**
 * 手冊章節
 */
export interface ManualSection {
  id: string;
  title: string;
  level: number;
  order: number;

  // 內容類型
  contentType: 'shared' | 'exclusive' | 'override';

  // 內容引用
  sharedContentId?: string;
  variantContentId?: string;

  // 子章節
  subsections: ManualSection[];

  // 元數據
  metadata: {
    pageNumber?: number;
    wordCount: number;
    screenshotCount: number;
  };
}

/**
 * 內容相似度比對結果
 */
export interface ContentSimilarity {
  id: string;
  variant1Id: string;
  variant2Id: string;
  comparedAt: Date;

  // 相似內容
  similarities: SimilarContent[];

  // 統計
  statistics: {
    totalContentItems: number;
    sharedContentCount: number;
    similarityPercentage: number;
    averageConfidence: number;
  };
}

/**
 * 相似內容項目
 */
export interface SimilarContent {
  variant1ContentId: string;
  variant2ContentId: string;

  // 相似度分數
  similarity: {
    textSimilarity: number;
    semanticSimilarity: number;
    structureSimilarity: number;
    overallSimilarity: number;
  };

  // 差異
  differences: string[];

  // 建議
  recommendation: 'merge_as_shared' | 'keep_separate' | 'needs_review';
  confidence: number;
}

/**
 * 機種配置
 */
export interface VariantConfig {
  projectId: string;
  variants: ProductVariant[];

  // 共用內容策略
  sharedContentStrategy: {
    // 自動識別閾值
    autoDetectThreshold: number;

    // 相似度計算方法
    similarityMethod: 'text' | 'semantic' | 'hybrid';

    // 同步策略
    syncStrategy: 'manual' | 'auto' | 'prompt';
  };

  // 手冊生成配置
  manualGeneration: {
    includeSharedContentLinks: boolean;
    highlightVariantDifferences: boolean;
    generateComparisonTable: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 同步操作
 */
export interface SyncOperation {
  id: string;
  type: 'update_shared' | 'sync_to_variant' | 'sync_from_variant';
  sharedContentId: string;
  affectedVariants: string[];

  // 狀態
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;

  // 結果
  result?: {
    successCount: number;
    failureCount: number;
    errors: string[];
  };

  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * 差異報告
 */
export interface VariantDiffReport {
  id: string;
  variant1Id: string;
  variant2Id: string;
  generatedAt: Date;

  // 功能差異
  featureDifferences: {
    onlyInVariant1: string[];
    onlyInVariant2: string[];
    different: FeatureDifference[];
  };

  // 內容差異
  contentDifferences: {
    exclusive1: number;
    exclusive2: number;
    shared: number;
    modified: number;
  };

  // 視覺差異
  visualDifferences: {
    url: string;
    screenshotVariant1: string;
    screenshotVariant2: string;
    differencePercentage: number;
  }[];

  // 摘要
  summary: string;
}

/**
 * 功能差異
 */
export interface FeatureDifference {
  feature: string;
  variant1Value: any;
  variant2Value: any;
  significance: 'critical' | 'major' | 'minor';
}

/**
 * 變體管理工具類
 */
export class VariantUtils {
  /**
   * 計算兩個內容項目的相似度
   */
  static calculateSimilarity(
    content1: ContentItem,
    content2: ContentItem
  ): number {
    // 文字相似度（Jaccard）
    const words1 = new Set(content1.content.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.content.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const textSimilarity = intersection.size / union.size;

    // 結構相似度
    const structureSimilarity = content1.type === content2.type ? 1 : 0;

    // 綜合相似度
    return textSimilarity * 0.7 + structureSimilarity * 0.3;
  }

  /**
   * 判斷內容是否應該共用
   */
  static shouldBeShared(
    similarity: number,
    threshold: number = 0.85
  ): boolean {
    return similarity >= threshold;
  }

  /**
   * 生成機種 ID
   */
  static generateVariantId(name: string, version: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `variant-${normalized}-${version}`;
  }

  /**
   * 驗證機種配置
   */
  static validateVariant(variant: ProductVariant): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!variant.id) errors.push('Variant ID is required');
    if (!variant.name) errors.push('Variant name is required');
    if (!variant.entryUrl) errors.push('Entry URL is required');
    if (!variant.version) errors.push('Version is required');

    try {
      new URL(variant.entryUrl);
    } catch {
      errors.push('Invalid entry URL');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 檢查兩個機種是否兼容（可以共享內容）
   */
  static areVariantsCompatible(
    variant1: ProductVariant,
    variant2: ProductVariant
  ): boolean {
    // 同系列
    if (variant1.series && variant1.series === variant2.series) return true;

    // 同分類
    if (variant1.category && variant1.category === variant2.category)
      return true;

    // 共同特性比例 > 70%
    const features1 = new Set(variant1.features);
    const features2 = new Set(variant2.features);
    const commonFeatures = new Set(
      [...features1].filter((f) => features2.has(f))
    );

    const compatibility =
      commonFeatures.size / Math.min(features1.size, features2.size);
    return compatibility > 0.7;
  }

  /**
   * 格式化機種顯示名稱
   */
  static formatVariantName(variant: ProductVariant): string {
    let name = variant.displayName || variant.name;

    if (variant.version) {
      name += ` v${variant.version}`;
    }

    if (variant.tier) {
      name += ` (${variant.tier})`;
    }

    return name;
  }
}
