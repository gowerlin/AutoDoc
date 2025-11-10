/**
 * Human Operation Observation System
 * Task 3.3: 實作人類操作觀察系統
 */

import { EventEmitter } from 'events';
import { HumanAction } from '../types';
import { CDPWrapper } from '../browser/cdp_wrapper';

export interface ActionSequence {
  actions: HumanAction[];
  startTime: Date;
  endTime?: Date;
  description?: string;
}

export interface OperationPattern {
  id: string;
  name: string;
  pattern: string[];
  frequency: number;
  examples: ActionSequence[];
}

export interface ObservationSummary {
  totalActions: number;
  actionTypes: Map<string, number>;
  clickedElements: string[];
  inputFields: Array<{ selector: string; value: string }>;
  navigationPath: string[];
  duration: number;
}

export class HumanObservationSystem extends EventEmitter {
  private cdp: CDPWrapper;
  private isObserving: boolean = false;
  private currentSequence: ActionSequence | null = null;
  private actionHistory: HumanAction[] = [];
  private patterns: Map<string, OperationPattern> = new Map();
  private knowledgeBase: Map<string, any> = new Map();

  constructor(cdp: CDPWrapper) {
    super();
    this.cdp = cdp;
  }

  /**
   * 啟動觀察模式
   */
  async startObservationMode(): Promise<void> {
    if (this.isObserving) {
      console.warn('Already in observation mode');
      return;
    }

    this.isObserving = true;
    this.currentSequence = {
      actions: [],
      startTime: new Date(),
    };

    // Enable DOM debugging in CDP
    await this.cdp.evaluate(`
      (() => {
        // Inject observation tracking
        window.__autodoc_observation = {
          actions: [],
          startTime: Date.now()
        };

        // Track clicks
        document.addEventListener('click', (e) => {
          const target = e.target;
          const selector = __getSelector(target);

          window.__autodoc_observation.actions.push({
            type: 'click',
            selector: selector,
            timestamp: Date.now(),
            coordinates: { x: e.clientX, y: e.clientY }
          });
        }, true);

        // Track inputs
        document.addEventListener('input', (e) => {
          const target = e.target;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            const selector = __getSelector(target);

            window.__autodoc_observation.actions.push({
              type: 'input',
              selector: selector,
              value: target.value,
              timestamp: Date.now()
            });
          }
        }, true);

        // Track scrolls
        let scrollTimeout;
        window.addEventListener('scroll', (e) => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            window.__autodoc_observation.actions.push({
              type: 'scroll',
              coordinates: { x: window.scrollX, y: window.scrollY },
              timestamp: Date.now()
            });
          }, 100);
        }, true);

        // Track hovers (throttled)
        let hoverTimeout;
        document.addEventListener('mouseover', (e) => {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            const target = e.target;
            const selector = __getSelector(target);

            window.__autodoc_observation.actions.push({
              type: 'hover',
              selector: selector,
              timestamp: Date.now()
            });
          }, 500);
        }, true);

        // Helper function to get CSS selector
        function __getSelector(el) {
          if (!el) return '';
          if (el.id) return '#' + el.id;

          const path = [];
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();

            if (el.id) {
              selector = '#' + el.id;
              path.unshift(selector);
              break;
            }

            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c && !c.match(/^\\d/)).slice(0, 2);
              if (classes.length > 0) {
                selector += '.' + classes.join('.');
              }
            }

            path.unshift(selector);
            el = el.parentNode;

            if (path.length > 5) break;
          }

          return path.join(' > ');
        }
      })()
    `);

    console.log('👁️ Observation mode started - tracking human actions');
    this.emit('observation_started');
  }

  /**
   * 停止觀察模式並分析
   */
  async stopObservationMode(): Promise<ActionSequence> {
    if (!this.isObserving) {
      throw new Error('Not in observation mode');
    }

    // Collect recorded actions from the page
    const recordedActions = await this.cdp.evaluate(`
      (() => {
        if (!window.__autodoc_observation) return [];
        return window.__autodoc_observation.actions;
      })()
    `);

    // Convert to HumanAction format
    if (Array.isArray(recordedActions)) {
      recordedActions.forEach((action: any) => {
        const humanAction: HumanAction = {
          type: action.type,
          selector: action.selector || '',
          value: action.value,
          coordinates: action.coordinates,
          timestamp: new Date(action.timestamp),
        };

        this.currentSequence!.actions.push(humanAction);
        this.actionHistory.push(humanAction);
      });
    }

    this.currentSequence!.endTime = new Date();
    this.isObserving = false;

    const sequence = this.currentSequence;

    console.log(`👁️ Observation stopped - recorded ${sequence!.actions.length} actions`);
    this.emit('observation_stopped', sequence);

    // Analyze the sequence
    await this.analyzeHumanActions(sequence!.actions);

    // Learn from the demonstration
    await this.learnFromDemonstration(sequence!.actions);

    return sequence!;
  }

