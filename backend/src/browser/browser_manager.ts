/**
 * Browser Manager
 * Task 1.4: 建立瀏覽器生命週期管理
 */

import { MCPConnector } from './mcp_connector';
import { CDPWrapper } from './cdp_wrapper';
import { PageStateDetector } from './page_state_detector';
import { BrowserError } from '../error/error_types';
import { BrowserConfig } from '../types';

export interface Page {
  id: string;
  cdp: CDPWrapper;
  detector: PageStateDetector;
  url: string;
  title: string;
}

export class BrowserManager {
  private connector: MCPConnector;
  private config: BrowserConfig;
  private pages: Map<string, Page> = new Map();
  private isLaunched: boolean = false;
  private currentPageId: string | null = null;

  constructor(config: BrowserConfig) {
    this.config = {
      headless: true,
      viewport: {
        width: 1920,
        height: 1080,
      },
      timeout: 30000,
      ...config,
    };

    // Initialize MCP connector
    const mcpUrl = process.env.CHROME_MCP_URL || 'ws://localhost:3001';
    this.connector = new MCPConnector({
      url: mcpUrl,
      maxRetries: 3,
      retryDelay: 2000,
      heartbeatInterval: 30000,
    });
  }

  /**
   * 啟動 Chrome 實例
   */
  async launchBrowser(): Promise<void> {
    if (this.isLaunched) {
      console.log('Browser already launched');
      return;
    }

    try {
      // Connect to Chrome via MCP
      await this.connector.connect();

      // Send launch command
      await this.connector.sendMessage({
        method: 'Browser.launch',
        params: {
          headless: this.config.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      });

      this.isLaunched = true;
      console.log('Browser launched successfully');
    } catch (error) {
      throw new BrowserError('Failed to launch browser', { error });
    }
  }

  /**
   * 建立新頁面（標籤頁）
   */
  async createPage(): Promise<Page> {
    if (!this.isLaunched) {
      await this.launchBrowser();
    }

    try {
      // Create new target (tab)
      const result = await this.connector.sendMessage({
        method: 'Target.createTarget',
        params: {
          url: 'about:blank',
        },
      });

      const pageId = result.targetId;

      // Attach to the target
      await this.connector.sendMessage({
        method: 'Target.attachToTarget',
        params: {
          targetId: pageId,
          flatten: true,
        },
      });

      // Create CDP wrapper and detector for this page
      const cdp = new CDPWrapper(this.connector);
      const detector = new PageStateDetector(cdp);

      // Set viewport
      await this.setViewport(pageId, this.config.viewport.width, this.config.viewport.height);

      const page: Page = {
        id: pageId,
        cdp,
        detector,
        url: 'about:blank',
        title: '',
      };

      this.pages.set(pageId, page);
      this.currentPageId = pageId;

      console.log(`Page created: ${pageId}`);
      return page;
    } catch (error) {
      throw new BrowserError('Failed to create page', { error });
    }
  }

  /**
   * 關閉頁面
   */
  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new BrowserError('Page not found', { pageId });
    }

