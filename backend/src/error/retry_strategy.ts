/**
 * Retry Strategies
 *
 * Provides various retry strategies for handling transient failures.
 * Supports exponential backoff, linear backoff, fixed delay, and custom strategies.
 */

import { EventEmitter } from 'events';
import { ErrorCategory, ErrorSeverity } from './error_handler';

/**
 * Retry strategy types
 */
export enum RetryStrategyType {
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  LINEAR_BACKOFF = 'linear_backoff',
  FIXED_DELAY = 'fixed_delay',
  IMMEDIATE = 'immediate',
  CUSTOM = 'custom'
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  strategyType: RetryStrategyType;
  initialDelay: number;          // milliseconds
  maxDelay: number;              // milliseconds
  backoffMultiplier: number;     // for exponential/linear backoff
  jitter: boolean;               // add randomness to delay
  jitterFactor: number;          // 0-1, percentage of jitter
  retryableErrors: ErrorCategory[];
  retryableStatusCodes: number[];
  timeout?: number;              // overall timeout for all retries
  onRetry?: (attempt: number, delay: number, error: any) => void;
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attemptNumber: number;
  timestamp: Date;
  delay: number;
  error?: any;
  success: boolean;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: RetryAttempt[];
  totalDuration: number;
  finalAttempt: number;
}

/**
 * Retry context for tracking state
 */
export interface RetryContext {
  operationId: string;
  operation: string;
  startTime: Date;
  attempts: RetryAttempt[];
  config: RetryConfig;
  timeout?: NodeJS.Timeout;
}

/**
 * Default retry configurations for different scenarios
 */
