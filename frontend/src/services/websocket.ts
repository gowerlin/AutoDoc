/**
 * WebSocket Client for Real-time Communication
 * Task 6.1: Frontend Architecture - WebSocket Layer
 */

export type MessageType =
  | 'screenshot_update'
  | 'exploration_progress'
  | 'ai_question'
  | 'human_question'
  | 'state_change'
  | 'log'
  | 'error';

export interface WebSocketMessage {
  type: MessageType;
  payload: any;
  timestamp: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Map<MessageType, Array<(payload: any) => void>> = new Map();
  private statusCallback: ((status: ConnectionStatus) => void) | null = null;

  constructor(url: string = 'ws://localhost:3001') {
    this.url = url;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('⚠️ Already connected');
      return;
    }

    console.log(`🔌 Connecting to ${this.url}...`);
    this.updateStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.updateStatus('error');
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.updateStatus('disconnected');
        this.stopHeartbeat();
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      this.updateStatus('error');
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopHeartbeat();
    this.updateStatus('disconnected');
  }

  /**
   * Send message to server
   */
  send(type: MessageType, payload: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket not connected');
      return;
    }

    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Subscribe to message type
   */
  on(type: MessageType, handler: (payload: any) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }

    this.messageHandlers.get(type)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.statusCallback = callback;
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);
      const handlers = this.messageHandlers.get(message.type);

      if (handlers) {
        handlers.forEach((handler) => handler(message.payload));
      }
    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Update connection status
   */
  private updateStatus(status: ConnectionStatus): void {
    if (this.statusCallback) {
      this.statusCallback(status);
    }
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    if (!this.ws) return 'disconnected';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'error';
    }
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();