  /**
   * 分析人類操作序列
   */
  async analyzeHumanActions(actions: HumanAction[]): Promise<ObservationSummary> {
    // Remove redundant actions
    const keyActions = this.extractKeySteps(actions);

    // Identify operation patterns
    const patterns = this.identifyPatterns(keyActions);

    // Generate natural language description
    const description = this.generateOperationDescription(keyActions);

    // Calculate statistics
    const actionTypes = new Map<string, number>();
    const clickedElements: string[] = [];
    const inputFields: Array<{ selector: string; value: string }> = [];
    const navigationPath: string[] = [];

    keyActions.forEach(action => {
      // Count action types
      actionTypes.set(action.type, (actionTypes.get(action.type) || 0) + 1);

      // Track clicked elements
      if (action.type === 'click' && action.selector) {
        clickedElements.push(action.selector);
      }

      // Track input fields
      if (action.type === 'input' && action.selector && action.value) {
        inputFields.push({
          selector: action.selector,
          value: action.value,
        });
      }
    });

    const duration = actions.length > 0
      ? actions[actions.length - 1].timestamp.getTime() - actions[0].timestamp.getTime()
      : 0;

    const summary: ObservationSummary = {
      totalActions: keyActions.length,
      actionTypes,
      clickedElements,
      inputFields,
      navigationPath,
      duration,
    };

    console.log(`📊 Analysis complete: ${keyActions.length} key steps identified`);
    console.log(`📝 Description: ${description}`);

    this.emit('analysis_complete', { summary, description, patterns });

    return summary;
  }

  /**
   * 提取關鍵步驟（去除冗餘操作）
   */
  private extractKeySteps(actions: HumanAction[]): HumanAction[] {
    const keySteps: HumanAction[] = [];
    let lastAction: HumanAction | null = null;

    actions.forEach(action => {
      // Skip hovers (usually not key actions)
      if (action.type === 'hover') return;

      // Skip redundant scrolls
      if (action.type === 'scroll' && lastAction?.type === 'scroll') return;

      // Skip rapid consecutive inputs to same field
      if (
        action.type === 'input' &&
        lastAction?.type === 'input' &&
        action.selector === lastAction.selector
      ) {
        // Update last action's value instead
        if (keySteps.length > 0) {
          keySteps[keySteps.length - 1].value = action.value;
        }
        return;
      }

      keySteps.push(action);
      lastAction = action;
    });

    return keySteps;
  }

  /**
   * 識別操作模式
   */
  private identifyPatterns(actions: HumanAction[]): string[] {
    const patterns: string[] = [];

    // Pattern 1: Click -> Wait -> Input
    for (let i = 0; i < actions.length - 2; i++) {
      if (
        actions[i].type === 'click' &&
        actions[i + 1].type === 'input'
      ) {
        patterns.push('click_then_input');
      }
    }

    // Pattern 2: Multiple inputs (form filling)
    let consecutiveInputs = 0;
    actions.forEach(action => {
      if (action.type === 'input') {
        consecutiveInputs++;
      } else {
        if (consecutiveInputs >= 3) {
          patterns.push('form_filling');
        }
        consecutiveInputs = 0;
      }
    });

    // Pattern 3: Click sequence (navigation)
    let consecutiveClicks = 0;
    actions.forEach(action => {
      if (action.type === 'click') {
        consecutiveClicks++;
      } else {
        if (consecutiveClicks >= 3) {
          patterns.push('navigation_sequence');
        }
        consecutiveClicks = 0;
      }
    });

    // Pattern 4: Scroll then click
    for (let i = 0; i < actions.length - 1; i++) {
      if (
        actions[i].type === 'scroll' &&
        actions[i + 1].type === 'click'
      ) {
        patterns.push('scroll_to_element');
      }
    }

    return [...new Set(patterns)]; // Remove duplicates
  }

  /**
   * 生成操作摘要（自然語言描述）
   */
  private generateOperationDescription(actions: HumanAction[]): string {
    const steps: string[] = [];

    actions.forEach((action, index) => {
      let description = '';

      switch (action.type) {
        case 'click':
          description = `Click on ${this.simplifySelector(action.selector)}`;
          break;

        case 'input':
          const fieldName = this.extractFieldName(action.selector);
          description = `Enter "${action.value}" in ${fieldName}`;
          break;

        case 'scroll':
          description = `Scroll to position (${action.coordinates?.x}, ${action.coordinates?.y})`;
          break;

        case 'select':
          description = `Select option in ${this.simplifySelector(action.selector)}`;
          break;

        default:
          description = `Perform ${action.type} action`;
      }

      steps.push(`${index + 1}. ${description}`);
    });

    return steps.join('\n');
  }

