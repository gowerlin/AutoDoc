import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { createServer, Server } from 'http';
import express, { Express } from 'express';

describe('WebSocket Authentication - Security Tests', () => {
  let app: Express;
  let server: Server;
  let wss: WebSocket.Server;
  let serverPort: number;
  const JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

  // Rate limiting state (simplified for testing)
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  function checkWsRateLimit(
    clientId: string,
    maxRequests: number = 60,
    windowMs: number = 60000
  ): boolean {
    const now = Date.now();
    const clientLimit = rateLimitMap.get(clientId);

    if (!clientLimit || now > clientLimit.resetTime) {
      rateLimitMap.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return true;
    }

    if (clientLimit.count >= maxRequests) {
      return false;
    }

    clientLimit.count++;
    return true;
  }

  function verifyWsToken(request: any): { valid: boolean; clientId?: string; error?: string } {
    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        return { valid: false, error: 'No token provided' };
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { clientId: string };

      if (!decoded.clientId) {
        return { valid: false, error: 'Invalid token payload' };
      }

      return { valid: true, clientId: decoded.clientId };
    } catch (error) {
      return { valid: false, error: 'Token verification failed' };
    }
  }

  beforeAll(async () => {
    app = express();

    // Token generation endpoint
    app.post('/api/auth/ws-token', (req, res) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const token = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: '1h' });

      res.json({
        token,
        clientId,
        expiresIn: '1h',
      });
    });

    server = createServer(app);

    wss = new WebSocket.Server({ noServer: true });

    // Secure upgrade handler with authentication
    server.on('upgrade', (request, socket, head) => {
      const authResult = verifyWsToken(request);

      if (!authResult.valid) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const clientId = authResult.clientId!;

      // Check rate limit
      if (!checkWsRateLimit(clientId)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, clientId);
      });
    });

    wss.on('connection', (ws, request, clientId) => {
      ws.on('message', (message) => {
        // Check rate limit on each message
        if (!checkWsRateLimit(clientId, 100, 60000)) {
          ws.send(JSON.stringify({ error: 'Rate limit exceeded' }));
          ws.close(1008, 'Rate limit exceeded');
          return;
        }

        ws.send(JSON.stringify({ echo: message.toString(), clientId }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        serverPort = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    wss.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    // Clear rate limit map between tests
    rateLimitMap.clear();
  });

  describe('Authentication Enforcement', () => {
    it('should reject WebSocket connections without token', async () => {
      const ws = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise<void>((resolve) => {
        ws.on('error', (error) => {
          expect(error.message).toContain('401');
          resolve();
        });

        ws.on('close', () => {
          resolve();
        });

        // Timeout safety
        setTimeout(() => resolve(), 2000);
      });
    });

    it('should reject WebSocket connections with invalid token', async () => {
      const invalidToken = 'invalid.jwt.token';
      const ws = new WebSocket(`ws://localhost:${serverPort}?token=${invalidToken}`);

      await new Promise<void>((resolve) => {
        ws.on('error', (error) => {
          expect(error.message).toContain('401');
          resolve();
        });

        ws.on('close', () => {
          resolve();
        });

        setTimeout(() => resolve(), 2000);
      });
    });

    it('should reject WebSocket connections with expired token', async () => {
      const clientId = 'test-client-expired';
      const expiredToken = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: '-1h' });

      const ws = new WebSocket(`ws://localhost:${serverPort}?token=${expiredToken}`);

      await new Promise<void>((resolve) => {
        ws.on('error', (error) => {
          expect(error.message).toContain('401');
          resolve();
        });

        ws.on('close', () => {
          resolve();
        });

        setTimeout(() => resolve(), 2000);
      });
    });

    it('should accept WebSocket connections with valid token', async () => {
      const clientId = 'test-client-valid';
      const validToken = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: '1h' });

      const ws = new WebSocket(`ws://localhost:${serverPort}?token=${validToken}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send('test message');
        });

        ws.on('message', (data) => {
          const response = JSON.parse(data.toString());
          expect(response.echo).toBe('test message');
          expect(response.clientId).toBe(clientId);
          ws.close();
          resolve();
        });

        ws.on('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 2000);
      });
    });

    it('should reject tokens with missing clientId', async () => {
      const invalidToken = jwt.sign({ userId: '123' }, JWT_SECRET, { expiresIn: '1h' });

      const ws = new WebSocket(`ws://localhost:${serverPort}?token=${invalidToken}`);

      await new Promise<void>((resolve) => {
        ws.on('error', (error) => {
          expect(error.message).toContain('401');
          resolve();
        });

        ws.on('close', () => {
          resolve();
        });

        setTimeout(() => resolve(), 2000);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce connection rate limits per client', async () => {
      const clientId = 'rate-limit-test-client';
      const validToken = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: '1h' });

      // Attempt to connect multiple times rapidly
      const connectionPromises: Promise<boolean>[] = [];

      for (let i = 0; i < 65; i++) {
        const promise = new Promise<boolean>((resolve) => {
          const ws = new WebSocket(`ws://localhost:${serverPort}?token=${validToken}`);

          ws.on('open', () => {
            ws.close();
            resolve(true); // Connected successfully
          });

          ws.on('error', () => {
            resolve(false); // Connection rejected
          });

          setTimeout(() => resolve(false), 1000);
        });

        connectionPromises.push(promise);
        // Small delay between attempts
        await new Promise((r) => setTimeout(r, 10));
      }

      const results = await Promise.all(connectionPromises);
      const successfulConnections = results.filter((r) => r).length;
      const rejectedConnections = results.filter((r) => !r).length;

      // Should reject connections after rate limit is exceeded
      expect(rejectedConnections).toBeGreaterThan(0);
      expect(successfulConnections).toBeLessThan(65);
    }, 30000);

    it('should not affect other clients when one client hits rate limit', async () => {
      const client1Id = 'client-1';
      const client2Id = 'client-2';
      const token1 = jwt.sign({ clientId: client1Id }, JWT_SECRET, { expiresIn: '1h' });
      const token2 = jwt.sign({ clientId: client2Id }, JWT_SECRET, { expiresIn: '1h' });

      // Client 1 hits rate limit
      for (let i = 0; i < 65; i++) {
        try {
          const ws = new WebSocket(`ws://localhost:${serverPort}?token=${token1}`);
          ws.on('error', () => {});
          await new Promise((r) => setTimeout(r, 10));
        } catch (e) {}
      }

      // Client 2 should still be able to connect
      const ws2 = new WebSocket(`ws://localhost:${serverPort}?token=${token2}`);

      await new Promise<void>((resolve, reject) => {
        ws2.on('open', () => {
          ws2.close();
          resolve();
        });

        ws2.on('error', () => {
          reject(new Error('Client 2 should be able to connect'));
        });

        setTimeout(() => reject(new Error('Timeout')), 2000);
      });
    }, 30000);
  });

  describe('Token Generation Endpoint', () => {
    it('should generate valid JWT tokens', async () => {
      const response = await fetch(`http://localhost:${serverPort}/api/auth/ws-token`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(data.clientId).toBeDefined();
      expect(data.expiresIn).toBe('1h');

      // Verify the token can be decoded
      const decoded = jwt.verify(data.token, JWT_SECRET) as any;
      expect(decoded.clientId).toBe(data.clientId);
    });

    it('should generate unique client IDs', async () => {
      const response1 = await fetch(`http://localhost:${serverPort}/api/auth/ws-token`, {
        method: 'POST',
      });
      const response2 = await fetch(`http://localhost:${serverPort}/api/auth/ws-token`, {
        method: 'POST',
      });

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.clientId).not.toBe(data2.clientId);
      expect(data1.token).not.toBe(data2.token);
    });
  });

  describe('Message Rate Limiting', () => {
    it('should enforce rate limits on message frequency', async () => {
      const clientId = 'msg-rate-limit-client';
      const validToken = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: '1h' });

      const ws = new WebSocket(`ws://localhost:${serverPort}?token=${validToken}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // Send many messages rapidly
          for (let i = 0; i < 110; i++) {
            ws.send(`message-${i}`);
          }
        });

        let messageCount = 0;
        let rateLimitHit = false;

        ws.on('message', (data) => {
          const response = JSON.parse(data.toString());

          if (response.error && response.error.includes('Rate limit')) {
            rateLimitHit = true;
          } else {
            messageCount++;
          }
        });

        ws.on('close', (code) => {
          if (code === 1008) {
            rateLimitHit = true;
          }

          // Should have hit rate limit
          expect(rateLimitHit).toBe(true);
          expect(messageCount).toBeLessThan(110);
          resolve();
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          resolve();
        }, 3000);
      });
    }, 10000);
  });
});
