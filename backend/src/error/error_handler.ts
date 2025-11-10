/**
 * Global Error Handler
 *
 * Provides centralized error handling, classification, logging, and recovery mechanisms.
 * Handles all types of errors across the AutoDoc Agent system.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  CRITICAL = 'critical',   // System cannot continue
  HIGH = 'high',           // Major functionality affected
  MEDIUM = 'medium',       // Minor functionality affected
  LOW = 'low',             // Minimal impact
  INFO = 'info'            // Informational only
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  NETWORK = 'network',               // Network connectivity issues
  AUTHENTICATION = 'authentication', // Auth/credential failures
  PARSING = 'parsing',               // Content parsing errors
  RENDERING = 'rendering',           // Screenshot/rendering errors
  FILE_SYSTEM = 'file_system',       // File I/O errors
  DATABASE = 'database',             // Data storage errors
  VALIDATION = 'validation',         // Input validation errors
  TIMEOUT = 'timeout',               // Operation timeout
  RESOURCE = 'resource',             // Resource exhaustion
  UNKNOWN = 'unknown'                // Unclassified errors
}

/**
 * Recovery action types
 */
export enum RecoveryAction {
  RETRY = 'retry',                   // Retry the operation
  FALLBACK = 'fallback',             // Use fallback method
  SKIP = 'skip',                     // Skip and continue
  ABORT = 'abort',                   // Abort operation
  MANUAL = 'manual'                  // Requires manual intervention
}

/**
 * Structured error interface
 */
export interface StructuredError {
  id: string;
  timestamp: Date;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  stack?: string;
  context?: {
    operation?: string;
    projectId?: string;
    url?: string;
    userId?: string;
    [key: string]: any;
  };
  originalError?: Error;
  recoveryAction?: RecoveryAction;
  retryCount?: number;
  resolved?: boolean;
  resolvedAt?: Date;
}

/**
 * Error handling configuration
 */
export interface ErrorHandlerConfig {
  logDirectory: string;
  maxLogFiles: number;
  enableConsoleOutput: boolean;
  enableFileLogging: boolean;
  enableRemoteLogging: boolean;
  remoteEndpoint?: string;
  criticalErrorCallback?: (error: StructuredError) => void;
  autoRecovery: boolean;
  maxRetryAttempts: number;
}

/**
 * Error statistics
 */
export interface ErrorStatistics {
  totalErrors: number;
  errorsByCategory: Map<ErrorCategory, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  resolvedErrors: number;
  unresolvedErrors: number;
  averageResolutionTime: number;
  criticalErrors: number;
  recentErrors: StructuredError[];
}

/**
 * Global Error Handler
 *
 * Centralized error handling system with logging, classification, and recovery.
 */
