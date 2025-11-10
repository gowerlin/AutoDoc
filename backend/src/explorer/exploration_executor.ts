/**
 * Exploration Executor
 * Task 2.3: 實作探索執行器
 */

import { CDPWrapper } from '../browser/cdp_wrapper';
import { PageStateDetector } from '../browser/page_state_detector';
import { DOMAnalyzer } from './dom_analyzer';
import { ExplorationStrategy, ExplorationQueueItem } from './exploration_strategy';
import { InteractiveElement, FormField, PageSnapshot } from '../types';
import { ExplorationError } from '../error/error_types';
import * as crypto from 'crypto';

export interface ExplorationResult {
  success: boolean;
  url: string;
  title: string;
  screenshot?: Buffer;
  snapshot: PageSnapshot;
  error?: string;
}

export interface FormTestData {
  [fieldName: string]: string;
}

export class ExplorationExecutor {
  private cdp: CDPWrapper;
  private detector: PageStateDetector;
  private analyzer: DOMAnalyzer;
  private strategy: ExplorationStrategy;
  private checkpoints: Map<string, any> = new Map();

  constructor(
    cdp: CDPWrapper,
    detector: PageStateDetector,
    analyzer: DOMAnalyzer,
    strategy: ExplorationStrategy
  ) {
    this.cdp = cdp;
    this.detector = detector;
    this.analyzer = analyzer;
    this.strategy = strategy;
  }

