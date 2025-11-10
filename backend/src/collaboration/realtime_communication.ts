/**
 * Real-time Communication Layer
 * Task 3.5: 建立實時通訊層
 */

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';

export type EventType =
  | 'ai_question'
  | 'human_answer'
  | 'exploration_progress'
  | 'state_change'
  | 'human_action'
  | 'ai_learning'
  | 'pause_request'
  | 'resume_request'
  | 'adjustment'
  | 'error'
  | 'connection'
  | 'heartbeat';

export interface Message {
  id: string;
  type: EventType;
  payload: any;
  timestamp: Date;
  clientId?: string;
}

export interface ClientInfo {
  id: string;
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  metadata?: any;
}

export class RealtimeCommunication extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Map<string, ClientInfo> = new Map();
  private messageHistory: Message[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private maxHistorySize: number = 100;
  private heartbeatIntervalMs: number = 30000; // 30 seconds

  constructor(server: HTTPServer, path: string = '/ws') {
    super();

    this.wss = new WebSocketServer({
      server,
      path,
    });

    this.setupWebSocketServer();
    this.startHeartbeat();

    console.log(`🔌 WebSocket server initialized on path: ${path}`);
  }

  /**
   * 設置 WebSocket 伺服器
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      const clientInfo: ClientInfo = {
        id: clientId,
        ws,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      };

      this.clients.set(clientId, clientInfo);

      console.log(`✅ Client connected: ${clientId} (total: ${this.clients.size})`);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connection',
        payload: {
          clientId,
          message: 'Connected to AutoDoc Agent',
          serverTime: new Date(),
        },
      });

      // Send recent history to new client
      this.sendHistoryToClient(clientId);

      // Setup message handler
      ws.on('message', (data: Buffer) => {
        this.handleClientMessage(clientId, data);
      });

      // Setup close handler
      ws.on('close', () => {
        this.handleClientDisconnect(clientId);
      });

      // Setup error handler
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
        this.handleClientDisconnect(clientId);
      });

      // Setup pong handler (heartbeat response)
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastHeartbeat = new Date();
        }
      });

      this.emit('client_connected', clientInfo);
    });

    this.wss.on('error', (error) => {
      console.error('❌ WebSocket server error:', error);
      this.emit('server_error', error);
    });
  }

  /**
   * 處理客戶端訊息
   */
  private handleClientMessage(clientId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as Partial<Message>;

      // Validate message
      if (!message.type || !message.payload) {
        console.warn(`Invalid message from client ${clientId}`);
        return;
      }

      // Create full message
      const fullMessage: Message = {
        id: message.id || this.generateMessageId(),
        type: message.type as EventType,
        payload: message.payload,
        timestamp: new Date(),
        clientId,
      };

      console.log(`📨 Received ${fullMessage.type} from ${clientId}`);

      // Store in history
      this.addToHistory(fullMessage);

      // Emit event for handlers
      this.emit('message', fullMessage);
      this.emit(fullMessage.type, fullMessage);

    } catch (error) {
      console.error(`Failed to parse message from ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        payload: {
          error: 'Invalid message format',
        },
      });
    }
  }

  /**
   * 處理客戶端斷線
   */
  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);

    if (client) {
      this.clients.delete(clientId);
      console.log(`👋 Client disconnected: ${clientId} (remaining: ${this.clients.size})`);
      this.emit('client_disconnected', client);
    }
  }

  /**
   * 發送訊息給特定客戶端
   */
  sendToClient(clientId: string, message: Partial<Message>): boolean {
    const client = this.clients.get(clientId);

    if (!client) {
      console.warn(`Client ${clientId} not found`);
      return false;
    }

    if (client.ws.readyState !== WebSocket.OPEN) {
      console.warn(`Client ${clientId} connection not open`);
      return false;
    }

    try {
      const fullMessage: Message = {
        id: message.id || this.generateMessageId(),
        type: message.type as EventType,
        payload: message.payload,
        timestamp: message.timestamp || new Date(),
      };

      client.ws.send(JSON.stringify(fullMessage));
      return true;
    } catch (error) {
      console.error(`Failed to send message to ${clientId}:`, error);
      return false;
    }
  }

  /**
   * 廣播訊息給所有客戶端
   */
  broadcast(message: Partial<Message>, excludeClientId?: string): number {
    const fullMessage: Message = {
      id: message.id || this.generateMessageId(),
      type: message.type as EventType,
      payload: message.payload,
      timestamp: message.timestamp || new Date(),
    };

    // Add to history
    this.addToHistory(fullMessage);

    let successCount = 0;

    this.clients.forEach((client, clientId) => {
      if (excludeClientId && clientId === excludeClientId) {
        return;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(fullMessage));
          successCount++;
        } catch (error) {
          console.error(`Failed to broadcast to ${clientId}:`, error);
        }
      }
    });

    console.log(`📡 Broadcast ${fullMessage.type} to ${successCount} clients`);

    return successCount;
  }

  /**
   * 發送歷史訊息給客戶端
   */
  private sendHistoryToClient(clientId: string): void {
    if (this.messageHistory.length === 0) return;

    this.sendToClient(clientId, {
      type: 'connection',
      payload: {
        history: this.messageHistory.slice(-10), // Last 10 messages
        message: 'Message history',
      },
    });
  }

  /**
   * 添加訊息到歷史
   */
  private addToHistory(message: Message): void {
    this.messageHistory.push(message);

    // Limit history size
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  /**
   * 啟動心跳檢測
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = this.heartbeatIntervalMs * 2; // 2x interval = timeout

      this.clients.forEach((client, clientId) => {
        // Check if client is still alive
        const timeSinceLastHeartbeat = now - client.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > timeout) {
          console.warn(`Client ${clientId} heartbeat timeout, disconnecting`);
          client.ws.terminate();
          this.handleClientDisconnect(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          // Send ping
          try {
            client.ws.ping();
          } catch (error) {
            console.error(`Failed to ping client ${clientId}:`, error);
          }
        }
      });
    }, this.heartbeatIntervalMs);
  }

  /**
   * 停止心跳檢測
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 訂閱特定事件類型
   */
  subscribeToEvent(eventType: EventType, callback: (message: Message) => void): void {
    this.on(eventType, callback);
  }

  /**
   * 取消訂閱事件
   */
  unsubscribeFromEvent(eventType: EventType, callback: (message: Message) => void): void {
    this.off(eventType, callback);
  }

  /**
   * 發布事件（內部使用）
   */
  publishEvent(type: EventType, payload: any): void {
    this.broadcast({
      type,
      payload,
    });
  }

  /**
   * 取得連接的客戶端列表
   */
  getConnectedClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  /**
   * 取得客戶端數量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 檢查客戶端是否連接
   */
  isClientConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  /**
   * 取得訊息歷史
   */
  getMessageHistory(limit?: number): Message[] {
    if (limit) {
      return this.messageHistory.slice(-limit);
    }
    return [...this.messageHistory];
  }

  /**
   * 清除訊息歷史
   */
  clearHistory(): void {
    this.messageHistory = [];
    console.log('Message history cleared');
  }

  /**
   * 取得統計資訊
   */
  getStatistics(): {
    connectedClients: number;
    totalMessages: number;
    messagesByType: Map<EventType, number>;
    averageClientsPerMinute: number;
  } {
    const messagesByType = new Map<EventType, number>();

    this.messageHistory.forEach(message => {
      messagesByType.set(message.type, (messagesByType.get(message.type) || 0) + 1);
    });

    return {
      connectedClients: this.clients.size,
      totalMessages: this.messageHistory.length,
      messagesByType,
      averageClientsPerMinute: 0, // TODO: Implement tracking
    };
  }

  /**
   * 關閉所有連接
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down WebSocket server...');

    // Stop heartbeat
    this.stopHeartbeat();

    // Close all client connections
    const closePromises: Promise<void>[] = [];

    this.clients.forEach((client, clientId) => {
      const promise = new Promise<void>((resolve) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Send shutdown message
          try {
            client.ws.send(JSON.stringify({
              type: 'connection',
              payload: { message: 'Server shutting down' },
              timestamp: new Date(),
            }));
          } catch (error) {
            console.error(`Failed to send shutdown message to ${clientId}`);
          }

          // Close connection
          client.ws.close();

          // Wait for close event or timeout
          const timeout = setTimeout(() => {
            client.ws.terminate();
            resolve();
          }, 5000);

          client.ws.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          resolve();
        }
      });

      closePromises.push(promise);
    });

    await Promise.all(closePromises);

    // Close WebSocket server
    return new Promise((resolve, reject) => {
      this.wss.close((error) => {
        if (error) {
          console.error('Error closing WebSocket server:', error);
          reject(error);
        } else {
          console.log('WebSocket server closed');
          resolve();
        }
      });
    });
  }

  /**
   * 生成客戶端 ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成訊息 ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 設置最大歷史大小
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
  }

  /**
   * 設置心跳間隔
   */
  setHeartbeatInterval(ms: number): void {
    this.heartbeatIntervalMs = ms;

    // Restart heartbeat with new interval
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  /**
   * 序列化訊息
   */
  static serializeMessage(message: Message): string {
    return JSON.stringify(message);
  }

  /**
   * 反序列化訊息
   */
  static deserializeMessage(data: string): Message {
    return JSON.parse(data);
  }
}
