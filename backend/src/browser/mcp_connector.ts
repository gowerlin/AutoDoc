/**
 * Chrome DevTools MCP Connector
 * Task 1.1: MCP 協定的 WebSocket 連線建立與心跳保持
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { MCPConnectionError, TimeoutError } from '../error/error_types';
import { MCPConfig } from '../types';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class MCPConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: MCPConfig;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private messageId: number = 0;

  constructor(config: MCPConfig) {
    super();
    this.config = {
      maxRetries: 3,
      retryDelay: 2000,
      heartbeatInterval: 30000,
      ...config,
    };
  }

  /**
   * 建立 WebSocket 連線
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.on('open', () => {
          console.log(`MCP connected to ${this.config.url}`);
          this.connected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('MCP WebSocket error:', error);
          this.emit('error', error);
          if (!this.connected) {
            reject(new MCPConnectionError('Failed to connect to MCP server', { error }));
          }
        });

        this.ws.on('close', () => {
          console.log('MCP connection closed');
          this.connected = false;
          this.stopHeartbeat();
          this.emit('disconnected');
          this.handleReconnect();
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            reject(new TimeoutError('MCP connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(new MCPConnectionError('Failed to establish MCP connection', { error }));
      }
    });
  }

  /**
   * 斷線重連機制（最多 3 次重試，指數退避）
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxRetries) {
      console.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.retryDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxRetries})`);

    setTimeout(async () => {
      try {
        await this.connect();
        console.log('Reconnected successfully');
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, delay);
  }

  /**
   * 心跳保持
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.sendMessage({
          method: 'ping',
          params: {},
        }).catch((error) => {
          console.error('Heartbeat failed:', error);
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 處理收到的訊息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle response to pending request
      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const request = this.pendingRequests.get(message.id)!;
        clearTimeout(request.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          request.reject(new Error(message.error.message || 'MCP request failed'));
        } else {
          request.resolve(message.result);
        }
        return;
      }

      // Handle events
      if (message.method) {
        this.emit('event', message);
      }
    } catch (error) {
      console.error('Failed to parse MCP message:', error);
    }
  }

  /**
   * 發送訊息（支援並發請求）
   */
  async sendMessage(message: any, timeout: number = 30000): Promise<any> {
    if (!this.connected || !this.ws) {
      throw new MCPConnectionError('MCP not connected');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const requestMessage = {
        id,
        ...message,
      };

      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(`MCP request timeout after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      // Send message
      try {
        this.ws!.send(JSON.stringify(requestMessage));
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(id);
        reject(new MCPConnectionError('Failed to send MCP message', { error }));
      }
    });
  }

  /**
   * 關閉連線
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * 檢查連線狀態
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 取得待處理請求數量
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }
}
