/**
 * AI Questioning System
 * Task 3.2: 實作 AI 提問系統
 */

import { EventEmitter } from 'events';
import { AIQuestion, InteractiveElement } from '../types';
import { CDPWrapper } from '../browser/cdp_wrapper';
import { TimeoutError } from '../error/error_types';
import * as crypto from 'crypto';

export interface UncertaintyContext {
  type: 'ambiguous_elements' | 'unclear_purpose' | 'unknown_input_value' | 'authentication_required' | 'permission_required';
  url: string;
  screenshot: Buffer;
  elements?: InteractiveElement[];
  description: string;
  metadata?: any;
}

export interface QuestionResponse {
  questionId: string;
  type: 'answer' | 'demonstration' | 'skip' | 'unknown';
  answer?: string;
  selectedOption?: string;
  timestamp: Date;
}

export class AIQuestioningSystem extends EventEmitter {
  private cdp: CDPWrapper;
  private pendingQuestions: Map<string, AIQuestion> = new Map();
  private questionHistory: Array<{ question: AIQuestion; response: QuestionResponse }> = [];
  private responseCallbacks: Map<string, {
    resolve: (response: QuestionResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(cdp: CDPWrapper) {
    super();
    this.cdp = cdp;
  }

  /**
   * 檢測不確定性情況
   */
  async detectUncertainty(context: {
    url: string;
    elements: InteractiveElement[];
  }): Promise<UncertaintyContext | null> {
    try {
      // Case 1: Multiple similar elements (ambiguous)
      const ambiguousElements = this.detectAmbiguousElements(context.elements);
      if (ambiguousElements.length > 0) {
        const screenshot = await this.cdp.captureScreenshot({ format: 'jpeg', quality: 85 });

        return {
          type: 'ambiguous_elements',
          url: context.url,
          screenshot,
          elements: ambiguousElements,
          description: `Found ${ambiguousElements.length} similar elements that cannot be distinguished`,
        };
      }

      // Case 2: Elements with unclear purpose
      const unclearElements = this.detectUnclearElements(context.elements);
      if (unclearElements.length > 0) {
        const screenshot = await this.cdp.captureScreenshot({ format: 'jpeg', quality: 85 });

        return {
          type: 'unclear_purpose',
          url: context.url,
          screenshot,
          elements: unclearElements,
          description: `Found elements with unclear purpose: ${unclearElements.map(e => e.text).join(', ')}`,
        };
      }

      // Case 3: Form fields with unknown values
      const formFields = context.elements.filter(e => ['input', 'textarea'].includes(e.type));
      if (formFields.length > 0) {
        const unknownFields = formFields.filter(field => {
          const name = field.text.toLowerCase() || field.attributes.name?.toLowerCase() || '';
          // Check if we don't know what to fill
          return !this.hasKnownPattern(name);
        });

        if (unknownFields.length > 0) {
          const screenshot = await this.cdp.captureScreenshot({ format: 'jpeg', quality: 85 });

          return {
            type: 'unknown_input_value',
            url: context.url,
            screenshot,
            elements: unknownFields,
            description: `Don't know what values to fill for: ${unknownFields.map(e => e.text || e.attributes.name).join(', ')}`,
          };
        }
      }

      // Case 4: Authentication required
      const isAuthPage = await this.detectAuthenticationPage();
      if (isAuthPage) {
        const screenshot = await this.cdp.captureScreenshot({ format: 'jpeg', quality: 85 });

        return {
          type: 'authentication_required',
          url: context.url,
          screenshot,
          description: 'Page requires authentication to proceed',
        };
      }

      // Case 5: Permission/access denied
      const isPermissionDenied = await this.detectPermissionDenied();
      if (isPermissionDenied) {
        const screenshot = await this.cdp.captureScreenshot({ format: 'jpeg', quality: 85 });

        return {
          type: 'permission_required',
          url: context.url,
          screenshot,
          description: 'Access denied or special permissions required',
        };
      }

      return null;
    } catch (error) {
      console.error('Error detecting uncertainty:', error);
      return null;
    }
  }

  /**
   * 生成結構化問題
   */
  async generateQuestion(context: UncertaintyContext): Promise<AIQuestion> {
    const questionId = this.generateQuestionId();
    let question: AIQuestion;

    switch (context.type) {
      case 'ambiguous_elements':
        question = this.generateAmbiguousElementsQuestion(questionId, context);
        break;

      case 'unclear_purpose':
        question = this.generateUnclearPurposeQuestion(questionId, context);
        break;

      case 'unknown_input_value':
        question = this.generateInputValueQuestion(questionId, context);
        break;

      case 'authentication_required':
        question = this.generateAuthenticationQuestion(questionId, context);
        break;

      case 'permission_required':
        question = this.generatePermissionQuestion(questionId, context);
        break;

      default:
        question = this.generateGenericQuestion(questionId, context);
    }

    // Store pending question
    this.pendingQuestions.set(questionId, question);

    // Emit question event
    this.emit('question_generated', question);

    console.log(`Generated question: ${questionId} (${question.type})`);

    return question;
  }

  /**
   * 等待人類回應
   */
  async waitForHumanResponse(
    questionId: string,
    timeout: number = 300000 // 5 minutes default
  ): Promise<QuestionResponse> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.responseCallbacks.delete(questionId);
        this.emit('question_timeout', questionId);
        reject(new TimeoutError(`Question ${questionId} timed out after ${timeout}ms`));
      }, timeout);

