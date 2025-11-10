/**
 * Diff Engine
 * Task 8.3: 差異檢測引擎 - 比對兩個快照的差異
 */

import { EventEmitter } from 'events';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import {
  ProjectSnapshot,
  SnapshotDiff,
  DiffSummary,
  PageDiff,
  DOMChange,
  VisualChange,
  ContentDiff,
  StructureDiff,
  ElementSnapshot,
  PageData,
} from './snapshot_schema';

export interface DiffOptions {
  includeDOMDiff: boolean;
  includeVisualDiff: boolean;
  includeContentDiff: boolean;
  includeStructureDiff: boolean;
  visualThreshold: number; // pixelmatch threshold (0-1)
  minDifferencePercent: number; // minimum visual difference to report
}

export class DiffEngine extends EventEmitter {
  private defaultOptions: DiffOptions = {
    includeDOMDiff: true,
    includeVisualDiff: true,
    includeContentDiff: true,
    includeStructureDiff: true,
    visualThreshold: 0.1,
    minDifferencePercent: 0.5,
  };

  /**
   * 比對兩個快照
   */
  async compareSnapshots(
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot,
    options?: Partial<DiffOptions>
  ): Promise<SnapshotDiff> {
    console.log(`🔍 Comparing snapshots: ${snapshot1.id} vs ${snapshot2.id}`);
    const startTime = Date.now();

    const opts = { ...this.defaultOptions, ...options };

    try {
      // 收集所有頁面 URL
      const urls1 = new Set(snapshot1.explorationData.pages.keys());
      const urls2 = new Set(snapshot2.explorationData.pages.keys());
      const allUrls = new Set([...urls1, ...urls2]);

      // 比對每個頁面
      const pageDiffs: PageDiff[] = [];

      for (const url of allUrls) {
        const pageDiff = await this.comparePage(url, snapshot1, snapshot2, opts);
        if (pageDiff) {
          pageDiffs.push(pageDiff);
        }
      }

      // 比對內容
      const contentDiffs = opts.includeContentDiff
        ? this.compareContent(snapshot1, snapshot2)
        : [];

      // 比對結構
      const structureDiffs = opts.includeStructureDiff
        ? this.compareStructure(snapshot1, snapshot2)
        : [];

      // 計算摘要
      const summary = this.calculateSummary(pageDiffs, contentDiffs);

      // 計算嚴重度
      const severity = this.calculateSeverity(pageDiffs);

      const diff: SnapshotDiff = {
        id: `diff-${Date.now()}`,
        snapshot1Id: snapshot1.id,
        snapshot2Id: snapshot2.id,
        comparedAt: new Date(),
        version1: snapshot1.version,
        version2: snapshot2.version,
        summary,
        details: {
          pages: pageDiffs,
          content: contentDiffs,
          structure: structureDiffs,
        },
        severity,
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Comparison complete in ${duration}ms`);
      console.log(`  📊 Total changes: ${summary.totalChanges}`);
      console.log(`  📄 Pages: ${summary.pagesAdded} added, ${summary.pagesRemoved} removed, ${summary.pagesModified} modified`);
      console.log(`  ⚠️  Severity: ${severity.critical} critical, ${severity.major} major, ${severity.minor} minor`);

      this.emit('comparison_complete', { diff, duration });

      return diff;
    } catch (error) {
      console.error('❌ Comparison failed:', error);
      throw error;
    }
  }

  /**
   * 比對單個頁面
   */
  private async comparePage(
    url: string,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot,
    options: DiffOptions
  ): Promise<PageDiff | null> {
    const page1 = snapshot1.explorationData.pages.get(url);
    const page2 = snapshot2.explorationData.pages.get(url);

    // 判斷頁面變更類型
    let changeType: 'added' | 'removed' | 'modified';
    if (!page1 && page2) {
      changeType = 'added';
    } else if (page1 && !page2) {
      changeType = 'removed';
    } else if (page1 && page2) {
      changeType = 'modified';
    } else {
      return null;
    }

    // DOM 比對
    const domChanges: DOMChange[] = [];
    if (options.includeDOMDiff && page1 && page2) {
      domChanges.push(...this.compareDOMStructure(page1, page2));
    }

    // 視覺比對
    const visualChanges: VisualChange[] = [];
    if (options.includeVisualDiff && page1 && page2) {
      const screenshot1 = snapshot1.explorationData.screenshots.get(url);
      const screenshot2 = snapshot2.explorationData.screenshots.get(url);

      if (screenshot1 && screenshot2) {
        const visualChange = await this.compareScreenshots(
          url,
          screenshot1.screenshot,
          screenshot2.screenshot,
          options.visualThreshold,
          options.minDifferencePercent
        );

        if (visualChange) {
          visualChanges.push(visualChange);
        }
      }
    }

    // 如果沒有任何變更，返回 null
    if (changeType === 'modified' && domChanges.length === 0 && visualChanges.length === 0) {
      return null;
    }

    // 計算嚴重度
    const severity = this.determinePageSeverity(changeType, domChanges, visualChanges);

    return {
      url,
      changeType,
      domChanges,
      visualChanges,
      severity,
    };
  }

  /**
   * 比對 DOM 結構
   */
  private compareDOMStructure(page1: PageData, page2: PageData): DOMChange[] {
    const changes: DOMChange[] = [];

    // 建立元素映射
    const elements1 = new Map(page1.elements.map((el) => [el.selector, el]));
    const elements2 = new Map(page2.elements.map((el) => [el.selector, el]));

    // 檢測新增的元素
    for (const [selector, element] of elements2) {
      if (!elements1.has(selector)) {
        changes.push({
          type: 'added',
          selector,
          after: {
            selector: element.selector,
            tagName: element.tagName,
            textContent: element.textContent,
            attributes: element.attributes,
            position: element.position,
            isVisible: element.isVisible,
          },
          description: `New element: ${element.tagName} - "${element.textContent.substring(0, 50)}"`,
          severity: this.determineDOMChangeSeverity('added', element.tagName),
        });
      }
    }

    // 檢測刪除和修改的元素
    for (const [selector, element] of elements1) {
      if (!elements2.has(selector)) {
        changes.push({
          type: 'removed',
          selector,
          before: {
            selector: element.selector,
            tagName: element.tagName,
            textContent: element.textContent,
            attributes: element.attributes,
            position: element.position,
            isVisible: element.isVisible,
          },
          description: `Removed element: ${element.tagName} - "${element.textContent.substring(0, 50)}"`,
          severity: this.determineDOMChangeSeverity('removed', element.tagName),
        });
      } else {
        const element2 = elements2.get(selector)!;
        const elementChanges = this.compareElements(element, element2);

        if (elementChanges.length > 0) {
          changes.push({
            type: 'modified',
            selector,
            before: {
              selector: element.selector,
              tagName: element.tagName,
              textContent: element.textContent,
              attributes: element.attributes,
              position: element.position,
              isVisible: element.isVisible,
            },
            after: {
              selector: element2.selector,
              tagName: element2.tagName,
              textContent: element2.textContent,
              attributes: element2.attributes,
              position: element2.position,
              isVisible: element2.isVisible,
            },
            description: `Modified: ${elementChanges.join(', ')}`,
            severity: this.determineDOMChangeSeverity('modified', element.tagName),
          });
        }
      }
    }

    return changes;
  }

  /**
   * 比對兩個元素
   */
  private compareElements(el1: any, el2: any): string[] {
    const changes: string[] = [];

    if (el1.textContent !== el2.textContent) {
      changes.push('text content');
    }

    if (JSON.stringify(el1.attributes) !== JSON.stringify(el2.attributes)) {
      changes.push('attributes');
    }

    if (JSON.stringify(el1.position) !== JSON.stringify(el2.position)) {
      changes.push('position');
    }

    if (el1.isVisible !== el2.isVisible) {
      changes.push('visibility');
    }

    return changes;
  }

  /**
   * 比對截圖
   */
  private async compareScreenshots(
    url: string,
    screenshot1: Buffer,
    screenshot2: Buffer,
    threshold: number,
    minDifferencePercent: number
  ): Promise<VisualChange | null> {
    try {
      const img1 = PNG.sync.read(screenshot1);
      const img2 = PNG.sync.read(screenshot2);

      // 尺寸不同，視為完全不同
      if (img1.width !== img2.width || img1.height !== img2.height) {
        return {
          type: 'visual',
          url,
          differencePercentage: 100,
          severity: 'critical',
          description: 'Screenshot dimensions changed',
        };
      }

      // 建立 diff 圖像
      const diff = new PNG({ width: img1.width, height: img1.height });

      const numDiffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        img1.width,
        img1.height,
        { threshold }
      );

      const totalPixels = img1.width * img1.height;
      const differencePercentage = (numDiffPixels / totalPixels) * 100;

      // 如果差異太小，忽略
      if (differencePercentage < minDifferencePercent) {
        return null;
      }

      return {
        type: 'visual',
        url,
        differencePercentage,
        severity: this.determineVisualSeverity(differencePercentage),
        description: `Visual difference: ${differencePercentage.toFixed(2)}%`,
        diffImage: PNG.sync.write(diff),
      };
    } catch (error) {
      console.error(`Failed to compare screenshots for ${url}:`, error);
      return null;
    }
  }

  /**
   * 比對內容
   */
  private compareContent(snapshot1: ProjectSnapshot, snapshot2: ProjectSnapshot): ContentDiff[] {
    const diffs: ContentDiff[] = [];

    const sections1 = new Map(snapshot1.contentData.sections.map((s) => [s.id, s]));
    const sections2 = new Map(snapshot2.contentData.sections.map((s) => [s.id, s]));

    // 新增的章節
    for (const [id, section] of sections2) {
      if (!sections1.has(id)) {
        diffs.push({
          sectionId: id,
          changeType: 'added',
          after: section.content,
        });
      }
    }

    // 刪除和修改的章節
    for (const [id, section] of sections1) {
      if (!sections2.has(id)) {
        diffs.push({
          sectionId: id,
          changeType: 'removed',
          before: section.content,
        });
      } else {
        const section2 = sections2.get(id)!;
        if (section.content !== section2.content) {
          const similarity = this.calculateSimilarity(section.content, section2.content);
          diffs.push({
            sectionId: id,
            changeType: 'modified',
            before: section.content,
            after: section2.content,
            similarity,
          });
        }
      }
    }

    return diffs;
  }

  /**
   * 比對結構
   */
  private compareStructure(snapshot1: ProjectSnapshot, snapshot2: ProjectSnapshot): StructureDiff[] {
    const diffs: StructureDiff[] = [];

    // 比對導航結構
    // TODO: Implement navigation structure comparison

    // 比對表單結構
    // TODO: Implement form structure comparison

    // 比對互動元素
    // TODO: Implement interaction element comparison

    return diffs;
  }

  /**
   * 計算摘要
   */
  private calculateSummary(pageDiffs: PageDiff[], contentDiffs: ContentDiff[]): DiffSummary {
    const pagesAdded = pageDiffs.filter((d) => d.changeType === 'added').length;
    const pagesRemoved = pageDiffs.filter((d) => d.changeType === 'removed').length;
    const pagesModified = pageDiffs.filter((d) => d.changeType === 'modified').length;

    const contentAdded = contentDiffs.filter((d) => d.changeType === 'added').length;
    const contentRemoved = contentDiffs.filter((d) => d.changeType === 'removed').length;
    const contentModified = contentDiffs.filter((d) => d.changeType === 'modified').length;

    const visualChanges = pageDiffs.reduce((sum, diff) => sum + diff.visualChanges.length, 0);

    const totalChanges =
      pagesAdded +
      pagesRemoved +
      pagesModified +
      contentAdded +
      contentRemoved +
      contentModified +
      visualChanges;

    return {
      totalChanges,
      pagesAdded,
      pagesRemoved,
      pagesModified,
      contentAdded,
      contentRemoved,
      contentModified,
      visualChanges,
    };
  }

  /**
   * 計算嚴重度統計
   */
  private calculateSeverity(pageDiffs: PageDiff[]): { critical: number; major: number; minor: number; total: number } {
    let critical = 0;
    let major = 0;
    let minor = 0;

    for (const diff of pageDiffs) {
      if (diff.severity === 'critical') critical++;
      else if (diff.severity === 'major') major++;
      else if (diff.severity === 'minor') minor++;
    }

    return {
      critical,
      major,
      minor,
      total: critical + major + minor,
    };
  }

  /**
   * 判斷頁面嚴重度
   */
  private determinePageSeverity(
    changeType: 'added' | 'removed' | 'modified',
    domChanges: DOMChange[],
    visualChanges: VisualChange[]
  ): 'critical' | 'major' | 'minor' {
    if (changeType === 'removed') return 'critical';
    if (changeType === 'added') return 'major';

    // 檢查 DOM 變更
    const hasCriticalDOMChange = domChanges.some((c) => c.severity === 'critical');
    if (hasCriticalDOMChange) return 'critical';

    const hasMajorDOMChange = domChanges.some((c) => c.severity === 'major');

    // 檢查視覺變更
    const hasCriticalVisualChange = visualChanges.some((c) => c.severity === 'critical');
    if (hasCriticalVisualChange) return 'critical';

    const hasMajorVisualChange = visualChanges.some((c) => c.severity === 'major');

    if (hasMajorDOMChange || hasMajorVisualChange) return 'major';

    return 'minor';
  }

  /**
   * 判斷 DOM 變更嚴重度
   */
  private determineDOMChangeSeverity(
    type: 'added' | 'removed' | 'modified',
    tagName: string
  ): 'critical' | 'major' | 'minor' {
    const criticalTags = ['form', 'input', 'button', 'a'];
    const majorTags = ['div', 'section', 'article', 'header', 'footer', 'nav'];

    if (type === 'removed' && criticalTags.includes(tagName.toLowerCase())) {
      return 'critical';
    }

    if (type === 'added' && criticalTags.includes(tagName.toLowerCase())) {
      return 'major';
    }

    if (majorTags.includes(tagName.toLowerCase())) {
      return 'major';
    }

    return 'minor';
  }

  /**
   * 判斷視覺變更嚴重度
   */
  private determineVisualSeverity(differencePercentage: number): 'critical' | 'major' | 'minor' {
    if (differencePercentage > 30) return 'critical';
    if (differencePercentage > 10) return 'major';
    return 'minor';
  }

  /**
   * 計算文字相似度
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity on words
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}
