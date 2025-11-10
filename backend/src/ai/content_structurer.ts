/**
 * Content Structuring Engine
 * Task 4.2: 開發內容結構化引擎
 */

import { AnalysisResult } from './claude_vision_client';
import { EventEmitter } from 'events';

export interface Functionality {
  id: string;
  name: string;
  purpose: string;
  preconditions: string[];
  mainActions: string[];
  expectedResults: string[];
  category?: string;
  tags?: string[];
  metadata?: {
    url: string;
    pageTitle?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    [key: string]: any;
  };
}

export interface Step {
  stepNumber: number;
  action: string;
  element: string;
  details: string;
  screenshot?: {
    id: string;
    caption: string;
    url?: string;
  };
  warnings?: string[];
  notes?: string[];
  keyElements?: string[];
}

export interface StepByStepGuide {
  id: string;
  title: string;
  description: string;
  steps: Step[];
  totalSteps: number;
  estimatedTime?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
  relatedGuides?: string[];
}

export interface Warning {
  type: 'warning' | 'caution' | 'danger' | 'note';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  icon?: string;
  context?: string;
}

export interface StructuredContent {
  functionality?: Functionality;
  guide?: StepByStepGuide;
  warnings: Warning[];
  notes: string[];
  metadata: {
    generatedAt: Date;
    sourceAnalysis: string;
    version: string;
  };
}

export class ContentStructurer extends EventEmitter {
  private screenshotCounter: number = 0;
  private functionalityCounter: number = 0;
  private guideCounter: number = 0;

  constructor() {
    super();
  }

  /**
   * 提取功能描述
   */
  extractFunctionality(analysis: AnalysisResult, metadata?: any): Functionality {
    console.log('📝 Extracting functionality from analysis...');

    try {
      const functionalityData = analysis.content.functionality;

      if (!functionalityData) {
        throw new Error('No functionality data in analysis result');
      }

      const functionality: Functionality = {
        id: this.generateFunctionalityId(),
        name: functionalityData.name || 'Unnamed Feature',
        purpose: functionalityData.purpose || '',
        preconditions: functionalityData.preconditions || [],
        mainActions: functionalityData.mainActions || [],
        expectedResults: functionalityData.expectedResults || [],
        category: this.categorizeFunction(functionalityData),
        tags: this.extractTags(functionalityData),
        metadata: {
          url: metadata?.url || '',
          pageTitle: metadata?.pageTitle || '',
          complexity: this.assessComplexity(functionalityData),
          ...metadata,
        },
      };

      console.log(`✅ Extracted functionality: ${functionality.name}`);
      this.emit('functionality_extracted', functionality);

      return functionality;
    } catch (error) {
      console.error('❌ Failed to extract functionality:', error);
      throw error;
    }
  }

  /**
   * 生成分步指南
   */
  generateStepByStepGuide(
    title: string,
    actions: Array<{
      action: string;
      element: string;
      details: string;
      screenshot?: Buffer;
    }>,
    description?: string,
    options?: {
      detectWarnings?: boolean;
      highlightKeyElements?: boolean;
      estimateTime?: boolean;
    }
  ): StepByStepGuide {
    console.log(`📋 Generating step-by-step guide: ${title}`);

    const detectWarnings = options?.detectWarnings !== false;
    const highlightKeyElements = options?.highlightKeyElements !== false;

    const steps: Step[] = actions.map((action, index) => {
      const stepNumber = index + 1;
      const screenshotId = action.screenshot ? this.generateScreenshotId() : undefined;

      // Detect warnings in this step
      const warnings = detectWarnings
        ? this.detectWarningsInText(action.details)
        : [];

      // Extract key elements
      const keyElements = highlightKeyElements
        ? this.extractKeyElements(action.element, action.details)
        : [];

      // Detect notes
      const notes = this.detectNotesInText(action.details);

      const step: Step = {
        stepNumber,
        action: this.formatAction(action.action),
        element: this.formatElement(action.element),
        details: this.formatDetails(action.details, keyElements),
        warnings,
        notes,
        keyElements,
      };

      if (screenshotId) {
        step.screenshot = {
          id: screenshotId,
          caption: `圖 ${screenshotId}: ${action.element}`,
        };
      }

      return step;
    });

    const guide: StepByStepGuide = {
      id: this.generateGuideId(),
      title,
      description: description || `本指南說明如何${title}`,
      steps,
      totalSteps: steps.length,
      estimatedTime: options?.estimateTime ? this.estimateCompletionTime(steps) : undefined,
      difficulty: this.assessGuideDifficulty(steps),
      prerequisites: this.extractPrerequisites(steps),
    };

    console.log(`✅ Generated guide with ${steps.length} steps`);
    this.emit('guide_generated', guide);

    return guide;
  }

