/**
 * Exploration Visualization Module
 * Task 2.4: 開發探索視覺化模組
 */

import { NavigationNode } from '../types';
import { ExplorationStrategy } from './exploration_strategy';
import { WebSocketServer, WebSocket } from 'ws';

export interface TreeNode {
  id: string;
  url: string;
  title: string;
  status: 'explored' | 'in_progress' | 'pending' | 'error';
  depth: number;
  children: TreeNode[];
  parent?: string;
  timestamp?: Date;
  error?: string;
}

export interface ProgressStats {
  exploredPages: number;
  totalPages: number;
  pendingPages: number;
  currentDepth: number;
  maxDepth: number;
  exploredFeatures: number;
  errorsEncountered: number;
  estimatedTimeRemaining: string;
  elapsedTime: string;
  averagePageTime: number;
}

export interface ExplorationEvent {
  type: 'page_explored' | 'page_started' | 'page_error' | 'exploration_complete' | 'progress_update';
  data: any;
  timestamp: Date;
}

export class ExplorationVisualization {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private explorationTree: TreeNode | null = null;
  private startTime: Date = new Date();
  private pageTimings: number[] = [];
  private errorsCount: number = 0;

  constructor(wss?: WebSocketServer) {
    this.wss = wss || null;

    if (this.wss) {
      this.setupWebSocketHandlers();
    }
  }

  /**
   * 設置 WebSocket 處理器
   */
  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Visualization client connected');
      this.clients.add(ws);

      // Send current state to new client
      if (this.explorationTree) {
        this.sendToClient(ws, {
          type: 'tree_update',
          data: this.explorationTree,
          timestamp: new Date(),
        });
      }

