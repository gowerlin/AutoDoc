/**
 * Graceful Degradation Manager
 *
 * Provides mechanisms for gracefully degrading functionality when errors occur.
 * Implements feature toggles, fallback strategies, and quality reduction.
 */

import { EventEmitter } from 'events';
import { ErrorCategory, ErrorSeverity } from './error_handler';

/**
 * Degradation level
 */
export enum DegradationLevel {
  NONE = 'none',               // Full functionality
  MINIMAL = 'minimal',         // Minor features disabled
  MODERATE = 'moderate',       // Some features disabled
  SEVERE = 'severe',           // Major features disabled
  CRITICAL = 'critical'        // Only core features available
}

/**
 * Feature status
 */
export enum FeatureStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  DEGRADED = 'degraded',
  FALLBACK = 'fallback'
}

/**
 * Feature definition
 */
export interface Feature {
  id: string;
  name: string;
  description: string;
  priority: number;            // Higher = more important (0-100)
  status: FeatureStatus;
  degradationLevel: DegradationLevel;
  dependencies: string[];      // IDs of required features
  fallbackFeature?: string;    // ID of fallback feature
  requiredResources?: {
    memory?: number;           // MB
    cpu?: number;              // percentage
    network?: boolean;
  };
}

/**
 * Degradation strategy
 */
export interface DegradationStrategy {
  id: string;
  name: string;
  triggerCondition: {
    errorCategories?: ErrorCategory[];
    errorSeverities?: ErrorSeverity[];
    errorRate?: number;        // errors per minute
    resourceThreshold?: {
      memory?: number;         // percentage
      cpu?: number;            // percentage
    };
  };
  actions: DegradationAction[];
  priority: number;
  autoRevert: boolean;
  revertDelay?: number;        // ms
}

/**
 * Degradation action
 */
export interface DegradationAction {
  type: 'disable_feature' | 'enable_fallback' | 'reduce_quality' | 'limit_rate' | 'custom';
  target: string;              // Feature ID or resource name
  params?: any;
}

/**
 * Quality level for content generation
 */
export enum QualityLevel {
  MAXIMUM = 'maximum',         // Full quality, all features
  HIGH = 'high',               // Minor optimizations
  MEDIUM = 'medium',           // Noticeable quality reduction
  LOW = 'low',                 // Significant quality reduction
  MINIMAL = 'minimal'          // Bare minimum quality
}

/**
 * Quality settings for different levels
 */
export interface QualitySettings {
  screenshotQuality: number;   // 0-100
  maxScreenshotWidth: number;
  maxScreenshotHeight: number;
  enableInteractiveElements: boolean;
  enableAnimations: boolean;
  maxConcurrentPages: number;
  detailLevel: 'minimal' | 'basic' | 'standard' | 'detailed' | 'comprehensive';
  includeMetadata: boolean;
  enableCaching: boolean;
}

/**
 * Degradation status
 */
export interface DegradationStatus {
  currentLevel: DegradationLevel;
  qualityLevel: QualityLevel;
  disabledFeatures: string[];
  fallbackFeatures: string[];
  activeStrategies: string[];
  startTime: Date;
  reason: string;
}

/**
 * Quality level configurations
 */
const QUALITY_CONFIGS: { [key in QualityLevel]: QualitySettings } = {
  [QualityLevel.MAXIMUM]: {
    screenshotQuality: 100,
    maxScreenshotWidth: 1920,
    maxScreenshotHeight: 1080,
    enableInteractiveElements: true,
    enableAnimations: true,
    maxConcurrentPages: 10,
    detailLevel: 'comprehensive',
    includeMetadata: true,
    enableCaching: true,
  },
  [QualityLevel.HIGH]: {
    screenshotQuality: 90,
    maxScreenshotWidth: 1920,
    maxScreenshotHeight: 1080,
    enableInteractiveElements: true,
    enableAnimations: true,
    maxConcurrentPages: 8,
    detailLevel: 'detailed',
    includeMetadata: true,
    enableCaching: true,
  },
  [QualityLevel.MEDIUM]: {
    screenshotQuality: 75,
    maxScreenshotWidth: 1366,
    maxScreenshotHeight: 768,
    enableInteractiveElements: true,
    enableAnimations: false,
    maxConcurrentPages: 5,
    detailLevel: 'standard',
    includeMetadata: true,
    enableCaching: true,
  },
  [QualityLevel.LOW]: {
    screenshotQuality: 60,
    maxScreenshotWidth: 1024,
    maxScreenshotHeight: 768,
    enableInteractiveElements: false,
    enableAnimations: false,
    maxConcurrentPages: 3,
    detailLevel: 'basic',
    includeMetadata: false,
    enableCaching: true,
  },
  [QualityLevel.MINIMAL]: {
    screenshotQuality: 50,
    maxScreenshotWidth: 800,
    maxScreenshotHeight: 600,
    enableInteractiveElements: false,
    enableAnimations: false,
    maxConcurrentPages: 2,
    detailLevel: 'minimal',
    includeMetadata: false,
    enableCaching: false,
  },
};

