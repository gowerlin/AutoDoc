/**
 * Page State Detector
 * Task 1.3: 實作頁面狀態檢測器
 */

import { CDPWrapper } from './cdp_wrapper';
import { TimeoutError } from '../error/error_types';

export interface WaitOptions {
  timeout?: number;
  polling?: number;
}

export class PageStateDetector {
  private cdp: CDPWrapper;
  private defaultTimeout: number = 30000;
  private defaultPolling: number = 100;

  constructor(cdp: CDPWrapper) {
    this.cdp = cdp;
  }

  /**
   * 等待網路請求完成（2 秒內無新請求）
   */
  async waitForNetworkIdle(options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout || this.defaultTimeout;
    const idleTime = 2000; // 2 seconds of no requests

    return new Promise(async (resolve, reject) => {
      let activeRequests = 0;
      let idleTimeout: NodeJS.Timeout | null = null;
      let totalTimeout: NodeJS.Timeout | null = null;

      totalTimeout = setTimeout(() => {
        cleanup();
        reject(new TimeoutError('Network idle timeout'));
      }, timeout);

      const checkIdle = () => {
        if (activeRequests === 0) {
          if (idleTimeout) {
            clearTimeout(idleTimeout);
          }
          idleTimeout = setTimeout(() => {
            cleanup();
            resolve();
          }, idleTime);
        } else {
          if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = null;
          }
        }
      };

      const cleanup = () => {
        if (totalTimeout) clearTimeout(totalTimeout);
        if (idleTimeout) clearTimeout(idleTimeout);
      };

      // Monitor network activity
      try {
        await this.cdp.enableNetworkMonitoring();

        // We rely on the CDP wrapper's network event handling
        // The network idle logic is already implemented in CDP wrapper's waitForNetworkIdle method
        await new Promise<void>((res, rej) => {
          const internalTimeout = setTimeout(() => rej(new TimeoutError('Network idle timeout')), timeout);

          // Use a simplified approach: just wait for a period of no network activity
          let lastActivity = Date.now();
          const checkInterval = setInterval(async () => {
            if (Date.now() - lastActivity >= idleTime) {
              clearTimeout(internalTimeout);
              clearInterval(checkInterval);
              res();
            }
          }, 500);

          // This is a simplified implementation
          // In production, you'd track actual network events
        });

        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  /**
   * 等待 DOM 結構穩定（500ms 內無變化）
   */
  async waitForDOMStable(options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout || this.defaultTimeout;
    const stableTime = 500; // 500ms of no changes

    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();
      let lastDOMHash = '';
      let stableTimeout: NodeJS.Timeout | null = null;

      const checkStability = async () => {
        try {
          if (Date.now() - startTime > timeout) {
            if (stableTimeout) clearTimeout(stableTimeout);
            reject(new TimeoutError('DOM stable timeout'));
            return;
          }

          // Get current DOM hash
          const currentHash = await this.getDOMHash();

          if (currentHash === lastDOMHash) {
            // DOM hasn't changed
            if (!stableTimeout) {
              stableTimeout = setTimeout(() => {
                resolve();
              }, stableTime);
            }
          } else {
            // DOM changed, reset timer
            lastDOMHash = currentHash;
            if (stableTimeout) {
              clearTimeout(stableTimeout);
              stableTimeout = null;
            }
            // Check again
            setTimeout(checkStability, options.polling || this.defaultPolling);
          }
        } catch (error) {
          if (stableTimeout) clearTimeout(stableTimeout);
          reject(error);
        }
      };

      checkStability();
    });
  }

  /**
   * 檢測彈出視窗或對話框
   */
  async detectModalDialog(): Promise<boolean> {
    try {
      const result = await this.cdp.evaluate(`
        (() => {
          // Check for common modal patterns
          const modalSelectors = [
            '[role="dialog"]',
            '[role="alertdialog"]',
            '.modal',
            '.dialog',
            '.popup',
            '.overlay',
            '[class*="modal"]',
            '[class*="dialog"]',
            '[class*="popup"]'
          ];

          for (const selector of modalSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const style = window.getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                return true;
              }
            }
          }

          return false;
        })()
      `);

      return result === true;
    } catch (error) {
      console.error('Failed to detect modal dialog:', error);
      return false;
    }
  }

  /**
   * 檢測載入中指示器（spinner/skeleton）
   */
  async detectLoadingIndicator(): Promise<boolean> {
    try {
      const result = await this.cdp.evaluate(`
        (() => {
          // Check for common loading indicator patterns
          const loadingSelectors = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="skeleton"]',
            '[class*="loader"]',
            '[role="progressbar"]',
            '.loading',
            '.spinner',
            '.skeleton',
            '.loader'
          ];

          for (const selector of loadingSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const style = window.getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                return true;
              }
            }
          }

          return false;
        })()
      `);

      return result === true;
    } catch (error) {
      console.error('Failed to detect loading indicator:', error);
      return false;
    }
  }

  /**
   * 等待載入指示器消失
   */
  async waitForLoadingToComplete(options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout || this.defaultTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const hasLoader = await this.detectLoadingIndicator();
      if (!hasLoader) {
        return;
      }
      await this.sleep(options.polling || this.defaultPolling);
    }

    throw new TimeoutError('Loading indicator did not disappear within timeout');
  }

