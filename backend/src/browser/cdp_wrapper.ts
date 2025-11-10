/**
 * Chrome DevTools Protocol Wrapper
 * Task 1.2: 封裝 Chrome DevTools Protocol 核心命令
 */

import { MCPConnector } from './mcp_connector';
import { BrowserError, TimeoutError } from '../error/error_types';
import { ApiCall } from '../types';

export interface NavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface EvaluateOptions {
  awaitPromise?: boolean;
  returnByValue?: boolean;
  timeout?: number;
}

export class CDPWrapper {
  private connector: MCPConnector;
  private defaultTimeout: number = 30000;
  private networkCallbacks: Map<string, (call: ApiCall) => void> = new Map();

  constructor(connector: MCPConnector) {
    this.connector = connector;
  }

  /**
   * 導航到指定 URL
   */
  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    const timeout = options.timeout || this.defaultTimeout;

    try {
      // Enable necessary domains
      await this.connector.sendMessage({
        method: 'Page.enable',
        params: {},
      });

      // Navigate to URL
      const result = await this.connector.sendMessage(
        {
          method: 'Page.navigate',
          params: { url },
        },
        timeout
      );

      if (result.errorText) {
        throw new BrowserError(`Navigation failed: ${result.errorText}`);
      }

      // Wait for page load based on waitUntil option
      const waitUntil = options.waitUntil || 'load';
      if (waitUntil === 'load') {
        await this.waitForPageLoad(timeout);
      } else if (waitUntil === 'domcontentloaded') {
        await this.waitForDOMContentLoaded(timeout);
      } else if (waitUntil === 'networkidle') {
        await this.waitForNetworkIdle(timeout);
      }
    } catch (error) {
      throw new BrowserError('Failed to navigate to URL', { url, error });
    }
  }

  /**
   * 截圖
   */
  async captureScreenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    const format = options.format || 'jpeg';
    const quality = options.quality || 85;

    try {
      // Set viewport if clip is specified
      if (options.clip) {
        await this.connector.sendMessage({
          method: 'Page.setViewport',
          params: {
            viewport: {
              x: options.clip.x,
              y: options.clip.y,
              width: options.clip.width,
              height: options.clip.height,
              scale: 1,
            },
          },
        });
      }

      const result = await this.connector.sendMessage(
        {
          method: 'Page.captureScreenshot',
          params: {
            format,
            quality: format === 'jpeg' ? quality : undefined,
            captureBeyondViewport: options.fullPage || false,
          },
        },
        this.defaultTimeout
      );

      if (!result.data) {
        throw new BrowserError('Screenshot capture returned no data');
      }

      return Buffer.from(result.data, 'base64');
    } catch (error) {
      throw new BrowserError('Failed to capture screenshot', { error });
    }
  }

  /**
   * 獲取完整 DOM 樹
   */
  async getDocument(): Promise<any> {
    try {
      await this.connector.sendMessage({
        method: 'DOM.enable',
        params: {},
      });

      const result = await this.connector.sendMessage(
        {
          method: 'DOM.getDocument',
          params: { depth: -1, pierce: true },
        },
        this.defaultTimeout
      );

      return result.root;
    } catch (error) {
      throw new BrowserError('Failed to get document', { error });
    }
  }

  /**
   * CSS 選擇器查詢
   */
  async querySelectorAll(selector: string): Promise<number[]> {
    try {
      const document = await this.getDocument();
      const result = await this.connector.sendMessage(
        {
          method: 'DOM.querySelectorAll',
          params: {
            nodeId: document.nodeId,
            selector,
          },
        },
        this.defaultTimeout
      );

      return result.nodeIds || [];
    } catch (error) {
      throw new BrowserError('Failed to query selector', { selector, error });
    }
  }

  /**
   * 獲取節點屬性
   */
  async getNodeAttributes(nodeId: number): Promise<Record<string, string>> {
    try {
      const result = await this.connector.sendMessage(
        {
          method: 'DOM.getAttributes',
          params: { nodeId },
        },
        this.defaultTimeout
      );

      const attributes: Record<string, string> = {};
      const attrs = result.attributes || [];

      for (let i = 0; i < attrs.length; i += 2) {
        attributes[attrs[i]] = attrs[i + 1];
      }

      return attributes;
    } catch (error) {
      throw new BrowserError('Failed to get node attributes', { nodeId, error });
    }
  }

  /**
   * 執行 JavaScript 代碼
   */
  async evaluate(expression: string, options: EvaluateOptions = {}): Promise<any> {
    const timeout = options.timeout || this.defaultTimeout;

    try {
      await this.connector.sendMessage({
        method: 'Runtime.enable',
        params: {},
      });

      const result = await this.connector.sendMessage(
        {
          method: 'Runtime.evaluate',
          params: {
            expression,
            awaitPromise: options.awaitPromise !== false,
            returnByValue: options.returnByValue !== false,
          },
        },
        timeout
      );

      if (result.exceptionDetails) {
        throw new BrowserError('JavaScript evaluation failed', {
          exception: result.exceptionDetails,
        });
      }

      return result.result?.value;
    } catch (error) {
      throw new BrowserError('Failed to evaluate JavaScript', { expression, error });
    }
  }

  /**
   * 啟用網路監控
   */
  async enableNetworkMonitoring(): Promise<void> {
    try {
      await this.connector.sendMessage({
        method: 'Network.enable',
        params: {},
      });

      // Listen to network events
      this.connector.on('event', (message) => {
        if (message.method === 'Network.requestWillBeSent') {
          this.handleNetworkRequest(message.params);
        } else if (message.method === 'Network.responseReceived') {
          this.handleNetworkResponse(message.params);
        }
      });
    } catch (error) {
      throw new BrowserError('Failed to enable network monitoring', { error });
    }
  }

  /**
   * 處理網路請求
   */
  private handleNetworkRequest(params: any): void {
    const requestId = params.requestId;
    const request = params.request;

    this.networkCallbacks.set(requestId, (call: ApiCall) => {
      // Callback will be called when response is received
    });
  }

  /**
   * 處理網路回應
   */
  private handleNetworkResponse(params: any): void {
    const requestId = params.requestId;
    const response = params.response;

    const apiCall: ApiCall = {
      url: response.url,
      method: response.requestHeaders?.method || 'GET',
      status: response.status,
      headers: response.headers,
      timestamp: new Date(),
    };

    const callback = this.networkCallbacks.get(requestId);
    if (callback) {
      callback(apiCall);
      this.networkCallbacks.delete(requestId);
    }

    this.connector.emit('network_call', apiCall);
  }

  /**
   * 點擊元素
   */
  async click(selector: string): Promise<void> {
    try {
      const nodeIds = await this.querySelectorAll(selector);

      if (nodeIds.length === 0) {
        throw new BrowserError('Element not found', { selector });
      }

      // Get element position
      const position = await this.evaluate(`
        (() => {
          const element = document.querySelector('${selector}');
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          };
        })()
      `);

      if (!position) {
        throw new BrowserError('Failed to get element position', { selector });
      }

      // Scroll element into view
      await this.evaluate(`
        document.querySelector('${selector}').scrollIntoView({ block: 'center', behavior: 'smooth' });
      `);

      // Wait a bit for scroll
      await this.sleep(500);

      // Click element
      await this.connector.sendMessage({
        method: 'Input.dispatchMouseEvent',
        params: {
          type: 'mousePressed',
          x: position.x,
          y: position.y,
          button: 'left',
          clickCount: 1,
        },
      });

      await this.connector.sendMessage({
        method: 'Input.dispatchMouseEvent',
        params: {
          type: 'mouseReleased',
          x: position.x,
          y: position.y,
          button: 'left',
          clickCount: 1,
        },
      });
    } catch (error) {
      throw new BrowserError('Failed to click element', { selector, error });
    }
  }

  /**
   * 輸入文字
   */
  async type(selector: string, text: string): Promise<void> {
    try {
      // Focus on element
      await this.click(selector);

      // Type text
      for (const char of text) {
        await this.connector.sendMessage({
          method: 'Input.dispatchKeyEvent',
          params: {
            type: 'char',
            text: char,
          },
        });
      }
    } catch (error) {
      throw new BrowserError('Failed to type text', { selector, text, error });
    }
  }

  /**
   * 等待頁面載入
   */
  private async waitForPageLoad(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new TimeoutError('Page load timeout'));
      }, timeout);

      const listener = (message: any) => {
        if (message.method === 'Page.loadEventFired') {
          clearTimeout(timeoutHandle);
          this.connector.off('event', listener);
          resolve();
        }
      };

      this.connector.on('event', listener);
    });
  }

  /**
   * 等待 DOM Content Loaded
   */
  private async waitForDOMContentLoaded(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new TimeoutError('DOM content loaded timeout'));
      }, timeout);

      const listener = (message: any) => {
        if (message.method === 'Page.domContentEventFired') {
          clearTimeout(timeoutHandle);
          this.connector.off('event', listener);
          resolve();
        }
      };

      this.connector.on('event', listener);
    });
  }

  /**
   * 等待網路閒置
   */
  private async waitForNetworkIdle(timeout: number, idleTime: number = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
      let activeRequests = 0;
      let idleTimeout: NodeJS.Timeout | null = null;

      const timeoutHandle = setTimeout(() => {
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

      const requestListener = (message: any) => {
        if (message.method === 'Network.requestWillBeSent') {
          activeRequests++;
        } else if (
          message.method === 'Network.responseReceived' ||
          message.method === 'Network.loadingFailed'
        ) {
          activeRequests--;
          checkIdle();
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        if (idleTimeout) {
          clearTimeout(idleTimeout);
        }
        this.connector.off('event', requestListener);
      };

      this.connector.on('event', requestListener);
      checkIdle();
    });
  }

  /**
   * 輔助函數：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
