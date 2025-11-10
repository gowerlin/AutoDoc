/**
 * Error Reporter
 *
 * Generates comprehensive error reports with analytics, trends, and insights.
 * Supports multiple output formats: text, JSON, HTML, and CSV.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ErrorCategory,
  ErrorSeverity,
  StructuredError,
  GlobalErrorHandler,
} from './error_handler';
import { DegradationLevel, QualityLevel } from './degradation_manager';

/**
 * Report format
 */
export enum ReportFormat {
  TEXT = 'text',
  JSON = 'json',
  HTML = 'html',
  CSV = 'csv',
  MARKDOWN = 'markdown'
}

/**
 * Report time period
 */
export interface ReportPeriod {
  start: Date;
  end: Date;
  label?: string;
}

/**
 * Error trend data
 */
export interface ErrorTrend {
  period: string;
  totalErrors: number;
  errorsByCategory: { [category: string]: number };
  errorsBySeverity: { [severity: string]: number };
  averageResolutionTime: number;
  criticalErrors: number;
}

/**
 * Error analytics
 */
export interface ErrorAnalytics {
  totalErrors: number;
  errorRate: number;                // errors per hour
  mostCommonCategory: ErrorCategory;
  mostCommonSeverity: ErrorSeverity;
  averageResolutionTime: number;    // milliseconds
  resolutionRate: number;           // percentage
  criticalErrorRate: number;        // percentage
  topErrors: Array<{
    message: string;
    count: number;
    category: ErrorCategory;
    severity: ErrorSeverity;
  }>;
  categoryDistribution: Map<ErrorCategory, number>;
  severityDistribution: Map<ErrorSeverity, number>;
  hourlyDistribution: Map<number, number>; // hour of day -> count
  trends: ErrorTrend[];
}

/**
 * Error report
 */
export interface ErrorReport {
  id: string;
  title: string;
  generatedAt: Date;
  period: ReportPeriod;
  summary: {
    totalErrors: number;
    criticalErrors: number;
    resolvedErrors: number;
    unresolvedErrors: number;
    averageResolutionTime: number;
  };
  analytics: ErrorAnalytics;
  recentErrors: StructuredError[];
  criticalErrors: StructuredError[];
  recommendations: string[];
  degradationEvents: Array<{
    timestamp: Date;
    level: DegradationLevel;
    reason: string;
  }>;
  exports?: {
    text?: string;
    json?: string;
    html?: string;
    csv?: string;
    markdown?: string;
  };
}

/**
 * Report configuration
 */
export interface ReportConfig {
  includeStackTraces: boolean;
  includeContext: boolean;
  includeAnalytics: boolean;
  includeTrends: boolean;
  includeRecommendations: boolean;
  maxRecentErrors: number;
  maxCriticalErrors: number;
  trendPeriods: number;            // Number of time periods for trends
  trendPeriodLength: number;       // Length of each period in hours
}

/**
 * Error Reporter
 *
 * Generates and exports error reports with comprehensive analytics.
 */
export class ErrorReporter extends EventEmitter {
  private errorHandler: GlobalErrorHandler;
  private config: ReportConfig;
  private degradationEvents: Array<{
    timestamp: Date;
    level: DegradationLevel;
    reason: string;
  }> = [];

  constructor(errorHandler: GlobalErrorHandler, config?: Partial<ReportConfig>) {
    super();
    this.errorHandler = errorHandler;
    this.config = {
      includeStackTraces: config?.includeStackTraces ?? false,
      includeContext: config?.includeContext ?? true,
      includeAnalytics: config?.includeAnalytics ?? true,
      includeTrends: config?.includeTrends ?? true,
      includeRecommendations: config?.includeRecommendations ?? true,
      maxRecentErrors: config?.maxRecentErrors || 20,
      maxCriticalErrors: config?.maxCriticalErrors || 10,
      trendPeriods: config?.trendPeriods || 7,
      trendPeriodLength: config?.trendPeriodLength || 24,
    };
  }