export class GlobalErrorHandler extends EventEmitter {
  private config: ErrorHandlerConfig;
  private errors: Map<string, StructuredError> = new Map();
  private errorLog: StructuredError[] = [];
  private maxErrorLogSize = 10000;
  private isInitialized = false;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    super();
    this.config = {
      logDirectory: config.logDirectory || './logs/errors',
      maxLogFiles: config.maxLogFiles || 30,
      enableConsoleOutput: config.enableConsoleOutput ?? true,
      enableFileLogging: config.enableFileLogging ?? true,
      enableRemoteLogging: config.enableRemoteLogging ?? false,
      remoteEndpoint: config.remoteEndpoint,
      criticalErrorCallback: config.criticalErrorCallback,
      autoRecovery: config.autoRecovery ?? true,
      maxRetryAttempts: config.maxRetryAttempts || 3,
    };
  }

  /**
   * Initialize the error handler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Create log directory
    if (this.config.enableFileLogging) {
      await fs.mkdir(this.config.logDirectory, { recursive: true });
    }

    // Set up global error listeners
    this.setupGlobalListeners();

    // Start log rotation
    this.startLogRotation();

    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Handle an error
   */
  async handleError(
    error: Error | StructuredError,
    context?: StructuredError['context']
  ): Promise<StructuredError> {
    // Convert to structured error if needed
    const structuredError = this.isStructuredError(error)
      ? error
      : this.createStructuredError(error, context);

    // Store error
    this.errors.set(structuredError.id, structuredError);
    this.errorLog.unshift(structuredError);

    // Trim error log if too large
    if (this.errorLog.length > this.maxErrorLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxErrorLogSize);
    }

    // Log error
    await this.logError(structuredError);

    // Emit event
    this.emit('error', structuredError);

    // Handle critical errors
    if (structuredError.severity === ErrorSeverity.CRITICAL) {
      this.emit('critical_error', structuredError);
      if (this.config.criticalErrorCallback) {
        this.config.criticalErrorCallback(structuredError);
      }
    }

    // Attempt auto-recovery
    if (this.config.autoRecovery && structuredError.recoveryAction) {
      await this.attemptRecovery(structuredError);
    }

    return structuredError;
  }

  /**
   * Create a structured error from a standard error
   */
  private createStructuredError(
    error: Error,
    context?: StructuredError['context']
  ): StructuredError {
    const category = this.classifyError(error);
    const severity = this.determineSeverity(error, category);
    const recoveryAction = this.determineRecoveryAction(category, severity);

    return {
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      category,
      severity,
      message: error.message,
      stack: error.stack,
      context,
      originalError: error,
      recoveryAction,
      retryCount: 0,
      resolved: false,
    };
  }

  /**
   * Classify error by analyzing error message and type
   */
  private classifyError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('timeout') ||
      name.includes('networkerror')
    ) {
      if (message.includes('timeout')) {
        return ErrorCategory.TIMEOUT;
      }
      return ErrorCategory.NETWORK;
    }

    // Authentication errors
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('credential') ||
      message.includes('login')
    ) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Parsing errors
    if (
      message.includes('parse') ||
      message.includes('json') ||
      message.includes('syntax') ||
      name.includes('syntaxerror')
    ) {
      return ErrorCategory.PARSING;
    }

    // File system errors
    if (
      message.includes('enoent') ||
      message.includes('eacces') ||
      message.includes('file') ||
      message.includes('directory')
    ) {
      return ErrorCategory.FILE_SYSTEM;
    }

    // Validation errors
    if (
      message.includes('invalid') ||
      message.includes('validation') ||
      message.includes('required')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Rendering errors
    if (
      message.includes('screenshot') ||
      message.includes('render') ||
      message.includes('browser') ||
      message.includes('cdp')
    ) {
      return ErrorCategory.RENDERING;
    }

    // Resource errors
    if (
      message.includes('memory') ||
      message.includes('resource') ||
      message.includes('limit')
    ) {
      return ErrorCategory.RESOURCE;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    // Critical categories
    if (category === ErrorCategory.RESOURCE) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity
    if (
      category === ErrorCategory.AUTHENTICATION ||
      category === ErrorCategory.DATABASE
    ) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity
    if (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.RENDERING ||
      category === ErrorCategory.TIMEOUT
    ) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity
    if (
      category === ErrorCategory.PARSING ||
      category === ErrorCategory.VALIDATION
    ) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Determine recovery action
   */
  private determineRecoveryAction(
    category: ErrorCategory,
    severity: ErrorSeverity
  ): RecoveryAction {
    // Critical errors require manual intervention
    if (severity === ErrorSeverity.CRITICAL) {
      return RecoveryAction.MANUAL;
    }

    // Network and timeout errors can be retried
    if (category === ErrorCategory.NETWORK || category === ErrorCategory.TIMEOUT) {
      return RecoveryAction.RETRY;
    }

    // Rendering errors can use fallback
    if (category === ErrorCategory.RENDERING) {
      return RecoveryAction.FALLBACK;
    }

    // Validation and parsing errors should be skipped
    if (category === ErrorCategory.VALIDATION || category === ErrorCategory.PARSING) {
      return RecoveryAction.SKIP;
    }

    // Authentication errors require manual intervention
    if (category === ErrorCategory.AUTHENTICATION) {
      return RecoveryAction.MANUAL;
    }

    return RecoveryAction.RETRY;
  }

  /**
   * Attempt to recover from error
   */
  private async attemptRecovery(error: StructuredError): Promise<boolean> {
    this.emit('recovery_attempt', error);

    switch (error.recoveryAction) {
      case RecoveryAction.RETRY:
        if ((error.retryCount || 0) < this.config.maxRetryAttempts) {
          error.retryCount = (error.retryCount || 0) + 1;
          this.emit('retry', error);
          return true;
        }
        break;

      case RecoveryAction.FALLBACK:
        this.emit('fallback', error);
        return true;

      case RecoveryAction.SKIP:
        error.resolved = true;
        error.resolvedAt = new Date();
        this.emit('skip', error);
        return true;

      case RecoveryAction.MANUAL:
        this.emit('manual_intervention_required', error);
        return false;

      case RecoveryAction.ABORT:
        this.emit('abort', error);
        return false;
    }

    return false;
  }

  /**
   * Log error to various outputs
   */
  private async logError(error: StructuredError): Promise<void> {
    // Console output
    if (this.config.enableConsoleOutput) {
      this.logToConsole(error);
    }

    // File logging
    if (this.config.enableFileLogging) {
      await this.logToFile(error);
    }

    // Remote logging
    if (this.config.enableRemoteLogging && this.config.remoteEndpoint) {
      await this.logToRemote(error);
    }
  }

  /**
   * Log to console
   */
  private logToConsole(error: StructuredError): void {
    const prefix = `[${error.severity.toUpperCase()}] [${error.category}]`;
    const message = `${prefix} ${error.message}`;

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(message, error.details || '');
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(message, error.details || '');
        break;
      default:
        console.log(message, error.details || '');
    }

    if (error.stack && error.severity !== ErrorSeverity.LOW) {
      console.error(error.stack);
    }
  }

  /**
   * Log to file
   */
  private async logToFile(error: StructuredError): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.config.logDirectory, `errors-${date}.json`);

      // Read existing logs
      let logs: StructuredError[] = [];
      try {
        const content = await fs.readFile(logFile, 'utf-8');
        logs = JSON.parse(content);
      } catch (err) {
        // File doesn't exist yet
      }

      // Add new error
      logs.push(error);

      // Write back
      await fs.writeFile(logFile, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to log error to file:', err);
    }
  }

  /**
   * Log to remote endpoint
   */
  private async logToRemote(error: StructuredError): Promise<void> {
    try {
      // In a real implementation, this would send to a remote logging service
      // For now, we just emit an event
      this.emit('remote_log', error);
    } catch (err) {
      console.error('Failed to log error to remote:', err);
    }
  }

  /**
   * Set up global error listeners
   */
  private setupGlobalListeners(): void {
    // Unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handleError(error, {
        operation: 'unhandled_promise_rejection',
        promise: promise.toString(),
      });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.handleError(error, {
        operation: 'uncaught_exception',
      });
    });
  }

  /**
   * Start log rotation to manage old log files
   */
  private startLogRotation(): void {
    // Run log rotation daily
    setInterval(async () => {
      await this.rotateLogFiles();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Rotate log files (delete old ones)
   */
  private async rotateLogFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDirectory);
      const logFiles = files
        .filter((f) => f.startsWith('errors-') && f.endsWith('.json'))
        .sort()
        .reverse();

      // Delete old log files
      if (logFiles.length > this.config.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.config.maxLogFiles);
        for (const file of filesToDelete) {
          await fs.unlink(path.join(this.config.logDirectory, file));
        }
      }
    } catch (err) {
      console.error('Failed to rotate log files:', err);
    }
  }

  /**
   * Get error statistics
   */
  getStatistics(): ErrorStatistics {
    const errorsByCategory = new Map<ErrorCategory, number>();
    const errorsBySeverity = new Map<ErrorSeverity, number>();
    let resolvedCount = 0;
    let totalResolutionTime = 0;
    let criticalCount = 0;

    for (const error of this.errorLog) {
      // Count by category
      const categoryCount = errorsByCategory.get(error.category) || 0;
      errorsByCategory.set(error.category, categoryCount + 1);

      // Count by severity
      const severityCount = errorsBySeverity.get(error.severity) || 0;
      errorsBySeverity.set(error.severity, severityCount + 1);

      // Count resolved
      if (error.resolved && error.resolvedAt) {
        resolvedCount++;
        totalResolutionTime +=
          error.resolvedAt.getTime() - error.timestamp.getTime();
      }

      // Count critical
      if (error.severity === ErrorSeverity.CRITICAL) {
        criticalCount++;
      }
    }

    return {
      totalErrors: this.errorLog.length,
      errorsByCategory,
      errorsBySeverity,
      resolvedErrors: resolvedCount,
      unresolvedErrors: this.errorLog.length - resolvedCount,
      averageResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      criticalErrors: criticalCount,
      recentErrors: this.errorLog.slice(0, 10),
    };
  }

  /**
   * Mark error as resolved
   */
  resolveError(errorId: string): void {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolved = true;
      error.resolvedAt = new Date();
      this.emit('error_resolved', error);
    }
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors.clear();
    this.errorLog = [];
    this.emit('errors_cleared');
  }

  /**
   * Get error by ID
   */
  getError(errorId: string): StructuredError | undefined {
    return this.errors.get(errorId);
  }

  /**
   * Get all errors
   */
  getAllErrors(): StructuredError[] {
    return Array.from(this.errors.values());
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): StructuredError[] {
    return this.errorLog.filter((e) => e.category === category);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): StructuredError[] {
    return this.errorLog.filter((e) => e.severity === severity);
  }

  /**
   * Check if error is structured
   */
  private isStructuredError(error: any): error is StructuredError {
    return error && typeof error === 'object' && 'id' in error && 'category' in error;
  }

  /**
   * Shutdown the error handler
   */
  async shutdown(): Promise<void> {
    this.emit('shutdown');
    this.removeAllListeners();
    this.isInitialized = false;
  }
}

/**
 * Export singleton instance
 */
let globalErrorHandlerInstance: GlobalErrorHandler | null = null;

export function getGlobalErrorHandler(
  config?: Partial<ErrorHandlerConfig>
): GlobalErrorHandler {
  if (!globalErrorHandlerInstance) {
    globalErrorHandlerInstance = new GlobalErrorHandler(config);
  }
  return globalErrorHandlerInstance;
}

export function resetGlobalErrorHandler(): void {
  if (globalErrorHandlerInstance) {
    globalErrorHandlerInstance.shutdown();
    globalErrorHandlerInstance = null;
  }
}