  /**
   * 從示範中學習
   */
  async learnFromDemonstration(actions: HumanAction[]): Promise<void> {
    // Extract key patterns
    const patterns = this.identifyPatterns(actions);

    // Store patterns in knowledge base
    patterns.forEach(pattern => {
      if (!this.patterns.has(pattern)) {
        this.patterns.set(pattern, {
          id: pattern,
          name: pattern,
          pattern: [],
          frequency: 0,
          examples: [],
        });
      }

      const patternData = this.patterns.get(pattern)!;
      patternData.frequency++;
      patternData.examples.push({
        actions,
        startTime: new Date(),
      });

      // Keep only last 5 examples
      if (patternData.examples.length > 5) {
        patternData.examples.shift();
      }
    });

    // Learn element interactions
    const clickActions = actions.filter(a => a.type === 'click');
    clickActions.forEach(action => {
      const selector = action.selector;
      if (selector) {
        // Store as high-priority element
        this.knowledgeBase.set(`priority:${selector}`, {
          selector,
          type: 'learned_from_human',
          priority: 10,
          learnedAt: new Date(),
        });
      }
    });

    // Learn form filling patterns
    const inputActions = actions.filter(a => a.type === 'input');
    inputActions.forEach(action => {
      if (action.selector && action.value) {
        this.knowledgeBase.set(`input:${action.selector}`, {
          selector: action.selector,
          sampleValue: action.value,
          type: 'form_field',
          learnedAt: new Date(),
        });
      }
    });

    console.log(`🧠 Learning complete: ${patterns.length} patterns identified`);
    console.log(`📚 Knowledge base size: ${this.knowledgeBase.size} entries`);

    this.emit('learning_complete', {
      patterns: patterns.length,
      knowledgeBaseSize: this.knowledgeBase.size,
    });
  }

  /**
   * 檢查是否學習了類似的操作
   */
  hasLearnedSimilarOperation(selector: string): boolean {
    return this.knowledgeBase.has(`priority:${selector}`) ||
           this.knowledgeBase.has(`input:${selector}`);
  }

  /**
   * 取得學習到的優先級元素
   */
  getLearnedPriorityElements(): string[] {
    const elements: string[] = [];

    this.knowledgeBase.forEach((value, key) => {
      if (key.startsWith('priority:')) {
        elements.push(value.selector);
      }
    });

    return elements;
  }

  /**
   * 取得學習到的表單欄位值
   */
  getLearnedInputValue(selector: string): string | null {
    const knowledge = this.knowledgeBase.get(`input:${selector}`);
    return knowledge ? knowledge.sampleValue : null;
  }

  /**
   * 簡化 CSS 選擇器顯示
   */
  private simplifySelector(selector: string): string {
    if (!selector) return 'element';

    // Extract ID
    if (selector.includes('#')) {
      const id = selector.match(/#([a-zA-Z0-9_-]+)/)?.[1];
      if (id) return `element #${id}`;
    }

    // Extract meaningful class
    if (selector.includes('.')) {
      const className = selector.match(/\.([a-zA-Z0-9_-]+)/)?.[1];
      if (className) return `element .${className}`;
    }

    // Extract tag name
    const tag = selector.split(' ').pop()?.split('.')[0].split('#')[0];
    return tag || 'element';
  }

  /**
   * 提取欄位名稱
   */
  private extractFieldName(selector: string): string {
    // Try to extract from ID
    if (selector.includes('#')) {
      const id = selector.match(/#([a-zA-Z0-9_-]+)/)?.[1];
      if (id) return id.replace(/-/g, ' ').replace(/_/g, ' ');
    }

    // Try to extract from name attribute
    if (selector.includes('[name=')) {
      const name = selector.match(/\[name="?([^"\]]+)"?\]/)?.[1];
      if (name) return name.replace(/-/g, ' ').replace(/_/g, ' ');
    }

    return 'field';
  }

  /**
   * 取得操作模式
   */
  getPatterns(): OperationPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 取得知識庫
   */
  getKnowledgeBase(): Map<string, any> {
    return new Map(this.knowledgeBase);
  }

  /**
   * 取得動作歷史
   */
  getActionHistory(): HumanAction[] {
    return [...this.actionHistory];
  }

  /**
   * 清除觀察資料
   */
  clearObservationData(): void {
    this.actionHistory = [];
    this.currentSequence = null;
    console.log('Observation data cleared');
  }

  /**
   * 匯出學習資料
   */
  exportLearning(): {
    patterns: OperationPattern[];
    knowledgeBase: Array<[string, any]>;
    actionHistory: HumanAction[];
  } {
    return {
      patterns: this.getPatterns(),
      knowledgeBase: Array.from(this.knowledgeBase.entries()),
      actionHistory: this.actionHistory,
    };
  }

  /**
   * 匯入學習資料
   */
  importLearning(data: {
    patterns?: OperationPattern[];
    knowledgeBase?: Array<[string, any]>;
    actionHistory?: HumanAction[];
  }): void {
    if (data.patterns) {
      data.patterns.forEach(pattern => {
        this.patterns.set(pattern.id, pattern);
      });
    }

    if (data.knowledgeBase) {
      data.knowledgeBase.forEach(([key, value]) => {
        this.knowledgeBase.set(key, value);
      });
    }

    if (data.actionHistory) {
      this.actionHistory.push(...data.actionHistory);
    }

    console.log('Learning data imported');
  }
}
