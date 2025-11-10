/**
 * Exploration Strategy Engine
 * Task 2.2: 設計探索策略引擎
 */

import { InteractiveElement, NavigationNode, ExplorationState } from '../types';
import { ExplorationError } from '../error/error_types';

export type ExplorationStrategyType = 'bfs' | 'dfs' | 'importance_first';

export interface ExplorationQueueItem {
  url: string;
  element?: InteractiveElement;
  depth: number;
  priority: number;
  parent?: string;
}

export interface ExplorationConfig {
  strategy: ExplorationStrategyType;
  maxDepth: number;
  maxPages: number;
  priorityKeywords?: string[];
  excludePatterns?: RegExp[];
}

export class ExplorationStrategy {
  private config: ExplorationConfig;
  private exploredUrls: Set<string> = new Set();
  private queue: ExplorationQueueItem[] = [];
  private urlFingerprints: Map<string, string> = new Map();

  constructor(config: ExplorationConfig) {
    this.config = {
      maxDepth: 3,
      maxPages: 100,
      priorityKeywords: ['settings', 'config', 'admin', 'manage', 'dashboard'],
      excludePatterns: [],
      ...config,
    };
  }

  /**
   * 建立探索隊列
   */
  buildExplorationQueue(
    elements: InteractiveElement[],
    currentUrl: string,
    currentDepth: number
  ): ExplorationQueueItem[] {
    const items: ExplorationQueueItem[] = [];

    // Filter out elements that lead to external sites or excluded patterns
    const filteredElements = elements.filter(el => {
      if (!el.attributes.href) return false;

      const url = this.resolveUrl(currentUrl, el.attributes.href);

      // Check if same domain
      if (!this.isSameDomain(currentUrl, url)) return false;

      // Check exclude patterns
      if (this.isExcluded(url)) return false;

      // Check if already explored
      if (this.exploredUrls.has(url)) return false;

      // Check max depth
      if (currentDepth >= this.config.maxDepth) return false;

      return true;
    });

    // Create queue items
    filteredElements.forEach(el => {
      const url = this.resolveUrl(currentUrl, el.attributes.href || '');
      const priority = this.calculatePriority(el, url);

      items.push({
        url,
        element: el,
        depth: currentDepth + 1,
        priority,
        parent: currentUrl,
      });
    });

    // Sort based on strategy
    return this.sortQueue(items);
  }

  /**
   * 添加項目到隊列
   */
  addToQueue(items: ExplorationQueueItem[]): void {
    // Check max pages limit
    const availableSlots = this.config.maxPages - this.exploredUrls.size - this.queue.length;
    const itemsToAdd = items.slice(0, Math.max(0, availableSlots));

    this.queue.push(...itemsToAdd);
    this.queue = this.sortQueue(this.queue);
  }

  /**
   * 從隊列取得下一個項目
   */
  getNext(): ExplorationQueueItem | null {
    if (this.queue.length === 0) return null;

    const item = this.queue.shift()!;

    // Mark as explored
    this.exploredUrls.add(item.url);

    return item;
  }

  /**
   * 計算探索優先級
   */
  calculatePriority(element: InteractiveElement, url: string): number {
    let priority = element.importance || 0;

    // Add priority based on keywords
    const text = element.text.toLowerCase();
    const urlLower = url.toLowerCase();

    this.config.priorityKeywords?.forEach(keyword => {
      if (text.includes(keyword) || urlLower.includes(keyword)) {
        priority += 5;
      }
    });

    // Boost priority for configuration/settings pages
    const highPriorityPatterns = [
      /setting/i,
      /config/i,
      /admin/i,
      /manage/i,
      /dashboard/i,
      /control/i,
    ];

    highPriorityPatterns.forEach(pattern => {
      if (pattern.test(text) || pattern.test(url)) {
        priority += 3;
      }
    });

    // Reduce priority for common low-value pages
    const lowPriorityPatterns = [
      /privacy/i,
      /terms/i,
      /cookie/i,
      /legal/i,
      /about/i,
      /contact/i,
    ];

    lowPriorityPatterns.forEach(pattern => {
      if (pattern.test(text) || pattern.test(url)) {
        priority -= 3;
      }
    });

    // Boost buttons over links
    if (element.type === 'button') {
      priority += 2;
    }

    return priority;
  }