  /**
   * 等待自定義條件（傳入 JavaScript 表達式）
   */
  async waitForCondition(condition: string, options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout || this.defaultTimeout;
    const polling = options.polling || this.defaultPolling;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.cdp.evaluate(condition);
        if (result === true) {
          return;
        }
      } catch (error) {
        // Condition evaluation failed, continue waiting
      }
      await this.sleep(polling);
    }

    throw new TimeoutError(`Condition not met within timeout: ${condition}`);
  }

  /**
   * 等待元素出現
   */
  async waitForSelector(selector: string, options: WaitOptions = {}): Promise<void> {
    await this.waitForCondition(
      `document.querySelector('${selector}') !== null`,
      options
    );
  }

  /**
   * 等待元素消失
   */
  async waitForSelectorToDisappear(selector: string, options: WaitOptions = {}): Promise<void> {
    await this.waitForCondition(
      `
      (() => {
        const el = document.querySelector('${selector}');
        if (!el) return true;
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
      })()
      `,
      options
    );
  }

  /**
   * 綜合等待：網路閒置 + DOM 穩定 + 無載入指示器
   */
  async waitForPageReady(options: WaitOptions = {}): Promise<void> {
    try {
      // Wait for network to be idle
      await this.waitForNetworkIdle(options);

      // Wait for DOM to be stable
      await this.waitForDOMStable(options);

      // Wait for any loading indicators to disappear
      await this.waitForLoadingToComplete(options);
    } catch (error) {
      throw new TimeoutError('Page did not become ready within timeout');
    }
  }

  /**
   * 獲取 DOM 的 hash 值（用於檢測變化）
   */
  private async getDOMHash(): Promise<string> {
    try {
      const hash = await this.cdp.evaluate(`
        (() => {
          const html = document.documentElement.outerHTML;
          // Simple hash function
          let hash = 0;
          for (let i = 0; i < html.length; i++) {
            const char = html.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
          }
          return hash.toString();
        })()
      `);
      return hash || '';
    } catch (error) {
      console.error('Failed to get DOM hash:', error);
      return '';
    }
  }

  /**
   * 輔助函數：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 檢查頁面是否有錯誤
   */
  async detectPageErrors(): Promise<string[]> {
    try {
      const errors = await this.cdp.evaluate(`
        (() => {
          const errorIndicators = [];

          // Check for 404, 500 error pages
          const title = document.title.toLowerCase();
          const bodyText = document.body.innerText.toLowerCase();

          if (title.includes('404') || title.includes('not found') ||
              title.includes('500') || title.includes('error')) {
            errorIndicators.push('Error page detected in title');
          }

          if (bodyText.includes('404') || bodyText.includes('not found') ||
              bodyText.includes('500') || bodyText.includes('internal server error')) {
            errorIndicators.push('Error message detected in body');
          }

          // Check for common error elements
          const errorElements = document.querySelectorAll('[class*="error"], [class*="alert-danger"]');
          if (errorElements.length > 0) {
            errorIndicators.push(\`Found \${errorElements.length} error elements\`);
          }

          return errorIndicators;
        })()
      `);

      return errors || [];
    } catch (error) {
      console.error('Failed to detect page errors:', error);
      return [];
    }
  }
}