  /**
   * Record degradation event
   */
  recordDegradationEvent(level: DegradationLevel, reason: string): void {
    this.degradationEvents.push({
      timestamp: new Date(),
      level,
      reason,
    });
  }

  /**
   * Generate error report
   */
  async generateReport(
    period?: ReportPeriod,
    format: ReportFormat = ReportFormat.TEXT
  ): Promise<ErrorReport> {
    const reportPeriod = period || this.getDefaultPeriod();
    const errors = this.getErrorsInPeriod(reportPeriod);

    // Generate analytics
    const analytics = this.config.includeAnalytics
      ? this.generateAnalytics(errors, reportPeriod)
      : this.getEmptyAnalytics();

    // Get recent and critical errors
    const recentErrors = this.getRecentErrors(errors);
    const criticalErrors = this.getCriticalErrors(errors);

    // Generate recommendations
    const recommendations = this.config.includeRecommendations
      ? this.generateRecommendations(analytics, criticalErrors)
      : [];

    // Get degradation events in period
    const degradationEvents = this.degradationEvents.filter(
      (event) =>
        event.timestamp >= reportPeriod.start &&
        event.timestamp <= reportPeriod.end
    );

    const report: ErrorReport = {
      id: `report-${Date.now()}`,
      title: `Error Report: ${reportPeriod.label || reportPeriod.start.toISOString()}`,
      generatedAt: new Date(),
      period: reportPeriod,
      summary: {
        totalErrors: errors.length,
        criticalErrors: criticalErrors.length,
        resolvedErrors: errors.filter((e) => e.resolved).length,
        unresolvedErrors: errors.filter((e) => !e.resolved).length,
        averageResolutionTime: this.calculateAverageResolutionTime(errors),
      },
      analytics,
      recentErrors,
      criticalErrors,
      recommendations,
      degradationEvents,
      exports: {},
    };

    // Export to requested format
    report.exports = await this.exportReport(report, format);

    this.emit('report_generated', report.id);
    return report;
  }

  /**
   * Generate analytics
   */
  private generateAnalytics(errors: StructuredError[], period: ReportPeriod): ErrorAnalytics {
    const categoryDistribution = new Map<ErrorCategory, number>();
    const severityDistribution = new Map<ErrorSeverity, number>();
    const hourlyDistribution = new Map<number, number>();
    const errorMessages = new Map<string, number>();
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    // Process errors
    for (const error of errors) {
      // Category distribution
      const categoryCount = categoryDistribution.get(error.category) || 0;
      categoryDistribution.set(error.category, categoryCount + 1);

      // Severity distribution
      const severityCount = severityDistribution.get(error.severity) || 0;
      severityDistribution.set(error.severity, severityCount + 1);

      // Hourly distribution
      const hour = error.timestamp.getHours();
      const hourCount = hourlyDistribution.get(hour) || 0;
      hourlyDistribution.set(hour, hourCount + 1);

      // Error messages
      const messageCount = errorMessages.get(error.message) || 0;
      errorMessages.set(error.message, messageCount + 1);

      // Resolution time
      if (error.resolved && error.resolvedAt) {
        totalResolutionTime += error.resolvedAt.getTime() - error.timestamp.getTime();
        resolvedCount++;
      }
    }

    // Find most common category and severity
    const mostCommonCategory = this.getMostCommon(categoryDistribution) || ErrorCategory.UNKNOWN;
    const mostCommonSeverity = this.getMostCommon(severityDistribution) || ErrorSeverity.MEDIUM;

    // Get top errors
    const topErrors = Array.from(errorMessages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => {
        const error = errors.find((e) => e.message === message)!;
        return {
          message,
          count,
          category: error.category,
          severity: error.severity,
        };
      });

    // Calculate error rate (per hour)
    const durationHours =
      (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60);
    const errorRate = errors.length / durationHours;

    // Calculate resolution rate
    const resolutionRate = errors.length > 0 ? (resolvedCount / errors.length) * 100 : 0;

    // Calculate critical error rate
    const criticalCount = Array.from(severityDistribution.entries()).find(
      ([severity]) => severity === ErrorSeverity.CRITICAL
    )?.[1] || 0;
    const criticalErrorRate = errors.length > 0 ? (criticalCount / errors.length) * 100 : 0;

    // Generate trends
    const trends = this.config.includeTrends
      ? this.generateTrends(errors, period)
      : [];

    return {
      totalErrors: errors.length,
      errorRate,
      mostCommonCategory,
      mostCommonSeverity,
      averageResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      resolutionRate,
      criticalErrorRate,
      topErrors,
      categoryDistribution,
      severityDistribution,
      hourlyDistribution,
      trends,
    };
  }

