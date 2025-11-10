/**
 * Human Questioning and Pause System
 * Task 3.4: 實作人類提問與暫停系統
 */

import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';

export interface HumanQuestion {
  id: string;
  question: string;
  context: {
    currentUrl: string;
    screenshot?: string;
    domSnapshot?: string;
    exploredPath?: string[];
  };
  timestamp: Date;
}

export interface AIAnswer {
  questionId: string;
  answer: string;
  confidence: number;
  suggestions?: string[];
  timestamp: Date;
}

export interface ExplorationAdjustment {
  type: 'skip_area' | 'focus_on' | 'change_priority' | 'add_urls' | 'exclude_pattern';
  description: string;
  params: any;
}

export interface PausedState {
  url: string;
  explorationQueue: string[];
  exploredUrls: string[];
  collectedData: any;
  pausedAt: Date;
}

export class HumanQuestioningSystem extends EventEmitter {
  private anthropic: Anthropic;
  private isPaused: boolean = false;
  private pausedState: PausedState | null = null;
  private questionHistory: Array<{ question: HumanQuestion; answer: AIAnswer }> = [];
  private pendingAdjustments: ExplorationAdjustment[] = [];

  constructor() {
    super();

    // Initialize Claude API client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not set - AI answering will not work');
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey || 'dummy-key',
    });
  }

  /**
   * 暫停 AI 探索
   */
  pauseExploration(state: {
    url: string;
    explorationQueue: string[];
    exploredUrls: string[];
    collectedData?: any;
  }): void {
    if (this.isPaused) {
      console.warn('Exploration already paused');
      return;
    }

    this.isPaused = true;
    this.pausedState = {
      url: state.url,
      explorationQueue: [...state.explorationQueue],
      exploredUrls: [...state.exploredUrls],
      collectedData: state.collectedData || {},
      pausedAt: new Date(),
    };

    console.log('⏸️ Exploration paused');
    this.emit('exploration_paused', this.pausedState);
  }

  /**
   * 處理人類提問
   */
  async handleHumanQuestion(question: string, context: {
    currentUrl: string;
    screenshot?: Buffer;
    domSnapshot?: string;
    exploredPath?: string[];
  }): Promise<AIAnswer> {
    const humanQuestion: HumanQuestion = {
      id: this.generateQuestionId(),
      question,
      context: {
        currentUrl: context.currentUrl,
        screenshot: context.screenshot?.toString('base64'),
        domSnapshot: context.domSnapshot,
        exploredPath: context.exploredPath,
      },
      timestamp: new Date(),
    };

    console.log(`❓ Human question: ${question}`);

    // Build context for Claude
    const contextDescription = this.buildContextDescription(context);

    try {
      // Call Claude API
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: this.buildPrompt(question, contextDescription, context.screenshot),
        }],
      });

      // Extract answer
      const answerText = response.content[0].type === 'text'
        ? response.content[0].text
        : 'Unable to process answer';

      // Parse suggestions if any
      const suggestions = this.extractSuggestions(answerText);

      const aiAnswer: AIAnswer = {
        questionId: humanQuestion.id,
        answer: answerText,
        confidence: 0.8, // TODO: Implement confidence scoring
        suggestions,
        timestamp: new Date(),
      };

      // Store in history
      this.questionHistory.push({ question: humanQuestion, answer: aiAnswer });

      console.log(`💬 AI answer: ${answerText.substring(0, 100)}...`);
      this.emit('answer_generated', aiAnswer);

      return aiAnswer;
    } catch (error) {
      console.error('Error calling Claude API:', error);

      const errorAnswer: AIAnswer = {
        questionId: humanQuestion.id,
        answer: 'I apologize, but I encountered an error while processing your question. Please try rephrasing it or check the API configuration.',
        confidence: 0,
        timestamp: new Date(),
      };

      this.questionHistory.push({ question: humanQuestion, answer: errorAnswer });

      return errorAnswer;
    }
  }

  /**
   * 調整探索方向
   */
  adjustExplorationDirection(adjustment: ExplorationAdjustment): void {
    console.log(`🎯 Exploration adjustment: ${adjustment.type} - ${adjustment.description}`);

    this.pendingAdjustments.push(adjustment);
    this.emit('direction_adjusted', adjustment);
  }

  /**
   * 取得並清除待處理的調整
   */
  getPendingAdjustments(): ExplorationAdjustment[] {
    const adjustments = [...this.pendingAdjustments];
    this.pendingAdjustments = [];
    return adjustments;
  }

  /**
   * 應用調整到探索佇列
   */
  applyAdjustments(
    queue: string[],
    explored: Set<string>,
    adjustments: ExplorationAdjustment[]
  ): { queue: string[]; explored: Set<string> } {
    let modifiedQueue = [...queue];
    let modifiedExplored = new Set(explored);

    adjustments.forEach(adjustment => {
      switch (adjustment.type) {
        case 'skip_area':
          // Remove URLs matching the skip pattern
          const skipPattern = new RegExp(adjustment.params.pattern, 'i');
          modifiedQueue = modifiedQueue.filter(url => !skipPattern.test(url));
          console.log(`Skipped area matching: ${adjustment.params.pattern}`);
          break;

        case 'focus_on':
          // Prioritize URLs matching the focus pattern
          const focusPattern = new RegExp(adjustment.params.pattern, 'i');
          const focused = modifiedQueue.filter(url => focusPattern.test(url));
          const others = modifiedQueue.filter(url => !focusPattern.test(url));
          modifiedQueue = [...focused, ...others];
          console.log(`Focused on: ${adjustment.params.pattern}`);
          break;

        case 'change_priority':
          // Reorder queue based on new priority
          // Implementation depends on priority system
          console.log(`Priority changed: ${adjustment.description}`);
          break;

        case 'add_urls':
          // Add specific URLs to explore
          const newUrls = adjustment.params.urls || [];
          modifiedQueue.unshift(...newUrls);
          console.log(`Added ${newUrls.length} URLs to queue`);
          break;

        case 'exclude_pattern':
          // Remove URLs matching exclude pattern
          const excludePattern = new RegExp(adjustment.params.pattern, 'i');
          modifiedQueue = modifiedQueue.filter(url => !excludePattern.test(url));
          console.log(`Excluded pattern: ${adjustment.params.pattern}`);
          break;

        default:
          console.warn(`Unknown adjustment type: ${adjustment.type}`);
      }
    });

    return {
      queue: modifiedQueue,
      explored: modifiedExplored,
    };
  }

  /**
   * 恢復探索
   */
  resumeExploration(): PausedState | null {
    if (!this.isPaused) {
      console.warn('Exploration not paused');
      return null;
    }

    const state = this.pausedState;
    this.isPaused = false;
    this.pausedState = null;

    console.log('▶️ Exploration resumed');
    this.emit('exploration_resumed', state);

    return state;
  }

  /**
   * 建立上下文描述
   */
  private buildContextDescription(context: {
    currentUrl: string;
    domSnapshot?: string;
    exploredPath?: string[];
  }): string {
    let description = `Current URL: ${context.currentUrl}\n\n`;

    if (context.exploredPath && context.exploredPath.length > 0) {
      description += `Exploration path:\n`;
      context.exploredPath.forEach((url, i) => {
        description += `${i + 1}. ${url}\n`;
      });
      description += '\n';
    }

    if (context.domSnapshot) {
      // Truncate DOM snapshot if too long
      const maxLength = 2000;
      const snapshot = context.domSnapshot.length > maxLength
        ? context.domSnapshot.substring(0, maxLength) + '...[truncated]'
        : context.domSnapshot;

      description += `DOM Structure:\n${snapshot}\n\n`;
    }

    return description;
  }

  /**
   * 建立 Claude prompt
   */
  private buildPrompt(
    question: string,
    contextDescription: string,
    screenshot?: Buffer
  ): any {
    const basePrompt = `You are an AI assistant helping with web exploration and documentation generation.

Context:
${contextDescription}

The user is asking: "${question}"

Please provide a helpful, concise answer based on the context. If you have suggestions for adjusting the exploration, include them in a "Suggestions:" section at the end.`;

    if (screenshot) {
      // Include screenshot in multimodal message
      return [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: screenshot.toString('base64'),
          },
        },
        {
          type: 'text',
          text: basePrompt,
        },
      ];
    }

    return basePrompt;
  }

  /**
   * 從答案中提取建議
   */
  private extractSuggestions(answer: string): string[] {
    const suggestions: string[] = [];

    // Look for "Suggestions:" section
    const suggestionsMatch = answer.match(/Suggestions?:(.+?)(?:\n\n|$)/is);

    if (suggestionsMatch) {
      const suggestionText = suggestionsMatch[1];

      // Extract bullet points or numbered list
      const lines = suggestionText.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.match(/^[-*•\d]+\.?\s+/)) {
          const suggestion = trimmed.replace(/^[-*•\d]+\.?\s+/, '').trim();
          if (suggestion) {
            suggestions.push(suggestion);
          }
        }
      });
    }

    return suggestions;
  }

  /**
   * 生成問題 ID
   */
  private generateQuestionId(): string {
    return `hq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 取得暫停狀態
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * 取得當前暫停的狀態
   */
  getPausedState(): PausedState | null {
    return this.pausedState ? { ...this.pausedState } : null;
  }

  /**
   * 取得問題歷史
   */
  getQuestionHistory(): Array<{ question: HumanQuestion; answer: AIAnswer }> {
    return [...this.questionHistory];
  }

  /**
   * 清除問題歷史
   */
  clearHistory(): void {
    this.questionHistory = [];
    console.log('Question history cleared');
  }

  /**
   * 取得統計資訊
   */
  getStatistics(): {
    totalQuestions: number;
    totalAdjustments: number;
    averageConfidence: number;
    pauseCount: number;
  } {
    const totalQuestions = this.questionHistory.length;
    const totalAdjustments = this.pendingAdjustments.length;

    const confidences = this.questionHistory.map(h => h.answer.confidence);
    const averageConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    return {
      totalQuestions,
      totalAdjustments,
      averageConfidence,
      pauseCount: this.isPaused ? 1 : 0,
    };
  }

  /**
   * 快速指令處理
   */
  async processQuickCommand(command: string, context: any): Promise<ExplorationAdjustment | null> {
    const lowerCommand = command.toLowerCase().trim();

    // Skip commands
    if (lowerCommand.startsWith('skip ')) {
      const pattern = lowerCommand.replace('skip ', '').trim();
      return {
        type: 'skip_area',
        description: `Skip URLs matching: ${pattern}`,
        params: { pattern },
      };
    }

    // Focus commands
    if (lowerCommand.startsWith('focus on ')) {
      const pattern = lowerCommand.replace('focus on ', '').trim();
      return {
        type: 'focus_on',
        description: `Focus on URLs matching: ${pattern}`,
        params: { pattern },
      };
    }

    // Exclude commands
    if (lowerCommand.startsWith('exclude ')) {
      const pattern = lowerCommand.replace('exclude ', '').trim();
      return {
        type: 'exclude_pattern',
        description: `Exclude URLs matching: ${pattern}`,
        params: { pattern },
      };
    }

    // Add URL commands
    if (lowerCommand.startsWith('add ')) {
      const urls = lowerCommand.replace('add ', '').split(',').map(u => u.trim());
      return {
        type: 'add_urls',
        description: `Add ${urls.length} URLs to queue`,
        params: { urls },
      };
    }

    return null;
  }
}
