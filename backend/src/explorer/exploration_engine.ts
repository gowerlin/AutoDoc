/**
 * Main Exploration Engine
 * 整合所有 Task 2 模組
 */

import { EventEmitter } from 'events';
import { BrowserManager } from '../browser/browser_manager';
import { DOMAnalyzer } from './dom_analyzer';
import { ExplorationStrategy, ExplorationStrategyType, ExplorationConfig } from './exploration_strategy';
import { ExplorationExecutor } from './exploration_executor';
import { ExplorationVisualization, ProgressStats } from './visualization';
import { PageSnapshot } from '../types';
import { ExplorationError } from '../error/error_types';
import { WebSocketServer } from 'ws';

export interface ExplorationOptions {
  entryUrl: string;
  strategy?: ExplorationStrategyType;
  maxDepth?: number;
  maxPages?: number;
  screenshot?: boolean;
  formTesting?: boolean;
  testData?: any;
}

export interface ExplorationSession {
  id: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  options: ExplorationOptions;
  snapshots: PageSnapshot[];
  errors: Array<{ url: string; error: string }>;
}

export class ExplorationEngine extends EventEmitter {
  private browserManager: BrowserManager;
  private analyzer: DOMAnalyzer | null = null;
  private strategy: ExplorationStrategy | null = null;
  private executor: ExplorationExecutor | null = null;
  private visualization: ExplorationVisualization;
  private currentSession: ExplorationSession | null = null;
  private isPaused: boolean = false;
  private isStopped: boolean = false;

  constructor(browserManager: BrowserManager, wss?: WebSocketServer) {
    super();
    this.browserManager = browserManager;
    this.visualization = new ExplorationVisualization(wss);
  }

  /**
   * 開始探索
   */
  async startExploration(options: ExplorationOptions): Promise<ExplorationSession> {
    try {
      console.log('🚀 Starting exploration:', options.entryUrl);

      // Initialize session
      this.currentSession = {
        id: this.generateSessionId(),
        status: 'running',
        startTime: new Date(),
        options,
        snapshots: [],
        errors: [],
      };

      // Ensure browser is launched
      if (!this.browserManager.isReady()) {
        await this.browserManager.launchBrowser();
      }

      // Create new page
      const page = await this.browserManager.createPage();

      // Initialize components
      this.analyzer = new DOMAnalyzer(page.cdp);

      const strategyConfig: ExplorationConfig = {
        strategy: options.strategy || 'importance_first',
        maxDepth: options.maxDepth || 3,
        maxPages: options.maxPages || 50,
      };

      this.strategy = new ExplorationStrategy(strategyConfig);
      this.executor = new ExplorationExecutor(
        page.cdp,
        page.detector,
        this.analyzer,
        this.strategy
      );

      // Reset flags
      this.isPaused = false;
      this.isStopped = false;

      // Start exploration loop
      await this.explorationLoop(options.entryUrl);

      // Mark session as completed
      if (this.currentSession) {
        this.currentSession.status = 'completed';
        this.currentSession.endTime = new Date();
      }

      console.log('✅ Exploration completed');
      this.emit('exploration_complete', this.currentSession);

      // Generate final stats
      if (this.strategy) {
        const stats = this.visualization.generateProgressStats(this.strategy);
        this.visualization.sendExplorationComplete(stats);
      }

      return this.currentSession;
    } catch (error) {
      console.error('❌ Exploration failed:', error);

      if (this.currentSession) {
        this.currentSession.status = 'failed';
        this.currentSession.endTime = new Date();
      }

      throw new ExplorationError('Exploration failed', { error });
    }
  }

