/**
 * Express API Server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import logger from './utils/logger';
import { AutoDocError } from './error/error_types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes placeholder
app.get('/api', (req: Request, res: Response) => {
  res.json({
    name: 'AutoDoc Agent API',
    version: '1.0.0',
    description: 'AI-powered User Manual Generator',
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  logger.info('WebSocket client connected', { ip: req.socket.remoteAddress });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.debug('WebSocket message received', { data });

      // Handle different message types
      // TODO: Implement message handlers
    } catch (error) {
      logger.error('WebSocket message parse error', { error });
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error });
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to AutoDoc Agent',
    timestamp: new Date().toISOString(),
  }));
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AutoDocError) {
    logger.error(err.message, {
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
      stack: err.stack,
    });

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  } else {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
});

export { app, server, wss };
export default server;