      ws.on('close', () => {
        console.log('Visualization client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * 生成探索樹狀圖
   */
  generateExplorationTree(
    rootUrl: string,
    exploredUrls: string[],
    pendingUrls: string[],
    errorUrls: Map<string, string>
  ): TreeNode {
    // Create root node
    const root: TreeNode = {
      id: 'root',
      url: rootUrl,
      title: rootUrl,
      status: 'explored',
      depth: 0,
      children: [],
    };

    // Add explored URLs
    exploredUrls.forEach((url, index) => {
      root.children.push({
        id: `explored-${index}`,
        url,
        title: this.extractTitle(url),
        status: 'explored',
        depth: 1,
        children: [],
        parent: 'root',
      });
    });

    // Add pending URLs
    pendingUrls.forEach((url, index) => {
      root.children.push({
        id: `pending-${index}`,
        url,
        title: this.extractTitle(url),
        status: 'pending',
        depth: 1,
        children: [],
        parent: 'root',
      });
    });

    // Add error URLs
    errorUrls.forEach((error, url) => {
      root.children.push({
        id: `error-${url}`,
        url,
        title: this.extractTitle(url),
        status: 'error',
        depth: 1,
        children: [],
        parent: 'root',
        error,
      });
    });

    this.explorationTree = root;
    this.broadcastTreeUpdate(root);

    return root;
  }

  /**
   * 更新節點狀態
   */
  updateNodeStatus(
    nodeId: string,
    status: 'explored' | 'in_progress' | 'pending' | 'error',
    error?: string
  ): void {
    if (!this.explorationTree) return;

    const node = this.findNode(this.explorationTree, nodeId);
    if (node) {
      node.status = status;
      node.timestamp = new Date();
      if (error) node.error = error;

      this.broadcastTreeUpdate(this.explorationTree);
    }
  }

  /**
   * 添加子節點
   */
  addChildNode(parentId: string, childNode: TreeNode): void {
    if (!this.explorationTree) return;

    const parent = this.findNode(this.explorationTree, parentId);
    if (parent) {
      childNode.parent = parentId;
      childNode.depth = parent.depth + 1;
      parent.children.push(childNode);

      this.broadcastTreeUpdate(this.explorationTree);
    }
  }

  /**
   * 查找節點
   */
  private findNode(tree: TreeNode, nodeId: string): TreeNode | null {
    if (tree.id === nodeId) return tree;

    for (const child of tree.children) {
      const found = this.findNode(child, nodeId);
      if (found) return found;
    }

    return null;
  }

  /**
   * 生成進度統計
   */
  generateProgressStats(strategy: ExplorationStrategy): ProgressStats {
    const stats = strategy.getStats();
    const elapsedTime = Date.now() - this.startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    // Calculate average page time
    const avgPageTime = this.pageTimings.length > 0
      ? this.pageTimings.reduce((a, b) => a + b, 0) / this.pageTimings.length
      : 5000; // Default 5 seconds

    // Estimate remaining time
    const remainingPages = stats.pendingCount;
    const estimatedMs = remainingPages * avgPageTime;
    const estimatedTimeRemaining = this.formatDuration(estimatedMs);

    const progressStats: ProgressStats = {
      exploredPages: stats.exploredCount,
      totalPages: stats.totalCapacity,
      pendingPages: stats.pendingCount,
      currentDepth: 0, // Will be updated by exploration engine
      maxDepth: 3, // TODO: Get from config
      exploredFeatures: stats.exploredCount, // TODO: Calculate actual features
      errorsEncountered: this.errorsCount,
      estimatedTimeRemaining,
      elapsedTime: this.formatDuration(elapsedTime),
      averagePageTime: Math.round(avgPageTime / 1000), // in seconds
    };

    this.broadcastProgressUpdate(progressStats);

    return progressStats;
  }

  /**
   * 記錄頁面探索時間
   */
  recordPageTiming(durationMs: number): void {
    this.pageTimings.push(durationMs);

    // Keep only last 50 timings
    if (this.pageTimings.length > 50) {
      this.pageTimings.shift();
    }
  }

  /**
   * 記錄錯誤
   */
  recordError(): void {
    this.errorsCount++;
  }

  /**
   * 格式化持續時間
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 提取 URL 標題
   */
  private extractTitle(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const segments = path.split('/').filter(s => s);

      if (segments.length > 0) {
        return segments[segments.length - 1];
      }

      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }

  /**
   * 廣播樹狀圖更新
   */
  private broadcastTreeUpdate(tree: TreeNode): void {
    this.broadcast({
      type: 'tree_update',
      data: tree,
      timestamp: new Date(),
    });
  }

  /**
   * 廣播進度更新
   */
  private broadcastProgressUpdate(stats: ProgressStats): void {
    this.broadcast({
      type: 'progress_update',
      data: stats,
      timestamp: new Date(),
    });
  }

  /**
   * 廣播事件給所有客戶端
   */
  broadcast(event: ExplorationEvent): void {
    const message = JSON.stringify(event);

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Failed to send to client:', error);
        }
      }
    });
  }

  /**
   * 發送訊息給單一客戶端
   */
  private sendToClient(client: WebSocket, event: ExplorationEvent): void {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(event));
      } catch (error) {
        console.error('Failed to send to client:', error);
      }
    }
  }

  /**
   * 發送頁面探索開始事件
   */
  sendPageStarted(url: string, title: string): void {
    this.broadcast({
      type: 'page_started',
      data: { url, title },
      timestamp: new Date(),
    });
  }

  /**
   * 發送頁面探索完成事件
   */
  sendPageExplored(url: string, title: string, durationMs: number): void {
    this.recordPageTiming(durationMs);

    this.broadcast({
      type: 'page_explored',
      data: { url, title, duration: durationMs },
      timestamp: new Date(),
    });
  }

  /**
   * 發送頁面錯誤事件
   */
  sendPageError(url: string, error: string): void {
    this.recordError();

    this.broadcast({
      type: 'page_error',
      data: { url, error },
      timestamp: new Date(),
    });
  }

  /**
   * 發送探索完成事件
   */
  sendExplorationComplete(stats: ProgressStats): void {
    this.broadcast({
      type: 'exploration_complete',
      data: stats,
      timestamp: new Date(),
    });
  }

  /**
   * 生成視覺化報告（HTML）
   */
  generateHTMLReport(tree: TreeNode, stats: ProgressStats): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Exploration Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      border-left: 4px solid #4CAF50;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    .tree {
      margin-top: 30px;
    }
    .tree-node {
      margin-left: 20px;
      margin-bottom: 10px;
    }
    .node-explored { color: #4CAF50; }
    .node-pending { color: #FF9800; }
    .node-error { color: #F44336; }
    .node-in-progress { color: #2196F3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Exploration Report</h1>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Explored Pages</div>
        <div class="stat-value">${stats.exploredPages}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Pages</div>
        <div class="stat-value">${stats.pendingPages}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Errors</div>
        <div class="stat-value">${stats.errorsEncountered}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Elapsed Time</div>
        <div class="stat-value">${stats.elapsedTime}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Page Time</div>
        <div class="stat-value">${stats.averagePageTime}s</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Depth</div>
        <div class="stat-value">${stats.currentDepth}/${stats.maxDepth}</div>
      </div>
    </div>

    <div class="tree">
      <h2>Exploration Tree</h2>
      ${this.renderTreeHTML(tree)}
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * 渲染樹狀圖 HTML
   */
  private renderTreeHTML(node: TreeNode, indent: number = 0): string {
    const statusClass = `node-${node.status}`;
    const statusIcon = {
      explored: '✅',
      in_progress: '🔄',
      pending: '⏳',
      error: '❌',
    }[node.status];

    let html = `
      <div class="tree-node ${statusClass}" style="margin-left: ${indent * 20}px;">
        ${statusIcon} <strong>${node.title}</strong>
        <br><small>${node.url}</small>
        ${node.error ? `<br><span style="color: red;">Error: ${node.error}</span>` : ''}
      </div>
    `;

    node.children.forEach(child => {
      html += this.renderTreeHTML(child, indent + 1);
    });

    return html;
  }

  /**
   * 重置統計
   */
  reset(): void {
    this.explorationTree = null;
    this.startTime = new Date();
    this.pageTimings = [];
    this.errorsCount = 0;
  }

  /**
   * 取得客戶端數量
   */
  getClientCount(): number {
    return this.clients.size;
  }
}
