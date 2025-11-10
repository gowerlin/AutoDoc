import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import cors from 'cors';
import request from 'supertest';

describe('CORS Configuration - Security Tests', () => {
  let app: Express;

  beforeEach(() => {
    app = express();

    // Replicate the CORS configuration from server.ts
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'tauri://localhost',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.includes(origin)) {
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

    app.get('/test', (req, res) => {
      res.json({ success: true });
    });
  });

  describe('Origin Validation', () => {
    it('should allow requests from localhost:5173 (Vite dev)', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should allow requests from localhost:3000 (Desktop proxy)', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should allow requests from tauri://localhost (Tauri protocol)', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'tauri://localhost');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('tauri://localhost');
    });

    it('should reject requests from unauthorized origins', async () => {
      const maliciousOrigins = [
        'http://evil.com',
        'https://attacker.com',
        'http://localhost:8080',
        'http://127.0.0.1:5173',
        'http://malicious-site.com',
        'https://phishing.example',
      ];

      for (const origin of maliciousOrigins) {
        const response = await request(app)
          .get('/test')
          .set('Origin', origin);

        // Should either fail or not set CORS headers
        if (response.status === 200) {
          expect(response.headers['access-control-allow-origin']).not.toBe(origin);
        }
      }
    });

    it('should allow requests with no origin header', async () => {
      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
    });
  });

  describe('Credentials Handling', () => {
    it('should allow credentials in CORS requests', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('HTTP Methods', () => {
    it('should allow only specific HTTP methods', async () => {
      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      const allowedMethods = response.headers['access-control-allow-methods'];
      const methodsList = allowedMethods.split(',').map((m: string) => m.trim());

      expect(methodsList).toContain('GET');
      expect(methodsList).toContain('POST');
      expect(methodsList).toContain('PUT');
      expect(methodsList).toContain('DELETE');
      expect(methodsList).toContain('PATCH');
      expect(methodsList).not.toContain('TRACE');
      expect(methodsList).not.toContain('CONNECT');
    });
  });

  describe('Headers Validation', () => {
    it('should allow only specific headers', async () => {
      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      expect(response.status).toBe(204);
    });

    it('should include maxAge for preflight caching', async () => {
      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-max-age']).toBe('86400');
    });
  });

  describe('Origin Spoofing Prevention', () => {
    it('should not be fooled by partial origin matches', async () => {
      const spoofedOrigins = [
        'http://localhost:5173.evil.com',
        'http://evil.com:5173',
        'http://fake-localhost:5173',
        'tauri://localhost.attacker.com',
      ];

      for (const origin of spoofedOrigins) {
        const response = await request(app)
          .get('/test')
          .set('Origin', origin);

        if (response.status === 200) {
          expect(response.headers['access-control-allow-origin']).not.toBe(origin);
        }
      }
    });

    it('should handle null origin securely', async () => {
      const response = await request(app)
        .get('/test')
        .set('Origin', 'null');

      // null origin should not be in allowed list
      if (response.status === 200) {
        expect(response.headers['access-control-allow-origin']).not.toBe('null');
      }
    });
  });
});
