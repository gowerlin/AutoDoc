/**
 * Collaboration State Machine
 * Task 3.1: 設計協作狀態機
 */

import { EventEmitter } from 'events';
import { CollaborationState } from '../types';
import { ValidationError } from '../error/error_types';

export interface StateTransition {
  from: CollaborationState;
  to: CollaborationState;
  timestamp: Date;
  reason?: string;
}

export interface StateMachineConfig {
  initialState?: CollaborationState;
  enablePersistence?: boolean;
  persistenceKey?: string;
}

export interface StateData {
  currentUrl?: string;
  screenshot?: string;
  context?: any;
  metadata?: Record<string, any>;
}

export class CollaborationStateMachine extends EventEmitter {
  private currentState: CollaborationState;
  private stateHistory: StateTransition[] = [];
  private stateData: Map<CollaborationState, StateData> = new Map();
  private config: StateMachineConfig;

  // Define valid state transitions
  private readonly validTransitions: Map<CollaborationState, CollaborationState[]> = new Map([
    ['idle', ['ai_exploring']],
    ['ai_exploring', ['ai_questioning', 'human_questioning', 'paused', 'completed', 'failed']],
    ['ai_questioning', ['human_demonstrating', 'ai_exploring', 'paused']],
    ['human_demonstrating', ['ai_exploring', 'paused']],
    ['human_questioning', ['ai_exploring', 'paused', 'completed']],
    ['paused', ['ai_exploring', 'completed', 'failed']],
    ['completed', ['idle']], // Allow restart
    ['failed', ['idle']], // Allow retry
  ]);

  constructor(config: StateMachineConfig = {}) {
    super();
    this.config = {
      initialState: 'idle',
      enablePersistence: false,
      persistenceKey: 'collaboration_state',
      ...config,
    };

    this.currentState = this.config.initialState!;

    // Load persisted state if enabled
    if (this.config.enablePersistence) {
      this.loadPersistedState();
    }
  }

  /**
   * 取得當前狀態
   */
  getCurrentState(): CollaborationState {
    return this.currentState;
  }

  /**
   * 轉換狀態
   */
  transition(toState: CollaborationState, reason?: string, data?: StateData): void {
    // Validate transition
    if (!this.isValidTransition(this.currentState, toState)) {
      throw new ValidationError(
        `Invalid state transition from ${this.currentState} to ${toState}`,
        {
          from: this.currentState,
          to: toState,
          validTransitions: this.validTransitions.get(this.currentState),
        }
      );
    }

    const fromState = this.currentState;

    // Record transition
    const transition: StateTransition = {
      from: fromState,
      to: toState,
      timestamp: new Date(),
      reason,
    };

    this.stateHistory.push(transition);

    // Update state
    this.currentState = toState;

    // Store state data if provided
    if (data) {
      this.stateData.set(toState, data);
    }

    // Persist state if enabled
    if (this.config.enablePersistence) {
      this.persistState();
    }

    // Emit state change event
    this.emit('state_change', {
      from: fromState,
      to: toState,
      reason,
      timestamp: transition.timestamp,
    });

    console.log(`State transition: ${fromState} -> ${toState}${reason ? ` (${reason})` : ''}`);
  }

  /**
   * 檢查狀態轉換是否有效
   */
  isValidTransition(from: CollaborationState, to: CollaborationState): boolean {
    const validTargets = this.validTransitions.get(from);
    return validTargets ? validTargets.includes(to) : false;
  }

  /**
   * 取得有效的下一個狀態
   */
  getValidNextStates(): CollaborationState[] {
    return this.validTransitions.get(this.currentState) || [];
  }

  /**
   * 檢查是否可以轉換到指定狀態
   */
  canTransitionTo(state: CollaborationState): boolean {
    return this.isValidTransition(this.currentState, state);
  }

