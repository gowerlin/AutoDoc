/**
 * AutoDoc Agent - Entry Point
 */

import dotenv from 'dotenv';
import { server } from './server';
import logger from './utils/logger';
import { BrowserManager } from './browser/browser_manager';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

// Global browser manager instance
let browserManager: BrowserManager | null = null;

async function startServer() {
  try {
    // Initialize browser manager
    logger.info('Initializing browser manager...');
    browserManager = new BrowserManager({
      headless: process.env.CHROME_HEADLESS === 'true',
      viewport: {
        width: parseInt(process.env.CHROME_VIEWPORT_WIDTH || '1920'),
        height: parseInt(process.env.CHROME_VIEWPORT_HEIGHT || '1080'),
      },
      timeout: 30000,
    });

    // Start Express server
    server.listen(PORT, () => {
      logger.info(`🚀 AutoDoc Agent server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
      logger.info(`📚 API: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  try {
    // Close browser
    if (browserManager) {
      logger.info('Closing browser...');
      await browserManager.shutdown();
    }

    // Close server
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  shutdown('unhandledRejection');
});

// Start the server
startServer();

export { browserManager };
