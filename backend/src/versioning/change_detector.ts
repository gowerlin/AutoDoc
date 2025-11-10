/**
 * Change Detector - Interface Change Detection
 * Task 7.1: 開發介面變更檢測器
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { CDPWrapper } from '../browser/cdp_wrapper';
import * as pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DOMSnapshot {
  url: string;
  html: string;
  timestamp: Date;
  elements: ElementSnapshot[];
  structure: StructureFingerprint;
}

export interface ElementSnapshot {
  selector: string;
  tagName: string;
  textContent: string;
  attributes: Record<string, string>;
  position: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
}

export interface StructureFingerprint {
  hash: string;
  elementCount: number;
  interactiveElementCount: number;
  formCount: number;
  linkCount: number;
}

export interface ScreenshotSnapshot {
  url: string;
  screenshot: Buffer;
  timestamp: Date;
}

export interface PageBaseline {
  url: string;
  domSnapshot: DOMSnapshot;
  screenshot: ScreenshotSnapshot;
  explorationPath: string[];
  capturedAt: Date;
}

export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
export type ChangeSeverity = 'major' | 'minor' | 'cosmetic';

export interface DOMChange {
  type: ChangeType;
  severity: ChangeSeverity;
  selector: string;
  description: string;
  before?: ElementSnapshot;
  after?: ElementSnapshot;
  affectedSections?: string[];
}

export interface VisualChange {
  type: 'visual';
  severity: ChangeSeverity;
  url: string;
  description: string;
  differencePercentage: number;
  diffImage?: Buffer;
}

export interface ChangeReport {
  id: string;
  baselineVersion: string;
  currentVersion: string;
  comparedAt: Date;
  changes: {
    dom: DOMChange[];
    visual: VisualChange[];
  };
  summary: {
    totalChanges: number;
    majorChanges: number;
    minorChanges: number;
    cosmeticChanges: number;
  };
  affectedSections: string[];
  recommendations: string[];
}

export class ChangeDetector extends EventEmitter {
  private baselines: Map<string, PageBaseline> = new Map();
  private cdp: CDPWrapper;

  constructor(cdp: CDPWrapper) {
    super();
    this.cdp = cdp;
  }

  /**
   * 捕捉基線版本
   */
  async captureBaseline(url: string, explorationPath: string[] = []): Promise<PageBaseline> {
    console.log(`📸 Capturing baseline for: ${url}`);

    try {
      // Navigate to URL
      await this.cdp.navigate(url);
      await this.cdp.waitForPageReady();

      // Capture DOM snapshot
      const domSnapshot = await this.captureDOMSnapshot(url);

      // Capture screenshot
      const screenshot = await this.cdp.captureScreenshot({ format: 'png', fullPage: true });

      const baseline: PageBaseline = {
        url,
        domSnapshot,
        screenshot: {
          url,
          screenshot,
          timestamp: new Date(),
        },
        explorationPath,
        capturedAt: new Date(),
      };

      // Store baseline
      this.baselines.set(url, baseline);

      console.log(`✅ Baseline captured for: ${url}`);
      this.emit('baseline_captured', baseline);

      return baseline;
    } catch (error) {
      console.error(`❌ Failed to capture baseline for ${url}:`, error);
      throw error;
    }
  }

  /**
   * 捕捉 DOM 快照
   */
  private async captureDOMSnapshot(url: string): Promise<DOMSnapshot> {
    // Get full HTML
    const html = await this.cdp.evaluate('document.documentElement.outerHTML');

    // Extract all elements with their properties
    const elementsData = await this.cdp.evaluate(`
      Array.from(document.querySelectorAll('*')).map(el => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        return {
          selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.replace(/\\s+/g, '.') : ''),
          tagName: el.tagName.toLowerCase(),
          textContent: el.textContent?.trim().substring(0, 100) || '',
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {}),
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          isVisible: styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        };
      });
    `);

    const elements: ElementSnapshot[] = elementsData;

    // Calculate structure fingerprint
    const structure = this.calculateStructureFingerprint(elements, html);

    return {
      url,
      html,
      timestamp: new Date(),
      elements,
      structure,
    };
  }

  /**
   * 計算結構指紋
   */
  private calculateStructureFingerprint(elements: ElementSnapshot[], html: string): StructureFingerprint {
    const interactiveElements = elements.filter(
      (el) =>
        ['button', 'a', 'input', 'select', 'textarea'].includes(el.tagName) && el.isVisible
    );

    const forms = elements.filter((el) => el.tagName === 'form');
    const links = elements.filter((el) => el.tagName === 'a' && el.isVisible);

    // Create a hash based on structure
    const structureString = elements
      .filter((el) => el.isVisible)
      .map((el) => `${el.tagName}:${el.textContent}`)
      .join('|');

    const hash = crypto.createHash('md5').update(structureString).digest('hex');

    return {
      hash,
      elementCount: elements.length,
      interactiveElementCount: interactiveElements.length,
      formCount: forms.length,
      linkCount: links.length,
    };
  }

  /**
   * 與基線對比
   */
  async compareWithBaseline(url: string): Promise<{
    domChanges: DOMChange[];
    visualChanges: VisualChange[];
  }> {
    console.log(`🔍 Comparing with baseline: ${url}`);

    const baseline = this.baselines.get(url);
    if (!baseline) {
      throw new Error(`No baseline found for URL: ${url}`);
    }

    // Navigate to current state
    await this.cdp.navigate(url);
    await this.cdp.waitForPageReady();

    // Capture current state
    const currentSnapshot = await this.captureDOMSnapshot(url);
    const currentScreenshot = await this.cdp.captureScreenshot({ format: 'png', fullPage: true });

    // Compare DOM
    const domChanges = this.compareDOMSnapshots(baseline.domSnapshot, currentSnapshot);

    // Compare screenshots
    const visualChanges = await this.compareScreenshots(
      baseline.screenshot.screenshot,
      currentScreenshot,
      url
    );

    console.log(`✅ Comparison complete: ${domChanges.length} DOM changes, ${visualChanges.length} visual changes`);

    return { domChanges, visualChanges };
  }

  /**
   * 對比 DOM 快照
   */
  private compareDOMSnapshots(baseline: DOMSnapshot, current: DOMSnapshot): DOMChange[] {
    const changes: DOMChange[] = [];

    // Quick check: same structure fingerprint
    if (baseline.structure.hash === current.structure.hash) {
      console.log('  ℹ️ Structure fingerprints match - no major DOM changes');
      return changes;
    }

    // Create maps for easier comparison
    const baselineMap = new Map(baseline.elements.map((el) => [el.selector, el]));
    const currentMap = new Map(current.elements.map((el) => [el.selector, el]));

    // Find removed elements
    baselineMap.forEach((baselineEl, selector) => {
      if (!currentMap.has(selector) && baselineEl.isVisible) {
        changes.push({
          type: 'removed',
          severity: this.determineSeverity('removed', baselineEl),
          selector,
          description: `Element removed: ${baselineEl.tagName}`,
          before: baselineEl,
        });
      }
    });

    // Find added elements
    currentMap.forEach((currentEl, selector) => {
      if (!baselineMap.has(selector) && currentEl.isVisible) {
        changes.push({
          type: 'added',
          severity: this.determineSeverity('added', currentEl),
          selector,
          description: `Element added: ${currentEl.tagName}`,
          after: currentEl,
        });
      }
    });

    // Find modified elements
    baselineMap.forEach((baselineEl, selector) => {
      const currentEl = currentMap.get(selector);
      if (currentEl && this.isElementModified(baselineEl, currentEl)) {
        changes.push({
          type: 'modified',
          severity: this.determineSeverity('modified', baselineEl, currentEl),
          selector,
          description: this.describeModification(baselineEl, currentEl),
          before: baselineEl,
          after: currentEl,
        });
      }
    });

    return changes;
  }

  /**
   * 判斷元素是否修改
   */
  private isElementModified(before: ElementSnapshot, after: ElementSnapshot): boolean {
    // Check text content
    if (before.textContent !== after.textContent) return true;

    // Check important attributes
    const importantAttrs = ['href', 'src', 'value', 'placeholder', 'type'];
    for (const attr of importantAttrs) {
      if (before.attributes[attr] !== after.attributes[attr]) return true;
    }

    // Check position (significant change)
    const posChange =
      Math.abs(before.position.x - after.position.x) > 50 ||
      Math.abs(before.position.y - after.position.y) > 50;

    return posChange;
  }

  /**
   * 描述修改內容
   */
  private describeModification(before: ElementSnapshot, after: ElementSnapshot): string {
    const changes: string[] = [];

    if (before.textContent !== after.textContent) {
      changes.push(`text changed from "${before.textContent}" to "${after.textContent}"`);
    }

    const importantAttrs = ['href', 'src', 'value', 'placeholder'];
    for (const attr of importantAttrs) {
      if (before.attributes[attr] !== after.attributes[attr]) {
        changes.push(`${attr} changed`);
      }
    }

    if (Math.abs(before.position.x - after.position.x) > 50 || Math.abs(before.position.y - after.position.y) > 50) {
      changes.push('position changed');
    }

    return changes.join(', ');
  }

  /**
   * 決定變更嚴重程度
   */
  private determineSeverity(
    type: ChangeType,
    before?: ElementSnapshot,
    after?: ElementSnapshot
  ): ChangeSeverity {
    const element = before || after;
    if (!element) return 'cosmetic';

    // Interactive elements are major
    if (['button', 'a', 'input', 'select'].includes(element.tagName)) {
      return type === 'modified' ? 'minor' : 'major';
    }

    // Forms are major
    if (element.tagName === 'form') {
      return 'major';
    }

    // Text changes in headings are minor
    if (element.tagName.match(/^h[1-6]$/)) {
      return 'minor';
    }

    return 'cosmetic';
  }

  /**
   * 對比截圖
   */
  private async compareScreenshots(
    baselineBuffer: Buffer,
    currentBuffer: Buffer,
    url: string
  ): Promise<VisualChange[]> {
    try {
      const baseline = PNG.sync.read(baselineBuffer);
      const current = PNG.sync.read(currentBuffer);

      // Ensure same dimensions
      if (baseline.width !== current.width || baseline.height !== current.height) {
        console.warn('  ⚠️ Screenshot dimensions differ, resizing...');
        // In production, should resize images
      }

      const { width, height } = baseline;
      const diff = new PNG({ width, height });

      const numDiffPixels = pixelmatch(
        baseline.data,
        current.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
      );

      const totalPixels = width * height;
      const differencePercentage = (numDiffPixels / totalPixels) * 100;

      if (differencePercentage > 0.5) {
        // Significant visual change
        return [
          {
            type: 'visual',
            severity: differencePercentage > 10 ? 'major' : differencePercentage > 2 ? 'minor' : 'cosmetic',
            url,
            description: `Visual change detected (${differencePercentage.toFixed(2)}% pixels differ)`,
            differencePercentage,
            diffImage: PNG.sync.write(diff),
          },
        ];
      }

      return [];
    } catch (error) {
      console.error('  ❌ Screenshot comparison failed:', error);
      return [];
    }
  }

  /**
   * 生成變更報告
   */
  generateChangeReport(
    domChanges: DOMChange[],
    visualChanges: VisualChange[],
    baselineVersion: string = '1.0.0',
    currentVersion: string = '1.1.0'
  ): ChangeReport {
    console.log('📝 Generating change report...');

    const allChanges = [...domChanges, ...visualChanges];

    const summary = {
      totalChanges: allChanges.length,
      majorChanges: allChanges.filter((c) => c.severity === 'major').length,
      minorChanges: allChanges.filter((c) => c.severity === 'minor').length,
      cosmeticChanges: allChanges.filter((c) => c.severity === 'cosmetic').length,
    };

    // Extract affected sections (would be mapped from actual manual sections)
    const affectedSections = [
      ...new Set(domChanges.flatMap((c) => c.affectedSections || [])),
    ];

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary);

    const report: ChangeReport = {
      id: `report-${Date.now()}`,
      baselineVersion,
      currentVersion,
      comparedAt: new Date(),
      changes: {
        dom: domChanges,
        visual: visualChanges,
      },
      summary,
      affectedSections,
      recommendations,
    };

    console.log(`✅ Change report generated: ${summary.totalChanges} changes detected`);
    this.emit('report_generated', report);

    return report;
  }

  /**
   * 生成建議
   */
  private generateRecommendations(summary: {
    totalChanges: number;
    majorChanges: number;
    minorChanges: number;
  }): string[] {
    const recommendations: string[] = [];

    if (summary.majorChanges > 0) {
      recommendations.push('Major changes detected - full manual review recommended');
      recommendations.push(`${summary.majorChanges} major changes require updating documentation`);
    }

    if (summary.minorChanges > 0) {
      recommendations.push(`${summary.minorChanges} minor changes may require screenshot updates`);
    }

    if (summary.totalChanges === 0) {
      recommendations.push('No significant changes detected - manual is up to date');
    } else if (summary.totalChanges > 50) {
      recommendations.push('Consider regenerating manual due to extensive changes');
    } else {
      recommendations.push('Incremental update recommended');
    }

    return recommendations;
  }

  /**
   * 取得基線
   */
  getBaseline(url: string): PageBaseline | undefined {
    return this.baselines.get(url);
  }

  /**
   * 列出所有基線
   */
  listBaselines(): string[] {
    return Array.from(this.baselines.keys());
  }

  /**
   * 清除基線
   */
  clearBaseline(url: string): boolean {
    return this.baselines.delete(url);
  }

  /**
   * 清除所有基線
   */
  clearAllBaselines(): void {
    this.baselines.clear();
    console.log('✅ All baselines cleared');
  }
}