/**
 * Graceful Degradation Manager
 *
 * Manages system degradation to maintain core functionality under adverse conditions.
 */
export class DegradationManager extends EventEmitter {
  private features: Map<string, Feature> = new Map();
  private strategies: Map<string, DegradationStrategy> = new Map();
  private currentLevel: DegradationLevel = DegradationLevel.NONE;
  private currentQuality: QualityLevel = QualityLevel.MAXIMUM;
  private degradationStatus: DegradationStatus | null = null;
  private errorCounts: Map<ErrorCategory, number> = new Map();
  private lastErrorTime: Date | null = null;
  private revertTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeDefaultFeatures();
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default features
   */
  private initializeDefaultFeatures(): void {
    const features: Feature[] = [
      {
        id: 'screenshot',
        name: 'Screenshot Capture',
        description: 'Capture high-quality screenshots',
        priority: 90,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: [],
        requiredResources: { memory: 512, network: true },
      },
      {
        id: 'interactive_exploration',
        name: 'Interactive Exploration',
        description: 'Click and interact with UI elements',
        priority: 70,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: ['screenshot'],
        requiredResources: { memory: 256 },
      },
      {
        id: 'content_parsing',
        name: 'Content Parsing',
        description: 'Parse and analyze page content',
        priority: 100,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: [],
      },
      {
        id: 'ai_generation',
        name: 'AI Content Generation',
        description: 'Generate documentation with AI',
        priority: 95,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: ['content_parsing'],
        requiredResources: { network: true },
      },
      {
        id: 'version_tracking',
        name: 'Version Tracking',
        description: 'Track changes and versions',
        priority: 60,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: [],
      },
      {
        id: 'snapshot_comparison',
        name: 'Snapshot Comparison',
        description: 'Compare project snapshots',
        priority: 50,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: ['version_tracking'],
      },
      {
        id: 'variant_support',
        name: 'Multi-Variant Support',
        description: 'Support multiple product variants',
        priority: 40,
        status: FeatureStatus.ENABLED,
        degradationLevel: DegradationLevel.NONE,
        dependencies: [],
      },
    ];

    features.forEach((feature) => {
      this.features.set(feature.id, feature);
    });
  }

  /**
   * Initialize default degradation strategies
   */
  private initializeDefaultStrategies(): void {
    const strategies: DegradationStrategy[] = [
      {
        id: 'network_failure',
        name: 'Network Failure Strategy',
        triggerCondition: {
          errorCategories: [ErrorCategory.NETWORK],
          errorRate: 5,
        },
        actions: [
          { type: 'reduce_quality', target: 'screenshot', params: { quality: QualityLevel.MEDIUM } },
          { type: 'disable_feature', target: 'interactive_exploration' },
        ],
        priority: 80,
        autoRevert: true,
        revertDelay: 300000, // 5 minutes
      },
      {
        id: 'rendering_failure',
        name: 'Rendering Failure Strategy',
        triggerCondition: {
          errorCategories: [ErrorCategory.RENDERING],
          errorRate: 3,
        },
        actions: [
          { type: 'reduce_quality', target: 'screenshot', params: { quality: QualityLevel.LOW } },
          { type: 'disable_feature', target: 'interactive_exploration' },
        ],
        priority: 70,
        autoRevert: true,
        revertDelay: 180000, // 3 minutes
      },
      {
        id: 'resource_exhaustion',
        name: 'Resource Exhaustion Strategy',
        triggerCondition: {
          resourceThreshold: {
            memory: 85,
            cpu: 90,
          },
        },
        actions: [
          { type: 'reduce_quality', target: 'screenshot', params: { quality: QualityLevel.MINIMAL } },
          { type: 'disable_feature', target: 'snapshot_comparison' },
          { type: 'disable_feature', target: 'variant_support' },
          { type: 'limit_rate', target: 'concurrent_pages', params: { max: 2 } },
        ],
        priority: 90,
        autoRevert: true,
        revertDelay: 600000, // 10 minutes
      },
      {
        id: 'auth_failure',
        name: 'Authentication Failure Strategy',
        triggerCondition: {
          errorCategories: [ErrorCategory.AUTHENTICATION],
        },
        actions: [
          { type: 'disable_feature', target: 'interactive_exploration' },
        ],
        priority: 85,
        autoRevert: false,
      },
    ];

    strategies.forEach((strategy) => {
      this.strategies.set(strategy.id, strategy);
    });
  }