  /**
   * 識別警告與注意事項
   */
  detectWarningsAndNotes(analysis: AnalysisResult | string): {
    warnings: Warning[];
    notes: string[];
  } {
    console.log('⚠️ Detecting warnings and notes...');

    const text =
      typeof analysis === 'string'
        ? analysis
        : analysis.content.rawResponse || JSON.stringify(analysis.content);

    const warnings = this.detectWarnings(text);
    const notes = this.detectNotes(text);

    console.log(`✅ Found ${warnings.length} warnings and ${notes.length} notes`);

    return { warnings, notes };
  }

  /**
   * 生成結構化內容
   */
  generateStructuredContent(
    analysis: AnalysisResult,
    options?: {
      extractFunctionality?: boolean;
      generateGuide?: boolean;
      detectWarnings?: boolean;
    }
  ): StructuredContent {
    console.log('🏗️ Generating structured content...');

    const extractFunc = options?.extractFunctionality !== false;
    const generateGuide = options?.generateGuide !== false;
    const detectWarn = options?.detectWarnings !== false;

    let functionality: Functionality | undefined;
    let guide: StepByStepGuide | undefined;
    let warnings: Warning[] = [];
    let notes: string[] = [];

    // Extract functionality if available
    if (extractFunc && analysis.content.functionality) {
      functionality = this.extractFunctionality(analysis);
    }

    // Generate guide if steps are available
    if (generateGuide && analysis.content.steps && analysis.content.steps.length > 0) {
      const title = functionality?.name || 'Operation Guide';
      guide = this.generateStepByStepGuide(
        title,
        analysis.content.steps,
        functionality?.purpose
      );
    }

    // Detect warnings and notes
    if (detectWarn) {
      const detected = this.detectWarningsAndNotes(analysis);
      warnings = detected.warnings;
      notes = detected.notes;
    }

    const content: StructuredContent = {
      functionality,
      guide,
      warnings,
      notes,
      metadata: {
        generatedAt: new Date(),
        sourceAnalysis: analysis.type,
        version: '1.0',
      },
    };

    console.log('✅ Structured content generated');
    this.emit('content_structured', content);

    return content;
  }

