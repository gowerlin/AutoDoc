/**
 * Shared Content Manager
 * Task 9.2: 共用內容管理 - 識別、管理和同步共用內容
 */

import { EventEmitter } from 'events';
import {
  ProductVariant,
  ContentItem,
  SharedContent,
  ContentSimilarity,
  SimilarContent,
  SyncOperation,
  VariantUtils,
} from './variant_schema';

export interface SharedContentConfig {
  autoDetectThreshold: number;
  similarityMethod: 'text' | 'semantic' | 'hybrid';
  syncStrategy: 'manual' | 'auto' | 'prompt';
  minApplicableVariants: number;
}

export class SharedContentManager extends EventEmitter {
  private sharedContents: Map<string, SharedContent> = new Map();
  private config: SharedContentConfig;
  private syncQueue: Map<string, SyncOperation> = new Map();

  constructor(config?: Partial<SharedContentConfig>) {
    super();
    this.config = {
      autoDetectThreshold: 0.85,
      similarityMethod: 'hybrid',
      syncStrategy: 'prompt',
      minApplicableVariants: 2,
      ...config,
    };
  }

  /**
   * 自動識別共用內容
   */
  async detectSharedContent(
    variantContents: Map<string, ContentItem[]>
  ): Promise<SharedContent[]> {
    console.log(`🔍 Detecting shared content across ${variantContents.size} variants...`);

    const sharedContents: SharedContent[] = [];
    const variants = Array.from(variantContents.keys());

    // 比對所有機種組合
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const variant1Id = variants[i];
        const variant2Id = variants[j];
        const contents1 = variantContents.get(variant1Id)!;
        const contents2 = variantContents.get(variant2Id)!;

        const similarities = this.compareContents(contents1, contents2, variant1Id, variant2Id);

        // 識別高相似度內容
        for (const similar of similarities.similarities) {
          if (similar.similarity.overallSimilarity >= this.config.autoDetectThreshold) {
            const shared = await this.createSharedContent(
              similar,
              [variant1Id, variant2Id],
              variantContents
            );

            if (shared) {
              sharedContents.push(shared);
            }
          }
        }
      }
    }

    // 合併跨多個機種的共用內容
    const mergedShared = this.mergeSharedContents(sharedContents);

    console.log(`✅ Detected ${mergedShared.length} shared content items`);
    this.emit('shared_content_detected', { count: mergedShared.length, contents: mergedShared });

    return mergedShared;
  }

  /**
   * 比對兩個機種的內容
   */
  private compareContents(
    contents1: ContentItem[],
    contents2: ContentItem[],
    variant1Id: string,
    variant2Id: string
  ): ContentSimilarity {
    const similarities: SimilarContent[] = [];

    for (const content1 of contents1) {
      for (const content2 of contents2) {
        const similarity = this.calculateDetailedSimilarity(content1, content2);

        if (similarity.overallSimilarity > 0.5) {
          // 只記錄有一定相似度的
          similarities.push({
            variant1ContentId: content1.id,
            variant2ContentId: content2.id,
            similarity,
            differences: this.findDifferences(content1, content2),
            recommendation: this.getRecommendation(similarity.overallSimilarity),
            confidence: similarity.overallSimilarity,
          });
        }
      }
    }

    const sharedCount = similarities.filter(
      (s) => s.similarity.overallSimilarity >= this.config.autoDetectThreshold
    ).length;

    return {
      id: `similarity-${variant1Id}-${variant2Id}-${Date.now()}`,
      variant1Id,
      variant2Id,
      comparedAt: new Date(),
      similarities,
      statistics: {
        totalContentItems: Math.max(contents1.length, contents2.length),
        sharedContentCount: sharedCount,
        similarityPercentage: (sharedCount / Math.max(contents1.length, contents2.length)) * 100,
        averageConfidence:
          similarities.length > 0
            ? similarities.reduce((sum, s) => sum + s.confidence, 0) / similarities.length
            : 0,
      },
    };
  }

  /**
   * 計算詳細相似度
   */
  private calculateDetailedSimilarity(
    content1: ContentItem,
    content2: ContentItem
  ): {
    textSimilarity: number;
    semanticSimilarity: number;
    structureSimilarity: number;
    overallSimilarity: number;
  } {
    // 文字相似度
    const textSimilarity = VariantUtils.calculateSimilarity(content1, content2);

    // 結構相似度
    const structureSimilarity = this.calculateStructureSimilarity(content1, content2);

    // 語義相似度（簡化版，實際應使用 AI）
    const semanticSimilarity = this.calculateSemanticSimilarity(content1, content2);

    // 綜合相似度
    const overallSimilarity =
      this.config.similarityMethod === 'text'
        ? textSimilarity
        : this.config.similarityMethod === 'semantic'
        ? semanticSimilarity
        : textSimilarity * 0.4 + semanticSimilarity * 0.4 + structureSimilarity * 0.2;

    return {
      textSimilarity,
      semanticSimilarity,
      structureSimilarity,
      overallSimilarity,
    };
  }

  /**
   * 計算結構相似度
   */
  private calculateStructureSimilarity(content1: ContentItem, content2: ContentItem): number {
    let score = 0;

    // 類型相同
    if (content1.type === content2.type) score += 0.3;

    // 標題相似
    if (content1.title && content2.title) {
      const titleSimilarity = this.calculateTextSimilarity(content1.title, content2.title);
      score += titleSimilarity * 0.3;
    }

    // 子項目數量相近
    const children1Count = content1.children?.length || 0;
    const children2Count = content2.children?.length || 0;
    if (children1Count > 0 && children2Count > 0) {
      const childrenSimilarity = 1 - Math.abs(children1Count - children2Count) / Math.max(children1Count, children2Count);
      score += childrenSimilarity * 0.4;
    }

    return Math.min(score, 1);
  }

  /**
   * 計算語義相似度（簡化版）
   */
  private calculateSemanticSimilarity(content1: ContentItem, content2: ContentItem): number {
    // TODO: 實際應該使用 Claude API 來計算語義相似度
    // 這裡使用簡化的關鍵詞匹配

    const keywords1 = this.extractKeywords(content1.content);
    const keywords2 = this.extractKeywords(content2.content);

    const intersection = new Set([...keywords1].filter((k) => keywords2.has(k)));
    const union = new Set([...keywords1, ...keywords2]);

    return intersection.size / union.size;
  }

  /**
   * 提取關鍵詞
   */
  private extractKeywords(text: string): Set<string> {
    // 簡化版：移除常見詞並取長詞
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    return new Set(words.filter((w) => !stopWords.has(w)));
  }

  /**
   * 計算文字相似度
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 找出差異
   */
  private findDifferences(content1: ContentItem, content2: ContentItem): string[] {
    const differences: string[] = [];

    if (content1.type !== content2.type) {
      differences.push(`Type differs: ${content1.type} vs ${content2.type}`);
    }

    if (content1.title !== content2.title) {
      differences.push(`Title differs: "${content1.title}" vs "${content2.title}"`);
    }

    const lengthDiff = Math.abs(content1.content.length - content2.content.length);
    if (lengthDiff > content1.content.length * 0.2) {
      differences.push(`Content length differs significantly: ${lengthDiff} characters`);
    }

    return differences;
  }

  /**
   * 獲取建議
   */
  private getRecommendation(
    similarity: number
  ): 'merge_as_shared' | 'keep_separate' | 'needs_review' {
    if (similarity >= 0.9) return 'merge_as_shared';
    if (similarity >= 0.75) return 'needs_review';
    return 'keep_separate';
  }

  /**
   * 創建共用內容
   */
  private async createSharedContent(
    similar: SimilarContent,
    applicableVariants: string[],
    variantContents: Map<string, ContentItem[]>
  ): Promise<SharedContent | null> {
    // 找到內容項目
    const content1 = this.findContentById(similar.variant1ContentId, variantContents);
    const content2 = this.findContentById(similar.variant2ContentId, variantContents);

    if (!content1 || !content2) return null;

    // 合併內容（取較完整的版本）
    const mergedContent = content1.content.length >= content2.content.length ? content1 : content2;

    const shared: SharedContent = {
      id: `shared-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: mergedContent.title || 'Shared Content',
      content: [mergedContent],
      applicableVariants,
      similarity: {
        source: 'auto_detected',
        confidence: similar.similarity.overallSimilarity,
        detectionMethod: this.config.similarityMethod,
      },
      version: 1,
      lastModified: new Date(),
      modifiedBy: 'system',
      syncStatus: {},
    };

    // 初始化同步狀態
    for (const variantId of applicableVariants) {
      shared.syncStatus[variantId] = {
        synced: true,
        lastSyncedAt: new Date(),
        needsUpdate: false,
      };
    }

    return shared;
  }

  /**
   * 根據 ID 查找內容
   */
  private findContentById(
    contentId: string,
    variantContents: Map<string, ContentItem[]>
  ): ContentItem | null {
    for (const contents of variantContents.values()) {
      const found = contents.find((c) => c.id === contentId);
      if (found) return found;
    }
    return null;
  }

  /**
   * 合併共用內容
   */
  private mergeSharedContents(sharedContents: SharedContent[]): SharedContent[] {
    // TODO: 實作智能合併邏輯
    // 現在簡化為去重
    const uniqueMap = new Map<string, SharedContent>();

    for (const shared of sharedContents) {
      const key = shared.title + shared.content[0]?.content.substring(0, 50);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, shared);
      } else {
        // 合併適用機種
        const existing = uniqueMap.get(key)!;
        existing.applicableVariants = [
          ...new Set([...existing.applicableVariants, ...shared.applicableVariants]),
        ];
      }
    }

    return Array.from(uniqueMap.values()).filter(
      (s) => s.applicableVariants.length >= this.config.minApplicableVariants
    );
  }

  /**
   * 添加共用內容
   */
  async addSharedContent(shared: SharedContent): Promise<void> {
    console.log(`➕ Adding shared content: ${shared.title}`);

    this.sharedContents.set(shared.id, shared);

    this.emit('shared_content_added', { shared });
  }

  /**
   * 更新共用內容
   */
  async updateSharedContent(
    sharedId: string,
    updates: Partial<SharedContent>
  ): Promise<SharedContent> {
    console.log(`✏️  Updating shared content: ${sharedId}`);

    const shared = this.sharedContents.get(sharedId);
    if (!shared) {
      throw new Error(`Shared content ${sharedId} not found`);
    }

    // 更新內容
    Object.assign(shared, updates);
    shared.version++;
    shared.lastModified = new Date();

    // 標記所有機種需要更新
    for (const variantId of shared.applicableVariants) {
      shared.syncStatus[variantId].needsUpdate = true;
    }

    this.sharedContents.set(sharedId, shared);

    this.emit('shared_content_updated', { shared });

    // 根據策略自動同步
    if (this.config.syncStrategy === 'auto') {
      await this.syncToVariants(sharedId);
    }

    return shared;
  }

  /**
   * 同步到所有機種
   */
  async syncToVariants(sharedId: string): Promise<SyncOperation> {
    console.log(`🔄 Syncing shared content ${sharedId} to all variants...`);

    const shared = this.sharedContents.get(sharedId);
    if (!shared) {
      throw new Error(`Shared content ${sharedId} not found`);
    }

    const operation: SyncOperation = {
      id: `sync-${Date.now()}`,
      type: 'sync_to_variant',
      sharedContentId: sharedId,
      affectedVariants: shared.applicableVariants,
      status: 'in_progress',
      progress: 0,
      createdAt: new Date(),
      startedAt: new Date(),
    };

    this.syncQueue.set(operation.id, operation);

    try {
      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < shared.applicableVariants.length; i++) {
        const variantId = shared.applicableVariants[i];

        try {
          // TODO: 實際同步邏輯（更新 Google Docs）
          await this.syncToSingleVariant(sharedId, variantId);

          // 更新同步狀態
          shared.syncStatus[variantId] = {
            synced: true,
            lastSyncedAt: new Date(),
            needsUpdate: false,
          };

          successCount++;
        } catch (error) {
          failureCount++;
          errors.push(`Failed to sync to ${variantId}: ${error}`);
        }

        operation.progress = ((i + 1) / shared.applicableVariants.length) * 100;
        this.emit('sync_progress', operation);
      }

      operation.status = failureCount === 0 ? 'completed' : 'failed';
      operation.completedAt = new Date();
      operation.result = {
        successCount,
        failureCount,
        errors,
      };

      console.log(`✅ Sync completed: ${successCount} success, ${failureCount} failed`);
      this.emit('sync_completed', operation);

      return operation;
    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date();
      console.error(`❌ Sync failed:`, error);
      throw error;
    }
  }

  /**
   * 同步到單一機種
   */
  private async syncToSingleVariant(sharedId: string, variantId: string): Promise<void> {
    // TODO: 實作實際同步邏輯
    console.log(`  ↗️  Syncing ${sharedId} to variant ${variantId}`);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async operation
  }

  /**
   * 移除共用內容
   */
  async removeSharedContent(sharedId: string): Promise<void> {
    console.log(`🗑️  Removing shared content: ${sharedId}`);

    this.sharedContents.delete(sharedId);

    this.emit('shared_content_removed', { sharedId });
  }

  /**
   * 獲取所有共用內容
   */
  getAllSharedContents(): SharedContent[] {
    return Array.from(this.sharedContents.values());
  }

  /**
   * 獲取特定機種的共用內容
   */
  getSharedContentsForVariant(variantId: string): SharedContent[] {
    return Array.from(this.sharedContents.values()).filter((s) =>
      s.applicableVariants.includes(variantId)
    );
  }

  /**
   * 獲取需要同步的內容
   */
  getNeedsSyncContents(variantId: string): SharedContent[] {
    return Array.from(this.sharedContents.values()).filter(
      (s) => s.applicableVariants.includes(variantId) && s.syncStatus[variantId]?.needsUpdate
    );
  }
}
