/**
 * Claude Vision API Client
 * Task 4.1: 整合 Claude Vision API
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { AIError } from '../error/error_types';

export type PromptType = 'functionality' | 'steps' | 'ui_elements' | 'custom';

export interface ScreenshotContext {
  url: string;
  title?: string;
  navigationPath: string[];
  actionHistory: Array<{
    action: string;
    element: string;
    timestamp: Date;
  }>;
  metadata?: {
    pageType?: string;
    features?: string[];
    [key: string]: any;
  };
}

export interface AnalysisResult {
  success: boolean;
  type: PromptType;
  content: {
    functionality?: {
      name: string;
      purpose: string;
      preconditions: string[];
      mainActions: string[];
      expectedResults: string[];
    };
    steps?: Array<{
      stepNumber: number;
      action: string;
      element: string;
      details: string;
      screenshot?: string;
    }>;
    uiElements?: Array<{
      type: string;
      label: string;
      purpose: string;
      location: string;
    }>;
    rawResponse?: string;
  };
  metadata: {
    model: string;
    tokensUsed: number;
    duration: number;
    timestamp: Date;
  };
  error?: string;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class ClaudeVisionClient extends EventEmitter {
  private client: Anthropic;
  private config: {
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };
  private retryConfig: RetryConfig;
  private promptTemplates: Map<PromptType, string>;

  constructor(apiKey?: string) {
    super();

    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60000, // 60 seconds
    };

    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };

    this.promptTemplates = new Map();
    this.initializePromptTemplates();
  }

  /**
   * 初始化 Prompt 模板
   */
  private initializePromptTemplates(): void {
    // 功能描述 Prompt
    this.promptTemplates.set(
      'functionality',
      `請分析這個頁面的主要功能。

請提供：
1. 功能名稱
2. 功能用途（這個功能解決什麼問題？）
3. 使用前置條件（需要什麼權限或狀態？）
4. 主要操作動作（用戶可以做什麼？）
5. 預期結果（完成後會發生什麼？）

請以 JSON 格式回應：
{
  "name": "功能名稱",
  "purpose": "功能用途描述",
  "preconditions": ["前置條件1", "前置條件2"],
  "mainActions": ["操作1", "操作2"],
  "expectedResults": ["結果1", "結果2"]
}`
    );

    // 步驟提取 Prompt
    this.promptTemplates.set(
      'steps',
      `請分析如何使用這個功能，並列出詳細的操作步驟。

每個步驟應包含：
1. 步驟編號
2. 要執行的動作
3. 操作的 UI 元素
4. 詳細說明

請以 JSON 格式回應：
{
  "steps": [
    {
      "stepNumber": 1,
      "action": "點擊",
      "element": "登入按鈕",
      "details": "點擊頁面右上角的登入按鈕"
    }
  ]
}`
    );

    // UI 元素識別 Prompt
    this.promptTemplates.set(
      'ui_elements',
      `請識別截圖中所有重要的 UI 元素（按鈕、輸入框、連結等）。

對每個元素提供：
1. 元素類型（button, input, link, dropdown 等）
2. 元素標籤或文字
3. 元素用途
4. 元素在畫面中的位置（上、下、左、右、中央）

請以 JSON 格式回應：
{
  "elements": [
    {
      "type": "button",
      "label": "提交",
      "purpose": "提交表單資料",
      "location": "表單底部中央"
    }
  ]
}`
    );
  }

  /**
   * 分析截圖
   */
  async analyzeScreenshot(
    imageBuffer: Buffer,
    context: ScreenshotContext,
    promptType: PromptType = 'functionality',
    customPrompt?: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      console.log(`🔍 Analyzing screenshot with ${promptType} prompt...`);
      console.log(`   URL: ${context.url}`);
      console.log(`   Navigation: ${context.navigationPath.join(' > ')}`);

      // Convert to base64
      const base64Image = this.imageToBase64(imageBuffer);

      // Build prompt with context
      const prompt = this.buildPrompt(promptType, context, customPrompt);

      // Call Claude API with retry
      const response = await this.callWithRetry(async () => {
        return await this.client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: base64Image,
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
        });
      });

      const duration = Date.now() - startTime;

      // Extract text from response
      const textContent = response.content.find((c) => c.type === 'text');
      const rawResponse = textContent && 'text' in textContent ? textContent.text : '';

      // Parse response based on prompt type
      const parsedContent = this.parseResponse(rawResponse, promptType);

      const result: AnalysisResult = {
        success: true,
        type: promptType,
        content: {
          ...parsedContent,
          rawResponse,
        },
        metadata: {
          model: this.config.model,
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          duration,
          timestamp: new Date(),
        },
      };

      console.log(`✅ Analysis complete (${duration}ms, ${result.metadata.tokensUsed} tokens)`);

      this.emit('analysis_complete', result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error('❌ Screenshot analysis failed:', error);

      const errorResult: AnalysisResult = {
        success: false,
        type: promptType,
        content: {},
        metadata: {
          model: this.config.model,
          tokensUsed: 0,
          duration,
          timestamp: new Date(),
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.emit('analysis_error', errorResult);

      throw new AIError('Screenshot analysis failed', { error, context });
    }
  }

  /**
   * 批次分析多張截圖
   */
  async analyzeScreenshots(
    screenshots: Array<{
      image: Buffer;
      context: ScreenshotContext;
      promptType?: PromptType;
    }>
  ): Promise<AnalysisResult[]> {
    console.log(`📸 Analyzing ${screenshots.length} screenshots...`);

    const results: AnalysisResult[] = [];

    for (let i = 0; i < screenshots.length; i++) {
      const { image, context, promptType } = screenshots[i];

      console.log(`\n[${i + 1}/${screenshots.length}] Processing: ${context.url}`);

      try {
        const result = await this.analyzeScreenshot(image, context, promptType);
        results.push(result);

        // Small delay between requests to avoid rate limiting
        if (i < screenshots.length - 1) {
          await this.sleep(1000);
        }
      } catch (error) {
        console.error(`Failed to analyze screenshot ${i + 1}:`, error);
        // Continue with next screenshot
      }
    }

    console.log(`\n✅ Batch analysis complete: ${results.length}/${screenshots.length} successful`);

    return results;
  }

  /**
   * 轉換圖片為 base64
   */
  private imageToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  /**
   * 建立完整的 Prompt
   */
  private buildPrompt(
    type: PromptType,
    context: ScreenshotContext,
    customPrompt?: string
  ): string {
    // Get base prompt template
    const basePrompt =
      type === 'custom' && customPrompt
        ? customPrompt
        : this.promptTemplates.get(type) || '';

    // Add context information
    const contextInfo = `
## 頁面上下文資訊

**當前頁面 URL**: ${context.url}
**頁面標題**: ${context.title || '（未知）'}
**導航路徑**: ${context.navigationPath.join(' > ') || '首頁'}

${
  context.actionHistory.length > 0
    ? `**最近操作歷史**:
${context.actionHistory
  .slice(-5)
  .map((action, i) => `${i + 1}. ${action.action} - ${action.element}`)
  .join('\n')}`
    : ''
}

${
  context.metadata?.features
    ? `**已知功能**: ${context.metadata.features.join(', ')}`
    : ''
}

---

${basePrompt}
`;

    return contextInfo;
  }

  /**
   * 解析 API 回應
   */
  private parseResponse(response: string, type: PromptType): any {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Map to appropriate structure based on type
        switch (type) {
          case 'functionality':
            return { functionality: parsed };

          case 'steps':
            return { steps: parsed.steps || [] };

          case 'ui_elements':
            return { uiElements: parsed.elements || [] };

          default:
            return parsed;
        }
      }

      // If no JSON found, return raw text
      return { rawResponse: response };
    } catch (error) {
      console.warn('Failed to parse JSON response, returning raw text');
      return { rawResponse: response };
    }
  }

  /**
   * 重試機制
   */
  private async callWithRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`API call timeout after ${this.config.timeout}ms`));
        }, this.config.timeout);
      });

      return await Promise.race([fn(), timeoutPromise]);
    } catch (error) {
      if (attempt >= this.retryConfig.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.retryConfig.initialDelay *
          Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
        this.retryConfig.maxDelay
      );

      console.warn(
        `⚠️ API call failed (attempt ${attempt}/${this.retryConfig.maxRetries}), retrying in ${delay}ms...`
      );

      await this.sleep(delay);

      return this.callWithRetry(fn, attempt + 1);
    }
  }

  /**
   * 更新 Prompt 模板
   */
  setPromptTemplate(type: PromptType, template: string): void {
    this.promptTemplates.set(type, template);
    console.log(`✅ Updated ${type} prompt template`);
  }

  /**
   * 取得 Prompt 模板
   */
  getPromptTemplate(type: PromptType): string | undefined {
    return this.promptTemplates.get(type);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...config };
    console.log('✅ Configuration updated:', config);
  }

  /**
   * 更新重試配置
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
    console.log('✅ Retry configuration updated:', config);
  }

  /**
   * 測試連接
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔌 Testing Claude API connection...');

      // Create a simple test image (1x1 white pixel)
      const testImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
      );

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: testImage.toString('base64'),
                },
              },
              {
                type: 'text',
                text: 'Say "OK" if you can see this image.',
              },
            ],
          },
        ],
      });

      console.log('✅ Claude API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Claude API connection failed:', error);
      return false;
    }
  }

  /**
   * 取得使用統計
   */
  getStats(): {
    model: string;
    timeout: number;
    maxRetries: number;
  } {
    return {
      model: this.config.model,
      timeout: this.config.timeout,
      maxRetries: this.retryConfig.maxRetries,
    };
  }

  /**
   * 輔助函數：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