  /**
   * 檢測文字中的警告
   */
  private detectWarnings(text: string): Warning[] {
    const warnings: Warning[] = [];

    // Warning patterns with severity
    const warningPatterns = [
      { pattern: /(?:警告|warning|⚠️)[：:](.*?)(?:\n|$)/gi, type: 'warning', severity: 'high' },
      { pattern: /(?:注意|caution|⚡)[：:](.*?)(?:\n|$)/gi, type: 'caution', severity: 'medium' },
      { pattern: /(?:危險|danger|🚫)[：:](.*?)(?:\n|$)/gi, type: 'danger', severity: 'high' },
      { pattern: /(?:錯誤|error|❌)[：:](.*?)(?:\n|$)/gi, type: 'danger', severity: 'high' },
      { pattern: /不可逆|無法復原|permanently|irreversible/gi, type: 'danger', severity: 'high' },
      { pattern: /建議|recommend|💡/gi, type: 'note', severity: 'low' },
    ];

    warningPatterns.forEach(({ pattern, type, severity }) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const message = match[1]?.trim() || match[0];

        warnings.push({
          type: type as Warning['type'],
          title: this.getWarningTitle(type as Warning['type']),
          message,
          severity: severity as Warning['severity'],
          icon: this.getWarningIcon(type as Warning['type']),
        });
      }
    });

    // Deduplicate warnings
    return this.deduplicateWarnings(warnings);
  }

  /**
   * 檢測文字中的注意事項
   */
  private detectNotes(text: string): string[] {
    const notes: string[] = [];

    const notePatterns = [
      /(?:提示|tip|hint)[：:](.*?)(?:\n|$)/gi,
      /(?:說明|note|備註)[：:](.*?)(?:\n|$)/gi,
      /(?:重要|important)[：:](.*?)(?:\n|$)/gi,
    ];

    notePatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const note = match[1]?.trim() || match[0];
        if (note && !notes.includes(note)) {
          notes.push(note);
        }
      }
    });

    return notes;
  }

  /**
   * 檢測單一文字中的警告
   */
  private detectWarningsInText(text: string): string[] {
    const warnings = this.detectWarnings(text);
    return warnings.map((w) => w.message);
  }

  /**
   * 檢測單一文字中的注意事項
   */
  private detectNotesInText(text: string): string[] {
    return this.detectNotes(text);
  }

  /**
   * 提取關鍵元素
   */
  private extractKeyElements(element: string, details: string): string[] {
    const keyElements: string[] = [];

    // Add main element
    if (element) {
      keyElements.push(element);
    }

    // Extract quoted elements from details
    const quotedPattern = /「([^」]+)」|"([^"]+)"/g;
    let match;
    while ((match = quotedPattern.exec(details)) !== null) {
      const quoted = match[1] || match[2];
      if (quoted && !keyElements.includes(quoted)) {
        keyElements.push(quoted);
      }
    }

    // Extract button/link names
    const uiPattern = /(?:按鈕|button|連結|link|輸入框|input|下拉選單|dropdown)[：:]?\s*([^\s，。,]+)/gi;
    while ((match = uiPattern.exec(details)) !== null) {
      const uiElement = match[1];
      if (uiElement && !keyElements.includes(uiElement)) {
        keyElements.push(uiElement);
      }
    }

    return keyElements;
  }

  /**
   * 格式化動作
   */
  private formatAction(action: string): string {
    // Capitalize first letter
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  /**
   * 格式化元素
   */
  private formatElement(element: string): string {
    // Wrap in quotes if not already
    if (!element.startsWith('「') && !element.startsWith('"')) {
      return `「${element}」`;
    }
    return element;
  }

  /**
   * 格式化細節（高亮關鍵元素）
   */
  private formatDetails(details: string, keyElements: string[]): string {
    let formatted = details;

    // Highlight key elements with markdown bold
    keyElements.forEach((element) => {
      const regex = new RegExp(`(${element})(?!\\*\\*)`, 'g');
      formatted = formatted.replace(regex, '**$1**');
    });

    return formatted;
  }

  /**
   * 評估指南難度
   */
  private assessGuideDifficulty(steps: Step[]): 'beginner' | 'intermediate' | 'advanced' {
    const stepCount = steps.length;
    const hasWarnings = steps.some((s) => s.warnings && s.warnings.length > 0);
    const complexActions = steps.filter((s) =>
      /複雜|advanced|complex|configure|設定/.test(s.details)
    ).length;

    if (stepCount <= 3 && !hasWarnings && complexActions === 0) {
      return 'beginner';
    } else if (stepCount <= 8 && complexActions < 3) {
      return 'intermediate';
    } else {
      return 'advanced';
    }
  }

  /**
   * 估算完成時間
   */
  private estimateCompletionTime(steps: Step[]): string {
    // Simple estimation: 30 seconds per step, 1 minute per complex step
    let totalSeconds = 0;

    steps.forEach((step) => {
      const isComplex =
        /複雜|configure|設定|填寫表單/.test(step.details) ||
        (step.warnings && step.warnings.length > 0);

      totalSeconds += isComplex ? 60 : 30;
    });

    const minutes = Math.ceil(totalSeconds / 60);

    if (minutes < 60) {
      return `約 ${minutes} 分鐘`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `約 ${hours} 小時 ${remainingMinutes} 分鐘`;
    }
  }

  /**
   * 提取前置條件
   */
  private extractPrerequisites(steps: Step[]): string[] {
    const prerequisites: string[] = [];

    steps.forEach((step) => {
      // Look for prerequisite patterns
      const prereqPattern = /(?:需要|必須|prerequisite|require)[：:](.*?)(?:\n|$)/gi;
      let match;
      while ((match = prereqPattern.exec(step.details)) !== null) {
        const prereq = match[1]?.trim();
        if (prereq && !prerequisites.includes(prereq)) {
          prerequisites.push(prereq);
        }
      }
    });

    return prerequisites;
  }

  /**
   * 分類功能
   */
  private categorizeFunction(functionality: any): string {
    const name = functionality.name.toLowerCase();
    const purpose = functionality.purpose.toLowerCase();
    const text = `${name} ${purpose}`;

    const categories = [
      { name: '用戶管理', keywords: ['user', 'account', 'profile', '用戶', '帳戶', '個人資料'] },
      { name: '資料管理', keywords: ['data', 'record', 'entry', '資料', '記錄', '條目'] },
      { name: '設定', keywords: ['setting', 'config', 'preference', '設定', '配置', '偏好'] },
      { name: '報表', keywords: ['report', 'export', 'download', '報表', '匯出', '下載'] },
      { name: '搜尋', keywords: ['search', 'find', 'filter', '搜尋', '查找', '篩選'] },
      { name: '權限', keywords: ['permission', 'access', 'role', '權限', '存取', '角色'] },
      { name: '通知', keywords: ['notification', 'alert', 'message', '通知', '提醒', '訊息'] },
    ];

    for (const category of categories) {
      if (category.keywords.some((keyword) => text.includes(keyword))) {
        return category.name;
      }
    }

    return '一般功能';
  }

  /**
   * 提取標籤
   */
  private extractTags(functionality: any): string[] {
    const tags = new Set<string>();

    const allText = `${functionality.name} ${functionality.purpose} ${functionality.mainActions.join(' ')}`.toLowerCase();

    const tagPatterns = [
      { tag: 'CRUD', pattern: /create|add|edit|update|delete|新增|編輯|刪除/ },
      { tag: '表單', pattern: /form|input|submit|表單|輸入|提交/ },
      { tag: '批次操作', pattern: /batch|bulk|multiple|批次|批量|多個/ },
      { tag: '檔案上傳', pattern: /upload|file|attachment|上傳|檔案|附件/ },
      { tag: '需要權限', pattern: /permission|admin|authorize|權限|管理員|授權/ },
      { tag: '進階', pattern: /advanced|complex|configure|進階|複雜|配置/ },
    ];

    tagPatterns.forEach(({ tag, pattern }) => {
      if (pattern.test(allText)) {
        tags.add(tag);
      }
    });

    return Array.from(tags);
  }

  /**
   * 評估複雜度
   */
  private assessComplexity(functionality: any): 'simple' | 'medium' | 'complex' {
    const actionCount = functionality.mainActions.length;
    const preconditionCount = functionality.preconditions.length;
    const hasMultipleSteps = actionCount > 3;
    const hasPrerequisites = preconditionCount > 0;

    if (!hasMultipleSteps && !hasPrerequisites) {
      return 'simple';
    } else if (actionCount <= 5 && preconditionCount <= 2) {
      return 'medium';
    } else {
      return 'complex';
    }
  }

  /**
   * 去重警告
   */
  private deduplicateWarnings(warnings: Warning[]): Warning[] {
    const seen = new Set<string>();
    return warnings.filter((warning) => {
      const key = `${warning.type}-${warning.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 取得警告標題
   */
  private getWarningTitle(type: Warning['type']): string {
    const titles = {
      warning: '⚠️ 警告',
      caution: '⚡ 注意',
      danger: '🚫 危險',
      note: '💡 提示',
    };
    return titles[type];
  }

  /**
   * 取得警告圖示
   */
  private getWarningIcon(type: Warning['type']): string {
    const icons = {
      warning: '⚠️',
      caution: '⚡',
      danger: '🚫',
      note: '💡',
    };
    return icons[type];
  }

  /**
   * 生成功能 ID
   */
  private generateFunctionalityId(): string {
    return `func-${Date.now()}-${++this.functionalityCounter}`;
  }

  /**
   * 生成指南 ID
   */
  private generateGuideId(): string {
    return `guide-${Date.now()}-${++this.guideCounter}`;
  }

  /**
   * 生成截圖 ID
   */
  private generateScreenshotId(): string {
    return `${++this.screenshotCounter}`;
  }

  /**
   * 重置計數器
   */
  resetCounters(): void {
    this.screenshotCounter = 0;
    this.functionalityCounter = 0;
    this.guideCounter = 0;
    console.log('✅ Counters reset');
  }

  /**
   * 格式化為 Markdown
   */
  toMarkdown(content: StructuredContent): string {
    let markdown = '';

    // Functionality section
    if (content.functionality) {
      const func = content.functionality;
      markdown += `# ${func.name}\n\n`;
      markdown += `${func.purpose}\n\n`;

      if (func.preconditions.length > 0) {
        markdown += `## 前置條件\n\n`;
        func.preconditions.forEach((p) => {
          markdown += `- ${p}\n`;
        });
        markdown += `\n`;
      }

      if (func.mainActions.length > 0) {
        markdown += `## 主要操作\n\n`;
        func.mainActions.forEach((a) => {
          markdown += `- ${a}\n`;
        });
        markdown += `\n`;
      }

      if (func.expectedResults.length > 0) {
        markdown += `## 預期結果\n\n`;
        func.expectedResults.forEach((r) => {
          markdown += `- ${r}\n`;
        });
        markdown += `\n`;
      }
    }

    // Guide section
    if (content.guide) {
      const guide = content.guide;
      markdown += `## ${guide.title}\n\n`;
      markdown += `${guide.description}\n\n`;

      if (guide.prerequisites && guide.prerequisites.length > 0) {
        markdown += `### 前置需求\n\n`;
        guide.prerequisites.forEach((p) => {
          markdown += `- ${p}\n`;
        });
        markdown += `\n`;
      }

      markdown += `### 操作步驟\n\n`;
      guide.steps.forEach((step) => {
        markdown += `#### ${step.stepNumber}. ${step.action} ${step.element}\n\n`;
        markdown += `${step.details}\n\n`;

        if (step.screenshot) {
          markdown += `![${step.screenshot.caption}](${step.screenshot.url || 'screenshot-' + step.screenshot.id + '.jpg'})\n\n`;
        }

        if (step.warnings && step.warnings.length > 0) {
          step.warnings.forEach((w) => {
            markdown += `> ⚠️ **警告**: ${w}\n\n`;
          });
        }

        if (step.notes && step.notes.length > 0) {
          step.notes.forEach((n) => {
            markdown += `> 💡 ${n}\n\n`;
          });
        }
      });

      if (guide.estimatedTime) {
        markdown += `**預估時間**: ${guide.estimatedTime}\n\n`;
      }
    }

    // Warnings section
    if (content.warnings.length > 0) {
      markdown += `## ⚠️ 注意事項\n\n`;
      content.warnings.forEach((w) => {
        markdown += `### ${w.icon} ${w.title}\n\n`;
        markdown += `${w.message}\n\n`;
      });
    }

    // Notes section
    if (content.notes.length > 0) {
      markdown += `## 💡 補充說明\n\n`;
      content.notes.forEach((n) => {
        markdown += `- ${n}\n`;
      });
      markdown += `\n`;
    }

    return markdown;
  }
}