  /**
   * 執行單個元素的探索
   */
  async exploreElement(element: InteractiveElement, currentUrl: string): Promise<ExplorationResult> {
    try {
      console.log(`Exploring element: ${element.text} (${element.type})`);

      // Scroll element into view
      await this.scrollToElement(element);

      // Wait a bit for any animations
      await this.sleep(500);

      // Take screenshot before action
      const beforeScreenshot = await this.cdp.captureScreenshot({
        format: 'jpeg',
        quality: 85,
      });

      // Perform action based on element type
      if (element.type === 'link' && element.attributes.href) {
        // Navigate to link
        const targetUrl = this.resolveUrl(currentUrl, element.attributes.href);
        await this.cdp.navigate(targetUrl, { waitUntil: 'networkidle' });
      } else {
        // Click element
        await this.cdp.click(element.selector);
      }

      // Wait for page to stabilize
      await this.detector.waitForPageReady({ timeout: 10000 });

      // Get current URL after action
      const newUrl = await this.cdp.evaluate('window.location.href');

      // Analyze new page
      const analysis = await this.analyzer.analyze(newUrl);

      // Take screenshot after action
      const afterScreenshot = await this.cdp.captureScreenshot({
        format: 'jpeg',
        quality: 85,
      });

      // Create page snapshot
      const snapshot: PageSnapshot = {
        url: newUrl,
        title: analysis.pageTitle,
        domHash: this.calculateDOMHash(analysis),
        screenshot: {
          url: '', // Will be set when saved to storage
          hash: this.calculateHash(afterScreenshot),
          capturedAt: new Date(),
        },
        interactiveElements: analysis.interactiveElements,
        formFields: analysis.forms,
        apiCalls: [], // TODO: Implement API call tracking
      };

      return {
        success: true,
        url: newUrl,
        title: analysis.pageTitle,
        screenshot: afterScreenshot,
        snapshot,
      };
    } catch (error) {
      console.error('Error exploring element:', error);

      // Try to recover
      await this.recoverFromError(currentUrl);

      return {
        success: false,
        url: currentUrl,
        title: '',
        snapshot: this.createEmptySnapshot(currentUrl),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 處理表單互動
   */
  async handleFormInteraction(
    form: FormField[],
    testData?: FormTestData
  ): Promise<ExplorationResult> {
    try {
      console.log(`Handling form with ${form.length} fields`);

      // Fill form fields
      for (const field of form) {
        let value = testData?.[field.name] || this.generateTestData(field);

        if (value) {
          await this.cdp.click(field.selector);
          await this.cdp.type(field.selector, value);
          await this.sleep(200);
        }
      }

      // Find submit button
      const submitButton = await this.cdp.evaluate(`
        (() => {
          const form = document.querySelector('form');
          if (!form) return null;

          const submitBtn = form.querySelector('[type="submit"], button[type="submit"]');
          if (submitBtn) {
            return submitBtn.outerHTML;
          }

          // Try to find button with submit-like text
          const buttons = form.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent.toLowerCase();
            if (text.includes('submit') || text.includes('send') || text.includes('save')) {
              return btn.outerHTML;
            }
          }

          return null;
        })()
      `);

      if (submitButton) {
        // Submit form
        await this.cdp.evaluate(`
          (() => {
            const form = document.querySelector('form');
            if (form) {
              const submitBtn = form.querySelector('[type="submit"], button[type="submit"]');
              if (submitBtn) submitBtn.click();
            }
          })()
        `);

        // Wait for response
        await this.detector.waitForPageReady({ timeout: 10000 });
      }

      // Get result
      const url = await this.cdp.evaluate('window.location.href');
      const title = await this.cdp.evaluate('document.title');
      const screenshot = await this.cdp.captureScreenshot({ format: 'jpeg', quality: 85 });

      // Analyze result page
      const analysis = await this.analyzer.analyze(url);

      const snapshot: PageSnapshot = {
        url,
        title: title || '',
        domHash: this.calculateDOMHash(analysis),
        screenshot: {
          url: '',
          hash: this.calculateHash(screenshot),
          capturedAt: new Date(),
        },
        interactiveElements: analysis.interactiveElements,
        formFields: analysis.forms,
        apiCalls: [],
      };

      return {
        success: true,
        url,
        title: title || '',
        screenshot,
        snapshot,
      };
    } catch (error) {
      console.error('Error handling form interaction:', error);

      return {
        success: false,
        url: '',
        title: '',
        snapshot: this.createEmptySnapshot(''),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 生成表單測試資料
   */
  private generateTestData(field: FormField): string {
    const type = field.type.toLowerCase();

    switch (type) {
      case 'email':
        return 'test@example.com';
      case 'password':
        return 'TestPassword123!';
      case 'tel':
      case 'phone':
        return '1234567890';
      case 'url':
        return 'https://example.com';
      case 'number':
        return '123';
      case 'date':
        return '2024-01-01';
      case 'text':
      default:
        // Use placeholder or field name as hint
        if (field.placeholder) {
          return field.placeholder;
        }
        if (field.name.toLowerCase().includes('name')) {
          return 'Test User';
        }
        if (field.name.toLowerCase().includes('address')) {
          return '123 Test Street';
        }
        if (field.name.toLowerCase().includes('city')) {
          return 'Test City';
        }
        return 'Test Value';
    }
  }

  /**
   * 錯誤恢復機制
   */
  private async recoverFromError(lastGoodUrl: string): Promise<void> {
    try {
      console.log('Attempting error recovery...');

      // Check if we're on an error page
      const errors = await this.detector.detectPageErrors();

      if (errors.length > 0) {
        console.log('Error page detected:', errors);

        // Try to go back
        await this.cdp.evaluate('window.history.back()');
        await this.sleep(2000);
        await this.detector.waitForPageReady({ timeout: 5000 });

        console.log('Successfully went back');
      }
    } catch (error) {
      console.error('Error recovery failed:', error);

      // Last resort: navigate to last good URL
      try {
        await this.cdp.navigate(lastGoodUrl, { waitUntil: 'load' });
        await this.detector.waitForPageReady({ timeout: 5000 });
      } catch (navError) {
        console.error('Failed to navigate to last good URL:', navError);
      }
    }
  }

  /**
   * 檢測錯誤頁面
   */
  async detectErrorPage(): Promise<boolean> {
    try {
      const errors = await this.detector.detectPageErrors();
      return errors.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 滾動元素到可見位置
   */
  private async scrollToElement(element: InteractiveElement): Promise<void> {
    try {
      await this.cdp.evaluate(`
        (() => {
          const el = document.querySelector('${element.selector}');
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        })()
      `);

      // Wait for scroll to complete
      await this.sleep(500);
    } catch (error) {
      console.error('Failed to scroll to element:', error);
    }
  }

  /**
   * 保存探索狀態（checkpoint）
   */
  async saveCheckpoint(id: string, state: any): Promise<void> {
    this.checkpoints.set(id, {
      ...state,
      timestamp: Date.now(),
    });

    console.log(`Checkpoint saved: ${id}`);
  }

  /**
   * 載入探索狀態
   */
  async loadCheckpoint(id: string): Promise<any | null> {
    const checkpoint = this.checkpoints.get(id);

    if (checkpoint) {
      console.log(`Checkpoint loaded: ${id}`);
      return checkpoint;
    }

    return null;
  }

  /**
   * 清除舊的 checkpoint
   */
  cleanupCheckpoints(maxAge: number = 3600000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, checkpoint] of this.checkpoints.entries()) {
      if (now - checkpoint.timestamp > maxAge) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => this.checkpoints.delete(id));

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} old checkpoints`);
    }
  }

  /**
   * 計算 DOM hash
   */
  private calculateDOMHash(analysis: any): string {
    const data = JSON.stringify({
      title: analysis.pageTitle,
      elementsCount: analysis.interactiveElements.length,
      formsCount: analysis.forms.length,
    });

    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 計算 Buffer hash
   */
  private calculateHash(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * 建立空的 snapshot
   */
  private createEmptySnapshot(url: string): PageSnapshot {
    return {
      url,
      title: '',
      domHash: '',
      screenshot: {
        url: '',
        hash: '',
        capturedAt: new Date(),
      },
      interactiveElements: [],
      formFields: [],
      apiCalls: [],
    };
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
   * 輔助函數：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 高亮顯示正在探索的元素
   */
  async highlightElement(element: InteractiveElement): Promise<void> {
    try {
      await this.cdp.evaluate(`
        (() => {
          const el = document.querySelector('${element.selector}');
          if (el) {
            const originalOutline = el.style.outline;
            const originalBackground = el.style.backgroundColor;

            el.style.outline = '3px solid red';
            el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

            setTimeout(() => {
              el.style.outline = originalOutline;
              el.style.backgroundColor = originalBackground;
            }, 2000);
          }
        })()
      `);
    } catch (error) {
      console.error('Failed to highlight element:', error);
    }
  }

  /**
   * 檢查是否需要處理彈出視窗
   */
  async handleModalIfPresent(): Promise<boolean> {
    try {
      const hasModal = await this.detector.detectModalDialog();

      if (hasModal) {
        console.log('Modal detected, attempting to close...');

        // Try common close patterns
        const closed = await this.cdp.evaluate(`
          (() => {
            // Try to find close button
            const closeSelectors = [
              '[aria-label*="close"]',
              '[aria-label*="Close"]',
              '.modal-close',
              '.close',
              'button.close',
              '[data-dismiss="modal"]'
            ];

            for (const selector of closeSelectors) {
              const btn = document.querySelector(selector);
              if (btn) {
                btn.click();
                return true;
              }
            }

            // Try ESC key
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return false;
          })()
        `);

        if (closed) {
          await this.sleep(500);
          console.log('Modal closed');
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error handling modal:', error);
      return false;
    }
  }
}
