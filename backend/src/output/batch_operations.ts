/**
 * Batch Operations Optimizer
 * Task 5.3: 開發批次操作優化
 */

import { docs_v1 } from 'googleapis';
import { GoogleDocsClient } from './google_docs_client';
import { EventEmitter } from 'events';

export interface BatchRequest {
  id: string;
  docId: string;
  request: docs_v1.Schema$Request;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface BatchResult {
  success: boolean;
  requestId: string;
  response?: any;
  error?: Error;
}

export interface QueueStats {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

export class BatchOperations extends EventEmitter {
  private client: GoogleDocsClient;
  private docsAPI: docs_v1.Docs;
  private queue: BatchRequest[] = [];
  private inProgress: Map<string, BatchRequest> = new Map();
  private completed: Map<string, BatchResult> = new Map();
  private failed: Map<string, { request: BatchRequest; error: Error }> = new Map();
  private maxConcurrency: number = 10;
  private batchSize: number = 50; // Max requests per batchUpdate
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(client: GoogleDocsClient, options?: {
    maxConcurrency?: number;
    batchSize?: number;
  }) {
    super();

    if (!client.isAuthenticated()) {
      throw new Error('GoogleDocsClient must be authenticated');
    }

    this.client = client;
    this.docsAPI = client.getDocsAPI();

    if (options?.maxConcurrency) {
      this.maxConcurrency = options.maxConcurrency;
    }

    if (options?.batchSize) {
      this.batchSize = Math.min(options.batchSize, 500); // API limit
    }
  }

  /**
   * 添加單個請求到隊列
   */
  addRequest(request: BatchRequest): void {
    // Set defaults
    request.retryCount = request.retryCount || 0;
    request.maxRetries = request.maxRetries || 3;
    request.priority = request.priority || 0;

    this.queue.push(request);

    console.log(`➕ Added request ${request.id} to queue (queue size: ${this.queue.length})`);

    this.emit('request_added', request);

    // Start processing if not already
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  /**
   * 批次添加多個請求
   */
  addRequests(requests: BatchRequest[]): void {
    requests.forEach((req) => this.addRequest(req));
  }

  /**
   * 批次執行請求
   */
  async batchRequests(
    docId: string,
    requests: docs_v1.Schema$Request[]
  ): Promise<BatchResult[]> {
    console.log(`📦 Creating batch of ${requests.length} requests for document ${docId}...`);

    const batchRequests: BatchRequest[] = requests.map((req, index) => ({
      id: `batch-${Date.now()}-${index}`,
      docId,
      request: req,
      priority: 0,
    }));

    // Add to queue
    this.addRequests(batchRequests);

    // Wait for completion
    return new Promise((resolve) => {
      const checkCompletion = () => {
        const allIds = batchRequests.map((r) => r.id);
        const completedIds = allIds.filter((id) =>
          this.completed.has(id) || this.failed.has(id)
        );

        if (completedIds.length === allIds.length) {
          // All done
          const results = allIds.map((id) => {
            if (this.completed.has(id)) {
              return this.completed.get(id)!;
            } else {
              const failedReq = this.failed.get(id)!;
              return {
                success: false,
                requestId: id,
                error: failedReq.error,
              };
            }
          });

          resolve(results);
        } else {
          // Check again in 100ms
          setTimeout(checkCompletion, 100);
        }
      };

      checkCompletion();
    });
  }

  /**
   * 開始處理隊列
   */
  private startProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    console.log('▶️ Started batch processing');

    this.emit('processing_started');

    // Process queue every 500ms
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 500);
  }

  /**
   * 停止處理隊列
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.isProcessing = false;
    console.log('⏹️ Stopped batch processing');

    this.emit('processing_stopped');
  }

  /**
   * 處理隊列
   */
  private async processQueue(): Promise<void> {
    // Check if we can process more
    if (this.inProgress.size >= this.maxConcurrency) {
      return;
    }

    if (this.queue.length === 0) {
      // Queue is empty
      if (this.inProgress.size === 0) {
        // Nothing in progress either, stop processing
        this.stopProcessing();
      }
      return;
    }

    // Sort queue by priority (highest first)
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Group requests by docId
    const groupedRequests = this.groupRequestsByDoc();

    // Process each document's requests
    for (const [docId, requests] of groupedRequests.entries()) {
      if (this.inProgress.size >= this.maxConcurrency) break;

      // Take up to batchSize requests
      const batch = requests.slice(0, this.batchSize);

      // Remove from queue and add to inProgress
      batch.forEach((req) => {
        const index = this.queue.findIndex((r) => r.id === req.id);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }
        this.inProgress.set(req.id, req);
      });

      // Execute batch
      this.executeBatch(docId, batch);
    }
  }

  /**
   * 分組請求（按 docId）
   */
  private groupRequestsByDoc(): Map<string, BatchRequest[]> {
    const grouped = new Map<string, BatchRequest[]>();

    this.queue.forEach((req) => {
      if (!grouped.has(req.docId)) {
        grouped.set(req.docId, []);
      }
      grouped.get(req.docId)!.push(req);
    });

    return grouped;
  }