    try {
      await this.connector.sendMessage({
        method: 'Target.closeTarget',
        params: {
          targetId: pageId,
        },
      });

      this.pages.delete(pageId);

      if (this.currentPageId === pageId) {
        this.currentPageId = this.pages.size > 0 ? Array.from(this.pages.keys())[0] : null;
      }

      console.log(`Page closed: ${pageId}`);
    } catch (error) {
      throw new BrowserError('Failed to close page', { pageId, error });
    }
  }

  /**
   * 取得當前頁面
   */
  getCurrentPage(): Page | null {
    if (!this.currentPageId) {
      return null;
    }
    return this.pages.get(this.currentPageId) || null;
  }

  /**
   * 取得指定頁面
   */
  getPage(pageId: string): Page | null {
    return this.pages.get(pageId) || null;
  }

  /**
   * 列出所有頁面
   */
  listPages(): Page[] {
    return Array.from(this.pages.values());
  }

  /**
   * 設定視窗大小
   */
  async setViewport(pageId: string, width: number, height: number): Promise<void> {
    try {
      await this.connector.sendMessage({
        method: 'Emulation.setDeviceMetricsOverride',
        params: {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        },
      });

      console.log(`Viewport set to ${width}x${height} for page ${pageId}`);
    } catch (error) {
      throw new BrowserError('Failed to set viewport', { pageId, width, height, error });
    }
  }

  /**
   * 啟用 Cookies
   */
  async enableCookies(): Promise<void> {
    try {
      await this.connector.sendMessage({
        method: 'Network.enable',
        params: {},
      });

      await this.connector.sendMessage({
        method: 'Network.setCacheDisabled',
        params: {
          cacheDisabled: false,
        },
      });

      console.log('Cookies enabled');
    } catch (error) {
      throw new BrowserError('Failed to enable cookies', { error });
    }
  }

  /**
   * 設定 Cookies
   */
  async setCookies(cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
  }>): Promise<void> {
    try {
      for (const cookie of cookies) {
        await this.connector.sendMessage({
          method: 'Network.setCookie',
          params: {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            expires: cookie.expires,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
          },
        });
      }

      console.log(`Set ${cookies.length} cookies`);
    } catch (error) {
      throw new BrowserError('Failed to set cookies', { error });
    }
  }

  /**
   * 取得 Cookies
   */
  async getCookies(urls?: string[]): Promise<any[]> {
    try {
      const result = await this.connector.sendMessage({
        method: 'Network.getCookies',
        params: urls ? { urls } : {},
      });

      return result.cookies || [];
    } catch (error) {
      throw new BrowserError('Failed to get cookies', { error });
    }
  }

  /**
   * 清除 Cookies
   */
  async clearCookies(): Promise<void> {
    try {
      await this.connector.sendMessage({
        method: 'Network.clearBrowserCookies',
        params: {},
      });

      console.log('Cookies cleared');
    } catch (error) {
      throw new BrowserError('Failed to clear cookies', { error });
    }
  }

  /**
   * 設定 User Agent
   */
  async setUserAgent(userAgent: string): Promise<void> {
    try {
      await this.connector.sendMessage({
        method: 'Network.setUserAgentOverride',
        params: {
          userAgent,
        },
      });

      console.log('User agent set');
    } catch (error) {
      throw new BrowserError('Failed to set user agent', { error });
    }
  }

  /**
   * 截圖（當前頁面）
   */
  async screenshot(options: any = {}): Promise<Buffer> {
    const currentPage = this.getCurrentPage();
    if (!currentPage) {
      throw new BrowserError('No active page');
    }

    return await currentPage.cdp.captureScreenshot(options);
  }

  /**
   * 導航到 URL（當前頁面）
   */
  async navigate(url: string, options: any = {}): Promise<void> {
    const currentPage = this.getCurrentPage();
    if (!currentPage) {
      throw new BrowserError('No active page');
    }

    await currentPage.cdp.navigate(url, options);
    currentPage.url = url;

    // Update page title
    try {
      const title = await currentPage.cdp.evaluate('document.title');
      currentPage.title = title || '';
    } catch (error) {
      console.error('Failed to get page title:', error);
    }
  }

  /**
   * 關閉瀏覽器
   */
  async close(): Promise<void> {
    console.log('Closing browser...');

    // Close all pages
    const pageIds = Array.from(this.pages.keys());
    for (const pageId of pageIds) {
      try {
        await this.closePage(pageId);
      } catch (error) {
        console.error(`Failed to close page ${pageId}:`, error);
      }
    }

    // Disconnect from MCP
    try {
      await this.connector.disconnect();
    } catch (error) {
      console.error('Failed to disconnect from MCP:', error);
    }

    this.isLaunched = false;
    this.currentPageId = null;
    console.log('Browser closed');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down browser manager...');

    try {
      await this.close();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }

    console.log('Browser manager shutdown complete');
  }

  /**
   * 檢查瀏覽器是否已啟動
   */
  isReady(): boolean {
    return this.isLaunched && this.connector.isConnected();
  }

  /**
   * 取得統計資訊
   */
  getStats(): {
    isLaunched: boolean;
    isConnected: boolean;
    pageCount: number;
    currentPageId: string | null;
  } {
    return {
      isLaunched: this.isLaunched,
      isConnected: this.connector.isConnected(),
      pageCount: this.pages.size,
      currentPageId: this.currentPageId,
    };
  }
}