  /**
   * 開始 AI 探索
   */
  startAIExploration(data?: StateData): void {
    if (this.currentState === 'idle' || this.currentState === 'paused') {
      this.transition('ai_exploring', 'Starting AI exploration', data);
    } else {
      throw new ValidationError(
        'Cannot start AI exploration from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * AI 提出問題
   */
  aiAsksQuestion(data: StateData): void {
    if (this.currentState === 'ai_exploring') {
      this.transition('ai_questioning', 'AI encountered uncertainty', data);
    } else {
      throw new ValidationError(
        'Cannot ask question from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 人類開始示範
   */
  humanStartsDemonstration(data?: StateData): void {
    if (this.currentState === 'ai_questioning') {
      this.transition('human_demonstrating', 'Human chose to demonstrate', data);
    } else {
      throw new ValidationError(
        'Cannot start demonstration from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * AI 學習完成，繼續探索
   */
  resumeAfterLearning(data?: StateData): void {
    if (this.currentState === 'human_demonstrating' || this.currentState === 'ai_questioning') {
      this.transition('ai_exploring', 'Learning complete, resuming exploration', data);
    } else {
      throw new ValidationError(
        'Cannot resume exploration from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 人類暫停並提問
   */
  humanPausesToQuestion(data?: StateData): void {
    if (this.currentState === 'ai_exploring') {
      this.transition('human_questioning', 'Human paused to ask question', data);
    } else {
      throw new ValidationError(
        'Cannot pause for questioning from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 暫停探索
   */
  pauseExploration(reason?: string, data?: StateData): void {
    if (['ai_exploring', 'ai_questioning', 'human_demonstrating', 'human_questioning'].includes(this.currentState)) {
      this.transition('paused', reason || 'Exploration paused', data);
    } else {
      throw new ValidationError(
        'Cannot pause from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 恢復探索
   */
  resumeExploration(data?: StateData): void {
    if (this.currentState === 'paused' || this.currentState === 'human_questioning') {
      this.transition('ai_exploring', 'Resuming exploration', data);
    } else {
      throw new ValidationError(
        'Cannot resume from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 完成探索
   */
  completeExploration(data?: StateData): void {
    if (['ai_exploring', 'human_questioning', 'paused'].includes(this.currentState)) {
      this.transition('completed', 'Exploration completed', data);
    } else {
      throw new ValidationError(
        'Cannot complete from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 探索失敗
   */
  failExploration(reason: string, data?: StateData): void {
    if (['ai_exploring', 'paused'].includes(this.currentState)) {
      this.transition('failed', reason, data);
    } else {
      throw new ValidationError(
        'Cannot fail from current state',
        { currentState: this.currentState }
      );
    }
  }

  /**
   * 重置狀態機
   */
  reset(): void {
    this.transition('idle', 'State machine reset');
    this.stateHistory = [];
    this.stateData.clear();
  }

  /**
   * 取得狀態歷史
   */
  getHistory(): StateTransition[] {
    return [...this.stateHistory];
  }

  /**
   * 取得狀態資料
   */
  getStateData(state?: CollaborationState): StateData | undefined {
    const targetState = state || this.currentState;
    return this.stateData.get(targetState);
  }

  /**
   * 設定狀態資料
   */
  setStateData(data: StateData, state?: CollaborationState): void {
    const targetState = state || this.currentState;
    this.stateData.set(targetState, data);
  }

  /**
   * 取得狀態統計
   */
  getStatistics(): {
    currentState: CollaborationState;
    totalTransitions: number;
    stateTimeCounts: Map<CollaborationState, number>;
    averageTimeInState: Map<CollaborationState, number>;
  } {
    const stateTimeCounts = new Map<CollaborationState, number>();
    const stateDurations = new Map<CollaborationState, number[]>();

    // Count transitions and calculate durations
    for (let i = 0; i < this.stateHistory.length; i++) {
      const transition = this.stateHistory[i];
      const fromState = transition.from;

      // Increment count
      stateTimeCounts.set(fromState, (stateTimeCounts.get(fromState) || 0) + 1);

      // Calculate duration if there's a next transition
      if (i < this.stateHistory.length - 1) {
        const nextTransition = this.stateHistory[i + 1];
        const duration = nextTransition.timestamp.getTime() - transition.timestamp.getTime();

        if (!stateDurations.has(fromState)) {
          stateDurations.set(fromState, []);
        }
        stateDurations.get(fromState)!.push(duration);
      }
    }

    // Calculate average durations
    const averageTimeInState = new Map<CollaborationState, number>();
    for (const [state, durations] of stateDurations.entries()) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      averageTimeInState.set(state, avg);
    }

    return {
      currentState: this.currentState,
      totalTransitions: this.stateHistory.length,
      stateTimeCounts,
      averageTimeInState,
    };
  }

  /**
   * 持久化狀態
   */
  private persistState(): void {
    if (!this.config.enablePersistence) return;

    const stateSnapshot = {
      currentState: this.currentState,
      stateHistory: this.stateHistory,
      stateData: Array.from(this.stateData.entries()),
      timestamp: new Date(),
    };

    // In a real implementation, this would save to a database or file
    // For now, we'll just store in memory with a key
    const key = this.config.persistenceKey!;
    (global as any)[key] = stateSnapshot;

    console.log(`State persisted: ${key}`);
  }

  /**
   * 載入持久化狀態
   */
  private loadPersistedState(): void {
    if (!this.config.enablePersistence) return;

    const key = this.config.persistenceKey!;
    const snapshot = (global as any)[key];

    if (snapshot) {
      this.currentState = snapshot.currentState;
      this.stateHistory = snapshot.stateHistory;
      this.stateData = new Map(snapshot.stateData);

      console.log(`State loaded from persistence: ${key}`);
      this.emit('state_loaded', snapshot);
    }
  }

  /**
   * 清除持久化狀態
   */
  clearPersistedState(): void {
    if (!this.config.enablePersistence) return;

    const key = this.config.persistenceKey!;
    delete (global as any)[key];

    console.log(`Persisted state cleared: ${key}`);
  }

  /**
   * 取得狀態機資訊（用於除錯）
   */
  getInfo(): {
    currentState: CollaborationState;
    validNextStates: CollaborationState[];
    historyLength: number;
    lastTransition?: StateTransition;
  } {
    return {
      currentState: this.currentState,
      validNextStates: this.getValidNextStates(),
      historyLength: this.stateHistory.length,
      lastTransition: this.stateHistory[this.stateHistory.length - 1],
    };
  }

  /**
   * 檢查狀態機是否處於活躍狀態
   */
  isActive(): boolean {
    return !['idle', 'completed', 'failed'].includes(this.currentState);
  }

  /**
   * 檢查是否可以接受人類輸入
   */
  canAcceptHumanInput(): boolean {
    return ['ai_questioning', 'human_demonstrating', 'human_questioning', 'paused'].includes(this.currentState);
  }

  /**
   * 檢查 AI 是否正在執行
   */
  isAIActive(): boolean {
    return ['ai_exploring', 'ai_questioning'].includes(this.currentState);
  }
}