  /**
   * 根據策略排序隊列
   */
  private sortQueue(items: ExplorationQueueItem[]): ExplorationQueueItem[] {
    switch (this.config.strategy) {
      case 'bfs':
        // Breadth-first: sort by depth first, then priority
        return items.sort((a, b) => {
          if (a.depth !== b.depth) return a.depth - b.depth;
          return b.priority - a.priority;
        });

      case 'dfs':
        // Depth-first: sort by depth descending, then priority
        return items.sort((a, b) => {
          if (a.depth !== b.depth) return b.depth - a.depth;
          return b.priority - a.priority;
        });

      case 'importance_first':
      default:
        // Importance first: sort by priority first, then depth
        return items.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.depth - b.depth;
        });
    }
  }

  /**
   * 檢測重複頁面（基於 URL、DOM 結構相似度）
   */
  async detectDuplicates(
    url: string,
    domStructure: string
  ): Promise<boolean> {
    // Normalize URL (remove query params that don't affect content)
    const normalizedUrl = this.normalizeUrl(url);

    // Check if URL already explored
    if (this.exploredUrls.has(normalizedUrl)) {
      return true;
    }

    // Calculate DOM fingerprint
    const fingerprint = this.calculateFingerprint(domStructure);

    // Check if similar DOM structure already seen
    for (const [existingUrl, existingFingerprint] of this.urlFingerprints.entries()) {
      if (this.calculateSimilarity(fingerprint, existingFingerprint) > 0.9) {
        console.log(`Duplicate detected: ${url} similar to ${existingUrl}`);
        return true;
      }
    }

    // Store fingerprint
    this.urlFingerprints.set(normalizedUrl, fingerprint);

    return false;
  }

  /**
   * 計算 DOM 結構的指紋
   */
  private calculateFingerprint(domStructure: string): string {
    // Simple hash function for DOM structure
    // In production, use a more sophisticated algorithm
    let hash = 0;
    for (let i = 0; i < domStructure.length; i++) {
      const char = domStructure.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * 計算相似度
   */
  private calculateSimilarity(fp1: string, fp2: string): number {
    if (fp1 === fp2) return 1.0;

    // Simple Levenshtein distance based similarity
    const maxLen = Math.max(fp1.length, fp2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(fp1, fp2);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 標準化 URL（移除不影響內容的參數）
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Remove tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Remove trailing slash
      let pathname = urlObj.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }

      // Sort search params for consistency
      const sortedParams = Array.from(urlObj.searchParams.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

      return `${urlObj.origin}${pathname}${sortedParams ? '?' + sortedParams : ''}`;
    } catch (error) {
      return url;
    }
  }

  /**
   * 檢查是否為同一域名
   */
  private isSameDomain(baseUrl: string, targetUrl: string): boolean {
    try {
      const base = new URL(baseUrl);
      const target = new URL(targetUrl);

      return base.hostname === target.hostname;
    } catch (error) {
      return false;
    }
  }

  /**
   * 檢查 URL 是否被排除
   */
  private isExcluded(url: string): boolean {
    if (!this.config.excludePatterns) return false;

    return this.config.excludePatterns.some(pattern => pattern.test(url));
  }

  /**
   * 解析相對 URL
   */
  private resolveUrl(baseUrl: string, relativeUrl: string): string {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
      return relativeUrl;
    }
  }

  /**
   * 取得當前狀態
   */
  getState(): ExplorationState {
    return {
      currentUrl: '',
      exploredUrls: this.exploredUrls,
      pendingUrls: this.queue.map(item => item.url),
      depth: 0,
      maxDepth: this.config.maxDepth,
    };
  }

  /**
   * 取得統計資訊
   */
  getStats(): {
    exploredCount: number;
    pendingCount: number;
    totalCapacity: number;
    remainingCapacity: number;
  } {
    const exploredCount = this.exploredUrls.size;
    const pendingCount = this.queue.length;
    const totalCapacity = this.config.maxPages;
    const remainingCapacity = totalCapacity - exploredCount - pendingCount;

    return {
      exploredCount,
      pendingCount,
      totalCapacity,
      remainingCapacity,
    };
  }

  /**
   * 重置策略
   */
  reset(): void {
    this.exploredUrls.clear();
    this.queue = [];
    this.urlFingerprints.clear();
  }

  /**
   * 檢查是否完成
   */
  isComplete(): boolean {
    return this.queue.length === 0 || this.exploredUrls.size >= this.config.maxPages;
  }

  /**
   * 標記 URL 為已探索
   */
  markAsExplored(url: string): void {
    this.exploredUrls.add(this.normalizeUrl(url));
  }

  /**
   * 檢查 URL 是否已探索
   */
  isExplored(url: string): boolean {
    return this.exploredUrls.has(this.normalizeUrl(url));
  }

  /**
   * 取得隊列大小
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * 取得已探索 URL 列表
   */
  getExploredUrls(): string[] {
    return Array.from(this.exploredUrls);
  }

  /**
   * 取得待探索 URL 列表
   */
  getPendingUrls(): string[] {
    return this.queue.map(item => item.url);
  }
}