  /**
   * Record an error and check if degradation should trigger
   */
  recordError(category: ErrorCategory, severity: ErrorSeverity): void {
    const count = this.errorCounts.get(category) || 0;
    this.errorCounts.set(category, count + 1);
    this.lastErrorTime = new Date();

    // Check if any strategy should be triggered
    this.checkDegradationTriggers(category, severity);

    // Clean old error counts (older than 1 minute)
    setTimeout(() => {
      const currentCount = this.errorCounts.get(category) || 0;
      if (currentCount > 0) {
        this.errorCounts.set(category, currentCount - 1);
      }
    }, 60000);
  }

  /**
   * Check if degradation should be triggered
   */
  private checkDegradationTriggers(category: ErrorCategory, severity: ErrorSeverity): void {
    for (const strategy of this.strategies.values()) {
      if (this.shouldTriggerStrategy(strategy, category, severity)) {
        this.applyStrategy(strategy);
      }
    }
  }

  /**
   * Check if strategy should be triggered
   */
  private shouldTriggerStrategy(
    strategy: DegradationStrategy,
    category: ErrorCategory,
    severity: ErrorSeverity
  ): boolean {
    const condition = strategy.triggerCondition;

    // Check error category
    if (condition.errorCategories && !condition.errorCategories.includes(category)) {
      return false;
    }

    // Check error severity
    if (condition.errorSeverities && !condition.errorSeverities.includes(severity)) {
      return false;
    }

    // Check error rate
    if (condition.errorRate) {
      const errorCount = this.errorCounts.get(category) || 0;
      if (errorCount < condition.errorRate) {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply degradation strategy
   */
  applyStrategy(strategy: DegradationStrategy): void {
    this.emit('strategy_applied', strategy.id);

    for (const action of strategy.actions) {
      this.executeAction(action);
    }

    // Update degradation status
    this.updateDegradationStatus(strategy);

    // Set up auto-revert if enabled
    if (strategy.autoRevert && strategy.revertDelay) {
      this.scheduleRevert(strategy.revertDelay);
    }
  }

  /**
   * Execute a degradation action
   */
  private executeAction(action: DegradationAction): void {
    switch (action.type) {
      case 'disable_feature':
        this.disableFeature(action.target);
        break;

      case 'enable_fallback':
        this.enableFallback(action.target);
        break;

      case 'reduce_quality':
        if (action.params?.quality) {
          this.setQualityLevel(action.params.quality);
        }
        break;

      case 'limit_rate':
        this.emit('rate_limit', {
          target: action.target,
          params: action.params,
        });
        break;

      case 'custom':
        this.emit('custom_action', action);
        break;
    }
  }

  /**
   * Disable a feature
   */
  disableFeature(featureId: string): void {
    const feature = this.features.get(featureId);
    if (feature && feature.status === FeatureStatus.ENABLED) {
      feature.status = FeatureStatus.DISABLED;
      this.emit('feature_disabled', featureId);

      // Disable dependent features
      for (const [id, f] of this.features.entries()) {
        if (f.dependencies.includes(featureId)) {
          this.disableFeature(id);
        }
      }
    }
  }

  /**
   * Enable fallback for a feature
   */
  private enableFallback(featureId: string): void {
    const feature = this.features.get(featureId);
    if (feature && feature.fallbackFeature) {
      const fallback = this.features.get(feature.fallbackFeature);
      if (fallback) {
        fallback.status = FeatureStatus.ENABLED;
        feature.status = FeatureStatus.FALLBACK;
        this.emit('fallback_enabled', {
          feature: featureId,
          fallback: feature.fallbackFeature,
        });
      }
    }
  }

  /**
   * Set quality level
   */
  setQualityLevel(level: QualityLevel): void {
    this.currentQuality = level;
    this.emit('quality_changed', level);
  }

  /**
   * Get current quality settings
   */
  getQualitySettings(): QualitySettings {
    return { ...QUALITY_CONFIGS[this.currentQuality] };
  }

  /**
   * Update degradation status
   */
  private updateDegradationStatus(strategy: DegradationStrategy): void {
    const disabledFeatures = Array.from(this.features.values())
      .filter((f) => f.status === FeatureStatus.DISABLED)
      .map((f) => f.id);

    const fallbackFeatures = Array.from(this.features.values())
      .filter((f) => f.status === FeatureStatus.FALLBACK)
      .map((f) => f.id);

    const level = this.calculateDegradationLevel(disabledFeatures.length);

    this.degradationStatus = {
      currentLevel: level,
      qualityLevel: this.currentQuality,
      disabledFeatures,
      fallbackFeatures,
      activeStrategies: [strategy.id],
      startTime: new Date(),
      reason: strategy.name,
    };

    this.currentLevel = level;
    this.emit('degradation_status_changed', this.degradationStatus);
  }

  /**
   * Calculate degradation level based on disabled features
   */
  private calculateDegradationLevel(disabledCount: number): DegradationLevel {
    const totalFeatures = this.features.size;
    const percentage = (disabledCount / totalFeatures) * 100;

    if (percentage === 0) return DegradationLevel.NONE;
    if (percentage < 20) return DegradationLevel.MINIMAL;
    if (percentage < 40) return DegradationLevel.MODERATE;
    if (percentage < 60) return DegradationLevel.SEVERE;
    return DegradationLevel.CRITICAL;
  }

  /**
   * Schedule automatic revert
   */
  private scheduleRevert(delay: number): void {
    if (this.revertTimer) {
      clearTimeout(this.revertTimer);
    }

    this.revertTimer = setTimeout(() => {
      this.revertDegradation();
    }, delay);
  }

  /**
   * Revert degradation to normal operation
   */
  revertDegradation(): void {
    // Re-enable all features
    for (const feature of this.features.values()) {
      if (feature.status === FeatureStatus.DISABLED || feature.status === FeatureStatus.FALLBACK) {
        feature.status = FeatureStatus.ENABLED;
      }
    }

    // Reset quality level
    this.currentQuality = QualityLevel.MAXIMUM;
    this.currentLevel = DegradationLevel.NONE;
    this.degradationStatus = null;

    // Clear error counts
    this.errorCounts.clear();

    // Clear revert timer
    if (this.revertTimer) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }

    this.emit('degradation_reverted');
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(featureId: string): boolean {
    const feature = this.features.get(featureId);
    return feature ? feature.status === FeatureStatus.ENABLED : false;
  }

  /**
   * Get feature status
   */
  getFeatureStatus(featureId: string): FeatureStatus | undefined {
    return this.features.get(featureId)?.status;
  }

  /**
   * Get current degradation level
   */
  getDegradationLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Get current quality level
   */
  getQualityLevel(): QualityLevel {
    return this.currentQuality;
  }

  /**
   * Get degradation status
   */
  getStatus(): DegradationStatus | null {
    return this.degradationStatus;
  }

  /**
   * Register a new feature
   */
  registerFeature(feature: Feature): void {
    this.features.set(feature.id, feature);
    this.emit('feature_registered', feature.id);
  }

  /**
   * Register a new strategy
   */
  registerStrategy(strategy: DegradationStrategy): void {
    this.strategies.set(strategy.id, strategy);
    this.emit('strategy_registered', strategy.id);
  }

  /**
   * Get all features
   */
  getAllFeatures(): Feature[] {
    return Array.from(this.features.values());
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): DegradationStrategy[] {
    return Array.from(this.strategies.values());
  }
}

/**
 * Export singleton instance
 */
let degradationManagerInstance: DegradationManager | null = null;

export function getDegradationManager(): DegradationManager {
  if (!degradationManagerInstance) {
    degradationManagerInstance = new DegradationManager();
  }
  return degradationManagerInstance;
}

export function resetDegradationManager(): void {
  if (degradationManagerInstance) {
    degradationManagerInstance.removeAllListeners();
    degradationManagerInstance = null;
  }
}
