/**
 * Variant Manager
 * Task 9.3: 機種專屬內容處理 - 管理機種、生成專屬手冊、差異比較
 */

import { EventEmitter } from 'events';
import {
  ProductVariant,
  VariantSpecificContent,
  ManualStructure,
  ManualSection,
  SharedContent,
  VariantDiffReport,
  FeatureDifference,
  VariantConfig,
  ContentItem,
  VariantUtils,
} from './variant_schema';
import { SharedContentManager } from './shared_content_manager';

export class VariantManager extends EventEmitter {
  private variants: Map<string, ProductVariant> = new Map();
  private variantContents: Map<string, VariantSpecificContent[]> = new Map();
  private manuals: Map<string, ManualStructure> = new Map();
  private sharedContentManager: SharedContentManager;

  constructor(sharedContentManager: SharedContentManager) {
    super();
    this.sharedContentManager = sharedContentManager;
  }

  /**
   * 註冊新機種
   */
  async registerVariant(variant: ProductVariant): Promise<void> {
    console.log(`📝 Registering variant: ${variant.name}`);

    // 驗證
    const validation = VariantUtils.validateVariant(variant);
    if (!validation.valid) {
      throw new Error(`Invalid variant: ${validation.errors.join(', ')}`);
    }

    this.variants.set(variant.id, variant);
    this.variantContents.set(variant.id, []);

    console.log(`✅ Variant registered: ${VariantUtils.formatVariantName(variant)}`);
    this.emit('variant_registered', { variant });
  }

  /**
   * 添加機種專屬內容
   */
  async addVariantContent(
    variantId: string,
    content: Omit<VariantSpecificContent, 'id' | 'createdAt' | 'updatedAt' | 'version'>
  ): Promise<VariantSpecificContent> {
    console.log(`➕ Adding variant-specific content for ${variantId}`);

    const variant = this.variants.get(variantId);
    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }

    const variantContent: VariantSpecificContent = {
      ...content,
      id: `variant-content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const contents = this.variantContents.get(variantId) || [];
    contents.push(variantContent);
    this.variantContents.set(variantId, contents);

    this.emit('variant_content_added', { variantId, content: variantContent });

    return variantContent;
  }

  /**
   * 生成機種專屬手冊
   */
  async generateManual(
    variantId: string,
    options: {
      includeSharedContent: boolean;
      highlightDifferences: boolean;
      includeComparisonTable: boolean;
    } = {
      includeSharedContent: true,
      highlightDifferences: false,
      includeComparisonTable: false,
    }
  ): Promise<ManualStructure> {
    console.log(`📖 Generating manual for variant: ${variantId}`);

    const variant = this.variants.get(variantId);
    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }

    // 獲取共用內容
    const sharedContents = options.includeSharedContent
      ? this.sharedContentManager.getSharedContentsForVariant(variantId)
      : [];

    // 獲取專屬內容
    const variantContents = this.variantContents.get(variantId) || [];

    // 構建章節
    const sections = await this.buildManualSections(
      variantId,
      sharedContents,
      variantContents,
      options
    );

    // 創建手冊結構
    const manual: ManualStructure = {
      id: `manual-${variantId}-${Date.now()}`,
      variantId,
      title: `${variant.displayName || variant.name} User Manual`,
      version: variant.version,
      sections,
      metadata: {
        generatedAt: new Date(),
        totalSections: sections.length,
        sharedSections: sections.filter((s) => s.contentType === 'shared').length,
        exclusiveSections: sections.filter((s) => s.contentType === 'exclusive').length,
        wordCount: this.calculateWordCount(sections),
        pageCount: Math.ceil(this.calculateWordCount(sections) / 500), // 估算
      },
    };

    this.manuals.set(manual.id, manual);

    console.log(`✅ Manual generated with ${sections.length} sections`);
    this.emit('manual_generated', { manual });

    return manual;
  }

  /**
   * 構建手冊章節
   */
  private async buildManualSections(
    variantId: string,
    sharedContents: SharedContent[],
    variantContents: VariantSpecificContent[],
    options: any
  ): Promise<ManualSection[]> {
    const sections: ManualSection[] = [];

    // 添加共用章節
    let order = 1;
    for (const shared of sharedContents) {
      const section: ManualSection = {
        id: `section-shared-${shared.id}`,
        title: shared.title,
        level: 1,
        order: order++,
        contentType: 'shared',
        sharedContentId: shared.id,
        subsections: [],
        metadata: {
          wordCount: this.countWords(shared.content),
          screenshotCount: 0,
        },
      };

      sections.push(section);
    }

    // 添加專屬章節
    for (const variantContent of variantContents) {
      const contentType =
        variantContent.type === 'override' ? 'override' : 'exclusive';

      const section: ManualSection = {
        id: `section-variant-${variantContent.id}`,
        title: variantContent.title,
        level: 1,
        order: order++,
        contentType,
        variantContentId: variantContent.id,
        subsections: [],
        metadata: {
          wordCount: this.countWords(variantContent.content),
          screenshotCount: 0,
        },
      };

      sections.push(section);
    }

    // 排序章節
    sections.sort((a, b) => a.order - b.order);

    return sections;
  }

  /**
   * 計算字數
   */
  private countWords(content: ContentItem[]): number {
    return content.reduce((sum, item) => {
      const words = item.content.split(/\s+/).length;
      const childWords = item.children ? this.countWords(item.children) : 0;
      return sum + words + childWords;
    }, 0);
  }

  /**
   * 計算總字數
   */
  private calculateWordCount(sections: ManualSection[]): number {
    return sections.reduce((sum, section) => {
      const sectionWords = section.metadata.wordCount;
      const subsectionWords = section.subsections.reduce(
        (s, sub) => s + sub.metadata.wordCount,
        0
      );
      return sum + sectionWords + subsectionWords;
    }, 0);
  }

  /**
   * 比較兩個機種
   */
  async compareVariants(
    variant1Id: string,
    variant2Id: string
  ): Promise<VariantDiffReport> {
    console.log(`🔍 Comparing variants: ${variant1Id} vs ${variant2Id}`);

    const variant1 = this.variants.get(variant1Id);
    const variant2 = this.variants.get(variant2Id);

    if (!variant1 || !variant2) {
      throw new Error('One or both variants not found');
    }

    // 功能差異
    const featureDifferences = this.compareFeatures(variant1, variant2);

    // 內容差異
    const contentDifferences = this.compareContents(variant1Id, variant2Id);

    // 視覺差異（簡化版）
    const visualDifferences: any[] = [];

    // 生成摘要
    const summary = this.generateDiffSummary(featureDifferences, contentDifferences);

    const report: VariantDiffReport = {
      id: `diff-${variant1Id}-${variant2Id}-${Date.now()}`,
      variant1Id,
      variant2Id,
      generatedAt: new Date(),
      featureDifferences,
      contentDifferences,
      visualDifferences,
      summary,
    };

    console.log(`✅ Comparison completed`);
    this.emit('variants_compared', { report });

    return report;
  }

  /**
   * 比較功能
   */
  private compareFeatures(
    variant1: ProductVariant,
    variant2: ProductVariant
  ): {
    onlyInVariant1: string[];
    onlyInVariant2: string[];
    different: FeatureDifference[];
  } {
    const features1 = new Set(variant1.features);
    const features2 = new Set(variant2.features);

    const onlyInVariant1 = [...features1].filter((f) => !features2.has(f));
    const onlyInVariant2 = [...features2].filter((f) => !features1.has(f));

    const different: FeatureDifference[] = [];

    // 比較基本屬性
    if (variant1.tier !== variant2.tier) {
      different.push({
        feature: 'tier',
        variant1Value: variant1.tier,
        variant2Value: variant2.tier,
        significance: 'major',
      });
    }

    if (variant1.category !== variant2.category) {
      different.push({
        feature: 'category',
        variant1Value: variant1.category,
        variant2Value: variant2.category,
        significance: 'minor',
      });
    }

    return {
      onlyInVariant1,
      onlyInVariant2,
      different,
    };
  }

  /**
   * 比較內容
   */
  private compareContents(
    variant1Id: string,
    variant2Id: string
  ): {
    exclusive1: number;
    exclusive2: number;
    shared: number;
    modified: number;
  } {
    const contents1 = this.variantContents.get(variant1Id) || [];
    const contents2 = this.variantContents.get(variant2Id) || [];

    const sharedContents = this.sharedContentManager.getAllSharedContents();
    const shared = sharedContents.filter(
      (s) => s.applicableVariants.includes(variant1Id) && s.applicableVariants.includes(variant2Id)
    ).length;

    return {
      exclusive1: contents1.filter((c) => c.type === 'exclusive_feature').length,
      exclusive2: contents2.filter((c) => c.type === 'exclusive_feature').length,
      shared,
      modified: 0, // TODO: 實作修改檢測
    };
  }

  /**
   * 生成差異摘要
   */
  private generateDiffSummary(
    featureDiff: any,
    contentDiff: any
  ): string {
    const parts: string[] = [];

    if (featureDiff.onlyInVariant1.length > 0) {
      parts.push(`${featureDiff.onlyInVariant1.length} features exclusive to variant 1`);
    }

    if (featureDiff.onlyInVariant2.length > 0) {
      parts.push(`${featureDiff.onlyInVariant2.length} features exclusive to variant 2`);
    }

    if (contentDiff.shared > 0) {
      parts.push(`${contentDiff.shared} shared content items`);
    }

    if (featureDiff.different.length > 0) {
      parts.push(`${featureDiff.different.length} feature differences`);
    }

    return parts.join('; ');
  }

  /**
   * 獲取所有機種
   */
  getAllVariants(): ProductVariant[] {
    return Array.from(this.variants.values());
  }

  /**
   * 獲取機種
   */
  getVariant(variantId: string): ProductVariant | undefined {
    return this.variants.get(variantId);
  }

  /**
   * 獲取機種內容
   */
  getVariantContents(variantId: string): VariantSpecificContent[] {
    return this.variantContents.get(variantId) || [];
  }

  /**
   * 獲取機種手冊
   */
  getManual(variantId: string): ManualStructure | undefined {
    return Array.from(this.manuals.values()).find((m) => m.variantId === variantId);
  }

  /**
   * 更新機種
   */
  async updateVariant(
    variantId: string,
    updates: Partial<ProductVariant>
  ): Promise<ProductVariant> {
    console.log(`✏️  Updating variant: ${variantId}`);

    const variant = this.variants.get(variantId);
    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }

    Object.assign(variant, updates);
    variant.updatedAt = new Date();

    this.variants.set(variantId, variant);

    this.emit('variant_updated', { variant });

    return variant;
  }

  /**
   * 刪除機種
   */
  async deleteVariant(variantId: string): Promise<void> {
    console.log(`🗑️  Deleting variant: ${variantId}`);

    this.variants.delete(variantId);
    this.variantContents.delete(variantId);

    // 刪除相關手冊
    for (const [manualId, manual] of this.manuals.entries()) {
      if (manual.variantId === variantId) {
        this.manuals.delete(manualId);
      }
    }

    this.emit('variant_deleted', { variantId });
  }

  /**
   * 檢查機種兼容性
   */
  checkCompatibility(variant1Id: string, variant2Id: string): boolean {
    const variant1 = this.variants.get(variant1Id);
    const variant2 = this.variants.get(variant2Id);

    if (!variant1 || !variant2) return false;

    return VariantUtils.areVariantsCompatible(variant1, variant2);
  }

  /**
   * 獲取兼容的機種
   */
  getCompatibleVariants(variantId: string): ProductVariant[] {
    const variant = this.variants.get(variantId);
    if (!variant) return [];

    return Array.from(this.variants.values()).filter(
      (v) => v.id !== variantId && VariantUtils.areVariantsCompatible(variant, v)
    );
  }
}