      // Store callbacks
      this.responseCallbacks.set(questionId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      console.log(`Waiting for response to question ${questionId} (timeout: ${timeout}ms)`);
    });
  }

  /**
   * 提交人類回應
   */
  submitResponse(response: QuestionResponse): void {
    const callbacks = this.responseCallbacks.get(response.questionId);

    if (!callbacks) {
      console.warn(`No pending question found for ${response.questionId}`);
      return;
    }

    // Clear timeout
    clearTimeout(callbacks.timeout);

    // Remove from pending
    const question = this.pendingQuestions.get(response.questionId);
    if (question) {
      this.pendingQuestions.delete(response.questionId);

      // Add to history
      this.questionHistory.push({ question, response });
    }

    // Resolve promise
    this.responseCallbacks.delete(response.questionId);
    callbacks.resolve(response);

    // Emit response event
    this.emit('response_received', response);

    console.log(`Response received for question ${response.questionId}: ${response.type}`);
  }

  /**
   * 檢測模糊元素（多個相似元素無法區分）
   */
  private detectAmbiguousElements(elements: InteractiveElement[]): InteractiveElement[] {
    const ambiguous: InteractiveElement[] = [];
    const seen = new Map<string, InteractiveElement[]>();

    // Group by text
    elements.forEach(element => {
      const key = `${element.type}-${element.text.trim()}`;
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(element);
    });

    // Find groups with multiple elements
    seen.forEach((group, key) => {
      if (group.length > 1) {
        // Check if they're actually different (not just duplicate detection artifacts)
        const uniqueSelectors = new Set(group.map(e => e.selector));
        if (uniqueSelectors.size > 1) {
          ambiguous.push(...group);
        }
      }
    });

    return ambiguous;
  }

  /**
   * 檢測用途不明確的元素
   */
  private detectUnclearElements(elements: InteractiveElement[]): InteractiveElement[] {
    return elements.filter(element => {
      const text = element.text.toLowerCase().trim();

      // Too short or generic text
      if (text.length < 2) return true;

      // Common unclear terms
      const unclearTerms = ['click', 'here', 'button', 'link', 'more', 'ok', 'yes', 'no'];
      if (unclearTerms.includes(text)) return true;

      // Only symbols or numbers
      if (/^[^a-z]+$/i.test(text)) return true;

      return false;
    });
  }

  /**
   * 檢查是否有已知的模式
   */
  private hasKnownPattern(name: string): boolean {
    const knownPatterns = [
      'email', 'password', 'username', 'name', 'phone', 'tel',
      'address', 'city', 'zip', 'postal', 'country',
      'date', 'time', 'age', 'number', 'url', 'website'
    ];

    return knownPatterns.some(pattern => name.includes(pattern));
  }

  /**
   * 檢測認證頁面
   */
  private async detectAuthenticationPage(): Promise<boolean> {
    try {
      const result = await this.cdp.evaluate(`
        (() => {
          const text = document.body.innerText.toLowerCase();
          const keywords = ['login', 'sign in', 'log in', 'authentication', 'credentials'];

          for (const keyword of keywords) {
            if (text.includes(keyword)) return true;
          }

          // Check for password input
          const passwordInputs = document.querySelectorAll('input[type="password"]');
          if (passwordInputs.length > 0) return true;

          return false;
        })()
      `);

      return result === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 檢測權限被拒
   */
  private async detectPermissionDenied(): Promise<boolean> {
    try {
      const result = await this.cdp.evaluate(`
        (() => {
          const text = document.body.innerText.toLowerCase();
          const keywords = ['access denied', 'permission denied', 'forbidden', 'unauthorized', '403', '401'];

          for (const keyword of keywords) {
            if (text.includes(keyword)) return true;
          }

          return false;
        })()
      `);

      return result === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 生成模糊元素問題
   */
  private generateAmbiguousElementsQuestion(
    questionId: string,
    context: UncertaintyContext
  ): AIQuestion {
    const elements = context.elements || [];
    const options = elements.map((e, i) =>
      `Option ${i + 1}: "${e.text}" at position (${e.position.x}, ${e.position.y})`
    );

    return {
      id: questionId,
      type: 'choice',
      question: `I found multiple similar elements with the same text. Which one should I interact with?\n\n${context.description}`,
      context: {
        url: context.url,
        screenshot: context.screenshot.toString('base64'),
        elements: elements,
      },
      options,
      timeout: 300000,
    };
  }

  /**
   * 生成用途不明確問題
   */
  private generateUnclearPurposeQuestion(
    questionId: string,
    context: UncertaintyContext
  ): AIQuestion {
    const elements = context.elements || [];
    const elementsList = elements.map(e => `"${e.text}" (${e.type})`).join(', ');

    return {
      id: questionId,
      type: 'fill_in',
      question: `What is the purpose of these elements?\n\nElements: ${elementsList}\n\nPlease describe what these elements do or if I should interact with them.`,
      context: {
        url: context.url,
        screenshot: context.screenshot.toString('base64'),
        elements: elements,
      },
      timeout: 300000,
    };
  }

  /**
   * 生成輸入值問題
   */
  private generateInputValueQuestion(
    questionId: string,
    context: UncertaintyContext
  ): AIQuestion {
    const fields = context.elements || [];
    const fieldsList = fields.map(f =>
      `- ${f.text || f.attributes.name || f.attributes.placeholder || 'Unknown field'} (${f.type})`
    ).join('\n');

    return {
      id: questionId,
      type: 'fill_in',
      question: `I don't know what values to fill for these form fields. Can you provide the values or demonstrate how to fill them?\n\nFields:\n${fieldsList}`,
      context: {
        url: context.url,
        screenshot: context.screenshot.toString('base64'),
        elements: fields,
      },
      timeout: 300000,
    };
  }

  /**
   * 生成認證問題
   */
  private generateAuthenticationQuestion(
    questionId: string,
    context: UncertaintyContext
  ): AIQuestion {
    return {
      id: questionId,
      type: 'demonstration',
      question: `This page requires authentication. Please demonstrate how to log in, or provide credentials.\n\n${context.description}`,
      context: {
        url: context.url,
        screenshot: context.screenshot.toString('base64'),
        elements: [],
      },
      timeout: 600000, // 10 minutes for auth
    };
  }

  /**
   * 生成權限問題
   */
  private generatePermissionQuestion(
    questionId: string,
    context: UncertaintyContext
  ): AIQuestion {
    return {
      id: questionId,
      type: 'demonstration',
      question: `Access to this page is denied or requires special permissions. How should I proceed?\n\n${context.description}`,
      context: {
        url: context.url,
        screenshot: context.screenshot.toString('base64'),
        elements: [],
      },
      timeout: 300000,
    };
  }

  /**
   * 生成通用問題
   */
  private generateGenericQuestion(
    questionId: string,
    context: UncertaintyContext
  ): AIQuestion {
    return {
      id: questionId,
      type: 'fill_in',
      question: `I encountered an uncertain situation:\n\n${context.description}\n\nHow should I proceed?`,
      context: {
        url: context.url,
        screenshot: context.screenshot.toString('base64'),
        elements: context.elements || [],
      },
      timeout: 300000,
    };
  }

  /**
   * 生成問題 ID
   */
  private generateQuestionId(): string {
    return `question-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 取得待處理問題
   */
  getPendingQuestions(): AIQuestion[] {
    return Array.from(this.pendingQuestions.values());
  }

  /**
   * 取得問題歷史
   */
  getQuestionHistory(): Array<{ question: AIQuestion; response: QuestionResponse }> {
    return [...this.questionHistory];
  }

  /**
   * 取得統計資訊
   */
  getStatistics(): {
    totalQuestions: number;
    pendingQuestions: number;
    answeredQuestions: number;
    demonstratedQuestions: number;
    skippedQuestions: number;
    averageResponseTime: number;
  } {
    const answeredQuestions = this.questionHistory.filter(h => h.response.type === 'answer').length;
    const demonstratedQuestions = this.questionHistory.filter(h => h.response.type === 'demonstration').length;
    const skippedQuestions = this.questionHistory.filter(h => h.response.type === 'skip').length;

    // Calculate average response time
    const responseTimes = this.questionHistory.map(h => {
      // Simplified: assume 1 minute average for now
      // In production, track actual timestamps
      return 60000;
    });

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    return {
      totalQuestions: this.questionHistory.length + this.pendingQuestions.size,
      pendingQuestions: this.pendingQuestions.size,
      answeredQuestions,
      demonstratedQuestions,
      skippedQuestions,
      averageResponseTime,
    };
  }

  /**
   * 清除所有待處理問題
   */
  clearPendingQuestions(): void {
    // Reject all pending callbacks
    this.responseCallbacks.forEach((callbacks, questionId) => {
      clearTimeout(callbacks.timeout);
      callbacks.reject(new Error('Questions cleared'));
    });

    this.pendingQuestions.clear();
    this.responseCallbacks.clear();

    console.log('All pending questions cleared');
  }
}
