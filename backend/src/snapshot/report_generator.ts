/**
 * Report Generator
 * Task 8.6: 生成比對報告 - Markdown, HTML, PDF
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SnapshotDiff,
  ComparisonReport,
  UpdateStrategy,
  ReportSection,
  ProjectSnapshot,
  VersionUtils,
} from './snapshot_schema';

export interface ReportOptions {
  format: 'markdown' | 'html' | 'json';
  includeVisualDiff: boolean;
  includeDOMDetails: boolean;
  includeRecommendations: boolean;
  outputDir?: string;
}

export class ReportGenerator extends EventEmitter {
  private defaultOptions: ReportOptions = {
    format: 'markdown',
    includeVisualDiff: true,
    includeDOMDetails: true,
    includeRecommendations: true,
    outputDir: './reports',
  };

  /**
   * 生成比對報告
   */
  async generateReport(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot,
    recommendedStrategy: UpdateStrategy,
    alternativeStrategies: UpdateStrategy[],
    options?: Partial<ReportOptions>
  ): Promise<ComparisonReport> {
    console.log(`📊 Generating comparison report for: ${diff.id}`);

    const opts = { ...this.defaultOptions, ...options };

    try {
      // 創建報告
      const report: ComparisonReport = {
        id: `report-${Date.now()}`,
        title: `Snapshot Comparison Report: ${VersionUtils.toString(diff.version1)} → ${VersionUtils.toString(diff.version2)}`,
        createdAt: new Date(),
        snapshot1: {
          id: snapshot1.id,
          version: snapshot1.version,
          name: snapshot1.name,
        },
        snapshot2: {
          id: snapshot2.id,
          version: snapshot2.version,
          name: snapshot2.name,
        },
        diff,
        recommendedStrategy,
        alternativeStrategies,
        sections: [],
        exports: {},
      };

      // 生成各個章節
      report.sections = [
        this.generateSummarySection(diff, snapshot1, snapshot2),
        this.generateChangesSection(diff, opts),
        this.generateRecommendationsSection(recommendedStrategy, alternativeStrategies, opts),
        this.generateRisksSection(recommendedStrategy),
        this.generateAppendixSection(diff),
      ];

      // 匯出為各種格式
      if (opts.format === 'markdown' || opts.format === 'html') {
        report.exports.markdown = await this.exportToMarkdown(report, opts);
      }

      if (opts.format === 'html') {
        report.exports.html = await this.exportToHTML(report, opts);
      }

      if (opts.format === 'json') {
        report.exports.json = await this.exportToJSON(report, opts);
      }

      console.log(`✅ Report generated: ${report.id}`);
      this.emit('report_generated', { report });

      return report;
    } catch (error) {
      console.error('❌ Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * 生成摘要章節
   */
  private generateSummarySection(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot
  ): ReportSection {
    const content = `
## Executive Summary

**Comparison Date**: ${diff.comparedAt.toLocaleDateString()}

**Versions Compared**:
- **Baseline**: ${VersionUtils.toString(diff.version1)} (${snapshot1.name})
- **Current**: ${VersionUtils.toString(diff.version2)} (${snapshot2.name})

**Overall Impact**:
- Total Changes: **${diff.summary.totalChanges}**
- Severity: ${diff.severity.critical} critical, ${diff.severity.major} major, ${diff.severity.minor} minor

**Pages**:
- Added: ${diff.summary.pagesAdded}
- Removed: ${diff.summary.pagesRemoved}
- Modified: ${diff.summary.pagesModified}

**Content**:
- Sections Added: ${diff.summary.contentAdded}
- Sections Removed: ${diff.summary.contentRemoved}
- Sections Modified: ${diff.summary.contentModified}

**Visual Changes**: ${diff.summary.visualChanges} pages with visual differences
`;

    return {
      title: 'Summary',
      content,
      type: 'summary',
      data: diff.summary,
    };
  }

  /**
   * 生成變更章節
   */
  private generateChangesSection(diff: SnapshotDiff, options: ReportOptions): ReportSection {
    let content = '## Detailed Changes\n\n';

    // 頁面變更
    content += '### Page Changes\n\n';

    if (diff.details.pages.length === 0) {
      content += '_No page changes detected_\n\n';
    } else {
      // 按嚴重度分組
      const critical = diff.details.pages.filter((p) => p.severity === 'critical');
      const major = diff.details.pages.filter((p) => p.severity === 'major');
      const minor = diff.details.pages.filter((p) => p.severity === 'minor');

      if (critical.length > 0) {
        content += `#### Critical Changes (${critical.length})\n\n`;
        critical.forEach((page) => {
          content += `- **${page.url}** (${page.changeType})\n`;
          if (options.includeDOMDetails && page.domChanges.length > 0) {
            content += `  - DOM Changes: ${page.domChanges.length}\n`;
          }
          if (page.visualChanges.length > 0) {
            content += `  - Visual Changes: ${page.visualChanges.length}\n`;
          }
        });
        content += '\n';
      }

      if (major.length > 0) {
        content += `#### Major Changes (${major.length})\n\n`;
        major.slice(0, 10).forEach((page) => {
          content += `- **${page.url}** (${page.changeType})\n`;
        });
        if (major.length > 10) {
          content += `- _...and ${major.length - 10} more_\n`;
        }
        content += '\n';
      }

      if (minor.length > 0) {
        content += `#### Minor Changes (${minor.length})\n\n`;
        minor.slice(0, 5).forEach((page) => {
          content += `- ${page.url} (${page.changeType})\n`;
        });
        if (minor.length > 5) {
          content += `- _...and ${minor.length - 5} more_\n`;
        }
        content += '\n';
      }
    }

    return {
      title: 'Changes',
      content,
      type: 'changes',
      data: diff.details,
    };
  }

  /**
   * 生成建議章節
   */
  private generateRecommendationsSection(
    recommended: UpdateStrategy,
    alternatives: UpdateStrategy[],
    options: ReportOptions
  ): ReportSection {
    let content = '## Recommendations\n\n';

    content += `### Recommended Strategy: **${recommended.name}**\n\n`;
    content += `${recommended.description}\n\n`;

    content += `**Estimation**:\n`;
    content += `- Time: ${recommended.estimation.time}\n`;
    content += `- Pages Affected: ${recommended.estimation.pagesAffected}\n`;
    content += `- Effort: ${recommended.estimation.effort}\n\n`;

    if (recommended.recommendedActions.length > 0) {
      content += `**Actions**:\n`;
      recommended.recommendedActions.forEach((action) => {
        content += `- [${action.priority.toUpperCase()}] ${action.action}: ${action.target}\n`;
        content += `  - ${action.reason}\n`;
      });
      content += '\n';
    }

    if (alternatives.length > 0) {
      content += `### Alternative Strategies\n\n`;
      alternatives.forEach((strategy) => {
        content += `#### ${strategy.name}\n`;
        content += `- ${strategy.description}\n`;
        content += `- Time: ${strategy.estimation.time}\n`;
        content += `- Effort: ${strategy.estimation.effort}\n\n`;
      });
    }

    return {
      title: 'Recommendations',
      content,
      type: 'recommendations',
      data: { recommended, alternatives },
    };
  }

  /**
   * 生成風險章節
   */
  private generateRisksSection(strategy: UpdateStrategy): ReportSection {
    let content = '## Risk Assessment\n\n';

    if (strategy.risks.length === 0) {
      content += '_No significant risks identified_\n\n';
    } else {
      content += '| Risk Type | Description | Probability | Impact | Mitigation |\n';
      content += '|-----------|-------------|-------------|--------|------------|\n';

      strategy.risks.forEach((risk) => {
        content += `| ${risk.type} | ${risk.description} | ${risk.probability} | ${risk.impact} | ${risk.mitigation || 'N/A'} |\n`;
      });

      content += '\n';
    }

    return {
      title: 'Risks',
      content,
      type: 'risks',
      data: strategy.risks,
    };
  }

  /**
   * 生成附錄章節
   */
  private generateAppendixSection(diff: SnapshotDiff): ReportSection {
    let content = '## Appendix\n\n';

    content += '### Comparison Metadata\n\n';
    content += `- Comparison ID: ${diff.id}\n`;
    content += `- Compared At: ${diff.comparedAt.toISOString()}\n`;
    content += `- Snapshot 1 ID: ${diff.snapshot1Id}\n`;
    content += `- Snapshot 2 ID: ${diff.snapshot2Id}\n\n`;

    return {
      title: 'Appendix',
      content,
      type: 'appendix',
      data: { diffId: diff.id },
    };
  }

  /**
   * 匯出為 Markdown
   */
  private async exportToMarkdown(report: ComparisonReport, options: ReportOptions): Promise<string> {
    let markdown = `# ${report.title}\n\n`;
    markdown += `Generated on: ${report.createdAt.toLocaleString()}\n\n`;
    markdown += `---\n\n`;

    report.sections.forEach((section) => {
      markdown += section.content + '\n';
    });

    // 儲存到檔案
    if (options.outputDir) {
      const filename = `report-${report.id}.md`;
      const filepath = path.join(options.outputDir, filename);

      await fs.mkdir(options.outputDir, { recursive: true });
      await fs.writeFile(filepath, markdown);

      console.log(`  📄 Markdown report saved: ${filepath}`);
      return filepath;
    }

    return markdown;
  }

  /**
   * 匯出為 HTML
   */
  private async exportToHTML(report: ComparisonReport, options: ReportOptions): Promise<string> {
    // Convert markdown to HTML (simplified)
    const markdown = await this.exportToMarkdown(report, { ...options, outputDir: undefined });

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #555; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .critical { color: #d32f2f; font-weight: bold; }
    .major { color: #f57c00; font-weight: bold; }
    .minor { color: #388e3c; }
  </style>
</head>
<body>
  <div class="content">
    ${markdown.replace(/\n/g, '<br>')}
  </div>
</body>
</html>`;

    // 儲存到檔案
    if (options.outputDir) {
      const filename = `report-${report.id}.html`;
      const filepath = path.join(options.outputDir, filename);

      await fs.mkdir(options.outputDir, { recursive: true });
      await fs.writeFile(filepath, html);

      console.log(`  📄 HTML report saved: ${filepath}`);
      return filepath;
    }

    return html;
  }

  /**
   * 匯出為 JSON
   */
  private async exportToJSON(report: ComparisonReport, options: ReportOptions): Promise<string> {
    const json = JSON.stringify(report, null, 2);

    // 儲存到檔案
    if (options.outputDir) {
      const filename = `report-${report.id}.json`;
      const filepath = path.join(options.outputDir, filename);

      await fs.mkdir(options.outputDir, { recursive: true });
      await fs.writeFile(filepath, json);

      console.log(`  📄 JSON report saved: ${filepath}`);
      return filepath;
    }

    return json;
  }
}