export const DEFAULT_RETRY_CONFIGS: { [key: string]: Partial<RetryConfig> } = {
  network: {
    maxAttempts: 3,
    strategyType: RetryStrategyType.EXPONENTIAL_BACKOFF,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    jitterFactor: 0.3,
    retryableErrors: [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT],
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  authentication: {
    maxAttempts: 2,
    strategyType: RetryStrategyType.FIXED_DELAY,
    initialDelay: 2000,
    maxDelay: 5000,
    jitter: false,
    retryableErrors: [ErrorCategory.AUTHENTICATION],
    retryableStatusCodes: [401, 403],
  },
  rendering: {
    maxAttempts: 4,
    strategyType: RetryStrategyType.LINEAR_BACKOFF,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    jitter: true,
    jitterFactor: 0.2,
    retryableErrors: [ErrorCategory.RENDERING, ErrorCategory.TIMEOUT],
    retryableStatusCodes: [500, 503],
  },
  fileSystem: {
    maxAttempts: 3,
    strategyType: RetryStrategyType.EXPONENTIAL_BACKOFF,
    initialDelay: 500,
    maxDelay: 3000,
    backoffMultiplier: 2,
    jitter: false,
    retryableErrors: [ErrorCategory.FILE_SYSTEM],
    retryableStatusCodes: [],
  },
};

/**
 * Retry Manager
 *
 * Manages retry operations with various strategies and configurations.
 */
export class RetryManager extends EventEmitter {
  private contexts: Map<string, RetryContext> = new Map();
  private defaultConfig: RetryConfig;

  constructor(defaultConfig?: Partial<RetryConfig>) {
    super();
    this.defaultConfig = {
      maxAttempts: 3,
      strategyType: RetryStrategyType.EXPONENTIAL_BACKOFF,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      jitterFactor: 0.3,
      retryableErrors: [
        ErrorCategory.NETWORK,
        ErrorCategory.TIMEOUT,
        ErrorCategory.RENDERING,
      ],
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      ...defaultConfig,
    };
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>,
    operationName?: string
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const context = this.createContext(operationName || 'unknown', finalConfig);

    const startTime = Date.now();
    let lastError: any;

    try {
      for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
        const attemptStartTime = Date.now();

        try {
          // Execute operation
          const result = await this.executeAttempt(operation, context, attempt);

          // Success
          const attemptInfo: RetryAttempt = {
            attemptNumber: attempt,
            timestamp: new Date(),
            delay: 0,
            success: true,
          };
          context.attempts.push(attemptInfo);

          this.emit('retry_success', {
            operationId: context.operationId,
            attempt,
            duration: Date.now() - attemptStartTime,
          });

          return {
            success: true,
            result,
            attempts: context.attempts,
            totalDuration: Date.now() - startTime,
            finalAttempt: attempt,
          };
        } catch (error) {
          lastError = error;

          // Check if error is retryable
          if (!this.isRetryable(error, finalConfig)) {
            const attemptInfo: RetryAttempt = {
              attemptNumber: attempt,
              timestamp: new Date(),
              delay: 0,
              error,
              success: false,
            };
            context.attempts.push(attemptInfo);

            this.emit('non_retryable_error', {
              operationId: context.operationId,
              attempt,
              error,
            });

            throw error; // Non-retryable error
          }

          // Last attempt failed
          if (attempt === finalConfig.maxAttempts) {
            const attemptInfo: RetryAttempt = {
              attemptNumber: attempt,
              timestamp: new Date(),
              delay: 0,
              error,
              success: false,
            };
            context.attempts.push(attemptInfo);

            this.emit('retry_exhausted', {
              operationId: context.operationId,
              attempts: attempt,
              error,
            });

            break; // Exit retry loop
          }

          // Calculate delay for next attempt
          const delay = this.calculateDelay(attempt, finalConfig);

          const attemptInfo: RetryAttempt = {
            attemptNumber: attempt,
            timestamp: new Date(),
            delay,
            error,
            success: false,
          };
          context.attempts.push(attemptInfo);

          this.emit('retry_attempt', {
            operationId: context.operationId,
            attempt,
            delay,
            error,
          });

          // Call retry callback if provided
          if (finalConfig.onRetry) {
            finalConfig.onRetry(attempt, delay, error);
          }

          // Wait before next attempt
          await this.delay(delay);
        }
      }

      // All attempts failed
      return {
        success: false,
        error: lastError,
        attempts: context.attempts,
        totalDuration: Date.now() - startTime,
        finalAttempt: finalConfig.maxAttempts,
      };
    } finally {
      this.contexts.delete(context.operationId);
      if (context.timeout) {
        clearTimeout(context.timeout);
      }
    }
  }

  /**
   * Execute a single attempt with timeout
   */
  private async executeAttempt<T>(
    operation: () => Promise<T>,
    context: RetryContext,
    attempt: number
  ): Promise<T> {
    if (context.config.timeout) {
      return this.withTimeout(operation, context.config.timeout);
    }
    return operation();
  }

  /**
   * Execute operation with timeout
   */
  private withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: any, config: RetryConfig): boolean {
    // Check error category
    if (error.category && config.retryableErrors.includes(error.category)) {
      return true;
    }

    // Check status code
    if (error.statusCode && config.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    // Check HTTP response status
    if (error.response?.status && config.retryableStatusCodes.includes(error.response.status)) {
      return true;
    }

    // Check error message for common retryable patterns
    const message = error.message?.toLowerCase() || '';
    const retryablePatterns = [
      'timeout',
      'econnrefused',
      'enotfound',
      'network',
      'etimedout',
      'socket hang up',
      'rate limit',
    ];

    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Calculate delay based on strategy
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = 0;

    switch (config.strategyType) {
      case RetryStrategyType.EXPONENTIAL_BACKOFF:
        delay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        break;

      case RetryStrategyType.LINEAR_BACKOFF:
        delay = Math.min(
          config.initialDelay + (attempt - 1) * config.initialDelay * config.backoffMultiplier,
          config.maxDelay
        );
        break;

      case RetryStrategyType.FIXED_DELAY:
        delay = config.initialDelay;
        break;

      case RetryStrategyType.IMMEDIATE:
        delay = 0;
        break;

      default:
        delay = config.initialDelay;
    }

    // Add jitter if enabled
    if (config.jitter) {
      delay = this.addJitter(delay, config.jitterFactor);
    }

    return Math.floor(delay);
  }

  /**
   * Add jitter to delay
   */
  private addJitter(delay: number, jitterFactor: number): number {
    const jitter = delay * jitterFactor;
    const randomJitter = Math.random() * jitter * 2 - jitter; // Random value between -jitter and +jitter
    return delay + randomJitter;
  }

  /**
   * Delay for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create retry context
   */
  private createContext(operation: string, config: RetryConfig): RetryContext {
    const context: RetryContext = {
      operationId: `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      operation,
      startTime: new Date(),
      attempts: [],
      config,
    };

    this.contexts.set(context.operationId, context);
    return context;
  }

  /**
   * Get retry context by ID
   */
  getContext(operationId: string): RetryContext | undefined {
    return this.contexts.get(operationId);
  }

  /**
   * Get all active contexts
   */
  getAllContexts(): RetryContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Create retry config from preset
   */
  static createConfigFromPreset(preset: keyof typeof DEFAULT_RETRY_CONFIGS): RetryConfig {
    const presetConfig = DEFAULT_RETRY_CONFIGS[preset];
    return {
      maxAttempts: 3,
      strategyType: RetryStrategyType.EXPONENTIAL_BACKOFF,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      jitterFactor: 0.3,
      retryableErrors: [],
      retryableStatusCodes: [],
      ...presetConfig,
    } as RetryConfig;
  }
}

/**
 * Retry decorator for methods
 *
 * Usage:
 * @Retry({ maxAttempts: 3 })
 * async myMethod() { ... }
 */
export function Retry(config?: Partial<RetryConfig>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const retryManager = new RetryManager(config);
      const result = await retryManager.executeWithRetry(
        () => originalMethod.apply(this, args),
        config,
        propertyKey
      );

      if (!result.success) {
        throw result.error;
      }

      return result.result;
    };

    return descriptor;
  };
}

/**
 * Simple retry function for quick use
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options?: Partial<RetryConfig>
): Promise<T> {
  const manager = new RetryManager(options);
  const result = await manager.executeWithRetry(operation, options);

  if (!result.success) {
    throw result.error;
  }

  return result.result!;
}

/**
 * Retry with specific preset
 */
export async function retryWithPreset<T>(
  operation: () => Promise<T>,
  preset: keyof typeof DEFAULT_RETRY_CONFIGS
): Promise<T> {
  const config = RetryManager.createConfigFromPreset(preset);
  return retry(operation, config);
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject requests
  HALF_OPEN = 'half_open' // Testing if recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time to wait before half-open (ms)
  monitoringPeriod: number;      // Period to track failures (ms)
}

/**
 * Circuit Breaker
 *
 * Prevents cascading failures by stopping requests when failure rate is high.
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: Date | null = null;
  private nextAttemptTime: Date | null = null;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    super();
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      monitoringPeriod: 10000, // 10 seconds
      ...config,
    };
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.emit('half_open');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successes = 0;
        this.emit('closed');
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.successes = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.config.timeout);
      this.emit('open');
    }

    if (
      this.state === CircuitState.CLOSED &&
      this.failures >= this.config.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.config.timeout);
      this.emit('open');
    }
  }

  /**
   * Check if should attempt reset
   */
  private shouldAttemptReset(): boolean {
    return (
      this.nextAttemptTime !== null &&
      new Date() >= this.nextAttemptTime
    );
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.emit('reset');
  }
}