  /**
   * 主探索循環
   */
  private async explorationLoop(entryUrl: string): Promise<void> {
    // Navigate to entry URL
    await this.browserManager.navigate(entryUrl, { waitUntil: 'networkidle' });

    // Mark as explored
    this.strategy!.markAsExplored(entryUrl);

    // Initial analysis
    const initialAnalysis = await this.analyzer!.analyze(entryUrl);

    // Build initial queue
    const initialQueue = this.strategy!.buildExplorationQueue(
      initialAnalysis.interactiveElements,
      entryUrl,
      0
    );

    this.strategy!.addToQueue(initialQueue);

    console.log(`📊 Initial queue size: ${initialQueue.length}`);

    // Exploration loop
    let iteration = 0;
    while (!this.strategy!.isComplete() && !this.isStopped) {
      // Check if paused
      while (this.isPaused && !this.isStopped) {
        await this.sleep(1000);
      }

      if (this.isStopped) break;

      iteration++;
      console.log(`\n🔍 Iteration ${iteration}`);

      // Get next item to explore
      const item = this.strategy!.getNext();
      if (!item) {
        console.log('No more items in queue');
        break;
      }

      console.log(`📄 Exploring: ${item.url} (depth: ${item.depth}, priority: ${item.priority})`);

      const pageStartTime = Date.now();

      // Send page started event
      this.visualization.sendPageStarted(item.url, item.element?.text || '');

      try {
        // Explore the element/page
        let result;
        if (item.element) {
          result = await this.executor!.exploreElement(item.element, item.parent || entryUrl);
        } else {
          // Direct navigation
          await this.browserManager.navigate(item.url, { waitUntil: 'networkidle' });
          const analysis = await this.analyzer!.analyze(item.url);

          const screenshot = await this.browserManager.screenshot({
            format: 'jpeg',
            quality: 85,
          });

          result = {
            success: true,
            url: item.url,
            title: analysis.pageTitle,
            screenshot,
            snapshot: {
              url: item.url,
              title: analysis.pageTitle,
              domHash: '',
              screenshot: {
                url: '',
                hash: '',
                capturedAt: new Date(),
              },
              interactiveElements: analysis.interactiveElements,
              formFields: analysis.forms,
              apiCalls: [],
            },
          };
        }

        const pageEndTime = Date.now();
        const duration = pageEndTime - pageStartTime;

        if (result.success) {
          // Record success
          this.currentSession!.snapshots.push(result.snapshot);

          // Send page explored event
          this.visualization.sendPageExplored(result.url, result.title, duration);

          // Check for duplicates
          const isDuplicate = await this.strategy!.detectDuplicates(
            result.url,
            JSON.stringify(result.snapshot.interactiveElements)
          );

          if (!isDuplicate) {
            // Add new items to queue
            const newQueue = this.strategy!.buildExplorationQueue(
              result.snapshot.interactiveElements,
              result.url,
              item.depth
            );

            this.strategy!.addToQueue(newQueue);

            console.log(`✅ Added ${newQueue.length} new items to queue`);
          } else {
            console.log('⚠️ Duplicate page detected, skipping');
          }

          // Generate and broadcast progress stats
          const stats = this.visualization.generateProgressStats(this.strategy!);
          this.emit('progress_update', stats);

          console.log(`📊 Progress: ${stats.exploredPages}/${stats.totalPages} pages`);
        } else {
          // Record error
          this.currentSession!.errors.push({
            url: item.url,
            error: result.error || 'Unknown error',
          });

          // Send page error event
          this.visualization.sendPageError(item.url, result.error || 'Unknown error');

          console.error(`❌ Failed to explore ${item.url}: ${result.error}`);
        }

        // Save checkpoint every 10 iterations
        if (iteration % 10 === 0) {
          await this.saveCheckpoint();
        }

        // Small delay between pages
        await this.sleep(1000);
      } catch (error) {
        console.error(`❌ Error exploring ${item.url}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.currentSession!.errors.push({
          url: item.url,
          error: errorMessage,
        });

        this.visualization.sendPageError(item.url, errorMessage);
      }
    }

    console.log('\n✅ Exploration loop completed');
  }

  /**
   * 暫停探索
   */
  pause(): void {
    console.log('⏸️ Pausing exploration');
    this.isPaused = true;
    this.emit('exploration_paused');
  }

  /**
   * 恢復探索
   */
  resume(): void {
    console.log('▶️ Resuming exploration');
    this.isPaused = false;
    this.emit('exploration_resumed');
  }

  /**
   * 停止探索
   */
  stop(): void {
    console.log('⏹️ Stopping exploration');
    this.isStopped = true;
    this.isPaused = false;
    this.emit('exploration_stopped');
  }

  /**
   * 取得當前會話
   */
  getCurrentSession(): ExplorationSession | null {
    return this.currentSession;
  }

  /**
   * 取得進度統計
   */
  getProgressStats(): ProgressStats | null {
    if (!this.strategy) return null;
    return this.visualization.generateProgressStats(this.strategy);
  }

  /**
   * 保存 checkpoint
   */
  private async saveCheckpoint(): Promise<void> {
    if (!this.currentSession || !this.strategy) return;

    const checkpoint = {
      sessionId: this.currentSession.id,
      exploredUrls: this.strategy.getExploredUrls(),
      pendingUrls: this.strategy.getPendingUrls(),
      snapshots: this.currentSession.snapshots,
      errors: this.currentSession.errors,
    };

    await this.executor?.saveCheckpoint(this.currentSession.id, checkpoint);
    console.log('💾 Checkpoint saved');
  }

  /**
   * 生成會話 ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 輔助函數：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up exploration engine');
    this.stop();
    this.visualization.reset();
  }
}