  /**
   * Generate error trends
   */
  private generateTrends(errors: StructuredError[], period: ReportPeriod): ErrorTrend[] {
    const trends: ErrorTrend[] = [];
    const periodLengthMs = this.config.trendPeriodLength * 60 * 60 * 1000;

    for (let i = 0; i < this.config.trendPeriods; i++) {
      const periodStart = new Date(
        period.end.getTime() - (i + 1) * periodLengthMs
      );
      const periodEnd = new Date(period.end.getTime() - i * periodLengthMs);

      const periodErrors = errors.filter(
        (e) => e.timestamp >= periodStart && e.timestamp < periodEnd
      );

      const errorsByCategory: { [category: string]: number } = {};
      const errorsBySeverity: { [severity: string]: number } = {};
      let totalResolutionTime = 0;
      let resolvedCount = 0;
      let criticalCount = 0;

      for (const error of periodErrors) {
        errorsByCategory[error.category] =
          (errorsByCategory[error.category] || 0) + 1;
        errorsBySeverity[error.severity] =
          (errorsBySeverity[error.severity] || 0) + 1;

        if (error.resolved && error.resolvedAt) {
          totalResolutionTime +=
            error.resolvedAt.getTime() - error.timestamp.getTime();
          resolvedCount++;
        }

        if (error.severity === ErrorSeverity.CRITICAL) {
          criticalCount++;
        }
      }

      trends.unshift({
        period: `${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
        totalErrors: periodErrors.length,
        errorsByCategory,
        errorsBySeverity,
        averageResolutionTime:
          resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
        criticalErrors: criticalCount,
      });
    }

    return trends;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    analytics: ErrorAnalytics,
    criticalErrors: StructuredError[]
  ): string[] {
    const recommendations: string[] = [];

    // High error rate
    if (analytics.errorRate > 10) {
      recommendations.push(
        `⚠️ High error rate detected (${analytics.errorRate.toFixed(2)} errors/hour). Consider investigating the root cause.`
      );
    }

    // Low resolution rate
    if (analytics.resolutionRate < 50) {
      recommendations.push(
        `⚠️ Low error resolution rate (${analytics.resolutionRate.toFixed(1)}%). Many errors remain unresolved.`
      );
    }

    // High critical error rate
    if (analytics.criticalErrorRate > 10) {
      recommendations.push(
        `🚨 High critical error rate (${analytics.criticalErrorRate.toFixed(1)}%). Immediate attention required.`
      );
    }

    // Most common category
    if (analytics.categoryDistribution.size > 0) {
      const categoryCount = analytics.categoryDistribution.get(analytics.mostCommonCategory) || 0;
      const categoryPercentage = (categoryCount / analytics.totalErrors) * 100;
      if (categoryPercentage > 30) {
        recommendations.push(
          `📊 ${analytics.mostCommonCategory} errors account for ${categoryPercentage.toFixed(1)}% of all errors. Focus on improving this area.`
        );
      }
    }

    // Network errors
    const networkErrors = analytics.categoryDistribution.get(ErrorCategory.NETWORK) || 0;
    if (networkErrors > analytics.totalErrors * 0.2) {
      recommendations.push(
        `🌐 Significant network errors detected. Consider implementing better retry strategies or checking network connectivity.`
      );
    }

    // Authentication errors
    const authErrors = analytics.categoryDistribution.get(ErrorCategory.AUTHENTICATION) || 0;
    if (authErrors > 0) {
      recommendations.push(
        `🔐 Authentication errors detected. Verify credentials and session management.`
      );
    }

    // Rendering errors
    const renderingErrors = analytics.categoryDistribution.get(ErrorCategory.RENDERING) || 0;
    if (renderingErrors > analytics.totalErrors * 0.15) {
      recommendations.push(
        `🖼️ Rendering errors are common. Consider reducing quality settings or implementing fallback mechanisms.`
      );
    }

    // Unresolved critical errors
    const unresolvedCritical = criticalErrors.filter((e) => !e.resolved);
    if (unresolvedCritical.length > 0) {
      recommendations.push(
        `🚨 ${unresolvedCritical.length} critical error(s) remain unresolved. Investigate immediately.`
      );
    }

    // Slow resolution time
    if (analytics.averageResolutionTime > 5 * 60 * 1000) {
      // > 5 minutes
      recommendations.push(
        `⏱️ Average error resolution time is ${(analytics.averageResolutionTime / 60000).toFixed(1)} minutes. Consider implementing faster recovery mechanisms.`
      );
    }

    // Trends
    if (analytics.trends.length >= 2) {
      const latestTrend = analytics.trends[analytics.trends.length - 1];
      const previousTrend = analytics.trends[analytics.trends.length - 2];
      const trendIncrease =
        ((latestTrend.totalErrors - previousTrend.totalErrors) /
          previousTrend.totalErrors) *
        100;

      if (trendIncrease > 50) {
        recommendations.push(
          `📈 Error rate increased by ${trendIncrease.toFixed(1)}% in the last period. Monitor closely.`
        );
      } else if (trendIncrease < -30) {
        recommendations.push(
          `✅ Error rate decreased by ${Math.abs(trendIncrease).toFixed(1)}% in the last period. Good progress!`
        );
      }
    }

    return recommendations;
  }

  /**
   * Export report to various formats
   */
  private async exportReport(
    report: ErrorReport,
    format: ReportFormat
  ): Promise<ErrorReport['exports']> {
    const exports: ErrorReport['exports'] = {};

    switch (format) {
      case ReportFormat.TEXT:
        exports.text = this.exportToText(report);
        break;
      case ReportFormat.JSON:
        exports.json = this.exportToJSON(report);
        break;
      case ReportFormat.HTML:
        exports.html = this.exportToHTML(report);
        break;
      case ReportFormat.CSV:
        exports.csv = this.exportToCSV(report);
        break;
      case ReportFormat.MARKDOWN:
        exports.markdown = this.exportToMarkdown(report);
        break;
    }

    return exports;
  }

  /**
   * Export to text format
   */
  private exportToText(report: ErrorReport): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(report.title);
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`Generated: ${report.generatedAt.toISOString()}`);
    lines.push(`Period: ${report.period.start.toISOString()} - ${report.period.end.toISOString()}`);
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('-'.repeat(80));
    lines.push(`Total Errors: ${report.summary.totalErrors}`);
    lines.push(`Critical Errors: ${report.summary.criticalErrors}`);
    lines.push(`Resolved: ${report.summary.resolvedErrors}`);
    lines.push(`Unresolved: ${report.summary.unresolvedErrors}`);
    lines.push(
      `Avg Resolution Time: ${(report.summary.averageResolutionTime / 1000).toFixed(2)}s`
    );
    lines.push('');

    // Analytics
    if (this.config.includeAnalytics) {
      lines.push('ANALYTICS');
      lines.push('-'.repeat(80));
      lines.push(`Error Rate: ${report.analytics.errorRate.toFixed(2)} errors/hour`);
      lines.push(`Most Common Category: ${report.analytics.mostCommonCategory}`);
      lines.push(`Most Common Severity: ${report.analytics.mostCommonSeverity}`);
      lines.push(`Resolution Rate: ${report.analytics.resolutionRate.toFixed(1)}%`);
      lines.push(`Critical Error Rate: ${report.analytics.criticalErrorRate.toFixed(1)}%`);
      lines.push('');

      // Top errors
      if (report.analytics.topErrors.length > 0) {
        lines.push('Top Errors:');
        for (const topError of report.analytics.topErrors.slice(0, 5)) {
          lines.push(`  - [${topError.category}] ${topError.message} (${topError.count}x)`);
        }
        lines.push('');
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('-'.repeat(80));
      for (const rec of report.recommendations) {
        lines.push(`• ${rec}`);
      }
      lines.push('');
    }

    // Recent errors
    if (report.recentErrors.length > 0) {
      lines.push('RECENT ERRORS');
      lines.push('-'.repeat(80));
      for (const error of report.recentErrors.slice(0, 10)) {
        lines.push(
          `[${error.timestamp.toISOString()}] [${error.severity}] [${error.category}] ${error.message}`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export to JSON format
   */
  private exportToJSON(report: ErrorReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export to HTML format
   */
  private exportToHTML(report: ErrorReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 2px solid #eee; padding-bottom: 5px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
    .stat { display: inline-block; margin: 10px 20px 10px 0; }
    .stat-label { color: #666; font-size: 0.9em; }
    .stat-value { font-size: 1.5em; font-weight: bold; }
    .error { background: #fff; border-left: 4px solid #e74c3c; padding: 10px; margin: 10px 0; }
    .critical { border-left-color: #c0392b; }
    .high { border-left-color: #e67e22; }
    .medium { border-left-color: #f39c12; }
    .low { border-left-color: #3498db; }
    .recommendation { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <p>Generated: ${report.generatedAt.toISOString()}</p>
  <p>Period: ${report.period.start.toISOString()} - ${report.period.end.toISOString()}</p>

  <h2>Summary</h2>
  <div class="summary">
    <div class="stat">
      <div class="stat-label">Total Errors</div>
      <div class="stat-value">${report.summary.totalErrors}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Critical</div>
      <div class="stat-value">${report.summary.criticalErrors}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Resolved</div>
      <div class="stat-value">${report.summary.resolvedErrors}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Unresolved</div>
      <div class="stat-value">${report.summary.unresolvedErrors}</div>
    </div>
  </div>

  ${
    report.recommendations.length > 0
      ? `
  <h2>Recommendations</h2>
  ${report.recommendations.map((r) => `<div class="recommendation">${r}</div>`).join('\n')}
  `
      : ''
  }

  ${
    report.recentErrors.length > 0
      ? `
  <h2>Recent Errors</h2>
  ${report.recentErrors
    .slice(0, 10)
    .map(
      (e) => `
    <div class="error ${e.severity}">
      <strong>[${e.severity}] [${e.category}]</strong> ${e.message}
      <br><small>${e.timestamp.toISOString()}</small>
    </div>
  `
    )
    .join('\n')}
  `
      : ''
  }
</body>
</html>
    `.trim();
  }

  /**
   * Export to CSV format
   */
  private exportToCSV(report: ErrorReport): string {
    const lines: string[] = [];
    lines.push('Timestamp,Severity,Category,Message,Resolved');

    for (const error of report.recentErrors) {
      lines.push(
        `"${error.timestamp.toISOString()}","${error.severity}","${error.category}","${error.message.replace(/"/g, '""')}","${error.resolved}"`
      );
    }

    return lines.join('\n');
  }

  /**
   * Export to Markdown format
   */
  private exportToMarkdown(report: ErrorReport): string {
    const lines: string[] = [];

    lines.push(`# ${report.title}`);
    lines.push('');
    lines.push(`**Generated:** ${report.generatedAt.toISOString()}`);
    lines.push(
      `**Period:** ${report.period.start.toISOString()} - ${report.period.end.toISOString()}`
    );
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Total Errors:** ${report.summary.totalErrors}`);
    lines.push(`- **Critical Errors:** ${report.summary.criticalErrors}`);
    lines.push(`- **Resolved:** ${report.summary.resolvedErrors}`);
    lines.push(`- **Unresolved:** ${report.summary.unresolvedErrors}`);
    lines.push(
      `- **Avg Resolution Time:** ${(report.summary.averageResolutionTime / 1000).toFixed(2)}s`
    );
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Recent errors
    if (report.recentErrors.length > 0) {
      lines.push('## Recent Errors');
      lines.push('');
      lines.push('| Timestamp | Severity | Category | Message |');
      lines.push('|-----------|----------|----------|---------|');
      for (const error of report.recentErrors.slice(0, 10)) {
        lines.push(
          `| ${error.timestamp.toISOString()} | ${error.severity} | ${error.category} | ${error.message} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Save report to file
   */
  async saveReport(report: ErrorReport, filePath: string, format: ReportFormat): Promise<void> {
    const content = await this.getReportContent(report, format);
    await fs.writeFile(filePath, content, 'utf-8');
    this.emit('report_saved', { reportId: report.id, filePath, format });
  }

  /**
   * Get report content for a specific format
   */
  private async getReportContent(report: ErrorReport, format: ReportFormat): Promise<string> {
    if (!report.exports) {
      report.exports = await this.exportReport(report, format);
    }

    switch (format) {
      case ReportFormat.TEXT:
        return report.exports.text || '';
      case ReportFormat.JSON:
        return report.exports.json || '';
      case ReportFormat.HTML:
        return report.exports.html || '';
      case ReportFormat.CSV:
        return report.exports.csv || '';
      case ReportFormat.MARKDOWN:
        return report.exports.markdown || '';
      default:
        return '';
    }
  }

  /**
   * Get default report period (last 24 hours)
   */
  private getDefaultPeriod(): ReportPeriod {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start, end, label: 'Last 24 Hours' };
  }

  /**
   * Get errors in specified period
   */
  private getErrorsInPeriod(period: ReportPeriod): StructuredError[] {
    return this.errorHandler
      .getAllErrors()
      .filter(
        (error) =>
          error.timestamp >= period.start && error.timestamp <= period.end
      );
  }

  /**
   * Get recent errors
   */
  private getRecentErrors(errors: StructuredError[]): StructuredError[] {
    return errors
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, this.config.maxRecentErrors);
  }

  /**
   * Get critical errors
   */
  private getCriticalErrors(errors: StructuredError[]): StructuredError[] {
    return errors
      .filter((e) => e.severity === ErrorSeverity.CRITICAL)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, this.config.maxCriticalErrors);
  }

  /**
   * Calculate average resolution time
   */
  private calculateAverageResolutionTime(errors: StructuredError[]): number {
    const resolved = errors.filter((e) => e.resolved && e.resolvedAt);
    if (resolved.length === 0) return 0;

    const totalTime = resolved.reduce(
      (sum, e) => sum + (e.resolvedAt!.getTime() - e.timestamp.getTime()),
      0
    );

    return totalTime / resolved.length;
  }

  /**
   * Get most common value from distribution
   */
  private getMostCommon<T>(distribution: Map<T, number>): T | null {
    let maxCount = 0;
    let mostCommon: T | null = null;

    for (const [key, count] of distribution.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = key;
      }
    }

    return mostCommon;
  }

  /**
   * Get empty analytics object
   */
  private getEmptyAnalytics(): ErrorAnalytics {
    return {
      totalErrors: 0,
      errorRate: 0,
      mostCommonCategory: ErrorCategory.UNKNOWN,
      mostCommonSeverity: ErrorSeverity.MEDIUM,
      averageResolutionTime: 0,
      resolutionRate: 0,
      criticalErrorRate: 0,
      topErrors: [],
      categoryDistribution: new Map(),
      severityDistribution: new Map(),
      hourlyDistribution: new Map(),
      trends: [],
    };
  }
}

/**
 * Quick report generation function
 */
export async function generateErrorReport(
  errorHandler: GlobalErrorHandler,
  format: ReportFormat = ReportFormat.TEXT
): Promise<ErrorReport> {
  const reporter = new ErrorReporter(errorHandler);
  return reporter.generateReport(undefined, format);
}