  /**
   * 執行批次請求
   */
  private async executeBatch(docId: string, batch: BatchRequest[]): Promise<void> {
    try {
      console.log(`🚀 Executing batch of ${batch.length} requests for ${docId}...`);

      const requests = batch.map((b) => b.request);

      const startTime = Date.now();

      const response = await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests,
        },
      });

      const duration = Date.now() - startTime;

      console.log(`✅ Batch executed successfully (${duration}ms)`);

      // Mark all as completed
      batch.forEach((req, index) => {
        this.inProgress.delete(req.id);

        const result: BatchResult = {
          success: true,
          requestId: req.id,
          response: response.data.replies?.[index],
        };

        this.completed.set(req.id, result);
        this.emit('request_completed', result);
      });

      this.emit('batch_completed', {
        docId,
        requestCount: batch.length,
        duration,
      });
    } catch (error) {
      console.error('❌ Batch execution failed:', error);

      // Handle failure
      await this.handleBatchFailure(batch, error as Error);
    }
  }

  /**
   * 處理批次失敗
   */
  private async handleBatchFailure(batch: BatchRequest[], error: Error): Promise<void> {
    for (const req of batch) {
      this.inProgress.delete(req.id);

      req.retryCount = (req.retryCount || 0) + 1;

      if (req.retryCount < (req.maxRetries || 3)) {
        // Retry
        console.log(`🔄 Retrying request ${req.id} (attempt ${req.retryCount + 1}/${req.maxRetries})...`);

        // Add back to queue with lower priority
        req.priority = (req.priority || 0) - 1;
        this.queue.push(req);

        this.emit('request_retry', req);
      } else {
        // Max retries reached, mark as failed
        console.error(`❌ Request ${req.id} failed after ${req.retryCount} retries`);

        this.failed.set(req.id, { request: req, error });

        this.emit('request_failed', {
          requestId: req.id,
          error,
          retries: req.retryCount,
        });
      }
    }
  }

  /**
   * 取得隊列統計
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      inProgress: this.inProgress.size,
      completed: this.completed.size,
      failed: this.failed.size,
      totalProcessed: this.completed.size + this.failed.size,
    };
  }

  /**
   * 清空隊列
   */
  clearQueue(): void {
    console.log('🗑️ Clearing queue...');

    this.queue = [];
    this.completed.clear();
    this.failed.clear();

    console.log('✅ Queue cleared');
    this.emit('queue_cleared');
  }

  /**
   * 等待所有請求完成
   */
  async waitForCompletion(timeout: number = 60000): Promise<QueueStats> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkCompletion = () => {
        const stats = this.getStats();

        if (stats.pending === 0 && stats.inProgress === 0) {
          // All done
          resolve(stats);
        } else if (Date.now() - startTime > timeout) {
          // Timeout
          reject(new Error('Batch operation timeout'));
        } else {
          // Check again in 500ms
          setTimeout(checkCompletion, 500);
        }
      };

      checkCompletion();
    });
  }

  /**
   * 取得失敗的請求
   */
  getFailedRequests(): Array<{ request: BatchRequest; error: Error }> {
    return Array.from(this.failed.values());
  }

  /**
   * 重試所有失敗的請求
   */
  retryFailedRequests(): void {
    console.log(`🔄 Retrying ${this.failed.size} failed requests...`);

    const failedRequests = Array.from(this.failed.values());

    failedRequests.forEach(({ request }) => {
      this.failed.delete(request.id);

      // Reset retry count
      request.retryCount = 0;

      // Add back to queue
      this.addRequest(request);
    });

    console.log('✅ Failed requests re-queued');
  }

  /**
   * 設置並發數
   */
  setMaxConcurrency(maxConcurrency: number): void {
    this.maxConcurrency = Math.max(1, Math.min(maxConcurrency, 50));
    console.log(`✅ Max concurrency set to ${this.maxConcurrency}`);
  }

  /**
   * 設置批次大小
   */
  setBatchSize(batchSize: number): void {
    this.batchSize = Math.max(1, Math.min(batchSize, 500));
    console.log(`✅ Batch size set to ${this.batchSize}`);
  }

  /**
   * 取得配置
   */
  getConfig(): {
    maxConcurrency: number;
    batchSize: number;
    isProcessing: boolean;
  } {
    return {
      maxConcurrency: this.maxConcurrency,
      batchSize: this.batchSize,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * 優先處理特定請求
   */
  prioritizeRequest(requestId: string): boolean {
    const index = this.queue.findIndex((r) => r.id === requestId);

    if (index >= 0) {
      const request = this.queue[index];
      request.priority = (request.priority || 0) + 100;

      console.log(`⬆️ Prioritized request ${requestId}`);
      return true;
    }

    return false;
  }

  /**
   * 取消特定請求
   */
  cancelRequest(requestId: string): boolean {
    const index = this.queue.findIndex((r) => r.id === requestId);

    if (index >= 0) {
      this.queue.splice(index, 1);
      console.log(`❌ Cancelled request ${requestId}`);
      this.emit('request_cancelled', requestId);
      return true;
    }

    return false;
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up batch operations...');

    this.stopProcessing();
    this.clearQueue();

    console.log('✅ Cleanup complete');
  }
}
