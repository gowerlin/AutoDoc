/**
 * Custom error types for AutoDoc Agent
 */

export class AutoDocError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class MCPConnectionError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'MCP_CONNECTION_ERROR', 503, details);
  }
}

export class NetworkError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', 503, details);
  }
}

export class BrowserError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'BROWSER_ERROR', 500, details);
  }
}

export class AuthenticationError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
  }
}

export class ExplorationError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'EXPLORATION_ERROR', 500, details);
  }
}

export class AIServiceError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'AI_SERVICE_ERROR', 502, details);
  }
}

export class OutputError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'OUTPUT_ERROR', 500, details);
  }
}

export class TimeoutError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'TIMEOUT_ERROR', 408, details);
  }
}

export class ValidationError extends AutoDocError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}
