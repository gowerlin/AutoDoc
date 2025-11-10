/**
 * Update Strategy Engine
 * Task 8.4: 根據差異分析生成更新策略建議
 */

import { EventEmitter } from 'events';
import {
  SnapshotDiff,
  UpdateStrategy,
  RecommendedAction,
  Risk,
  ProjectSnapshot,
} from './snapshot_schema';

export interface StrategyOptions {
  // 時間預算 (分鐘)
  timeBudget?: number;

  // 成本預算
  costBudget?: number;

  // 優先考慮因素
  priority: 'speed' | 'quality' | 'cost';

  // 允許手動審核
  allowManualReview: boolean;

  // 自動決策閾值
  autoDecisionThreshold?: {
    fullRegenerate: number; // 變更超過此比例時完全重新生成
    incrementalUpdate: number; // 變更低於此比例時增量更新
  };
}

export class UpdateStrategyEngine extends EventEmitter {
  private defaultOptions: StrategyOptions = {
    timeBudget: 120, // 2 hours
    costBudget: 100,
    priority: 'quality',
    allowManualReview: true,
    autoDecisionThreshold: {
      fullRegenerate: 0.5, // 50% 以上變更
      incrementalUpdate: 0.1, // 10% 以下變更
    },
  };

  /**
   * 生成更新策略
   */
  async generateStrategy(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot,
    options?: Partial<StrategyOptions>
  ): Promise<UpdateStrategy[]> {
    console.log(`🎯 Generating update strategy for diff: ${diff.id}`);

    const opts = { ...this.defaultOptions, ...options };

    try {
      const strategies: UpdateStrategy[] = [];

      // 1. 完全重新生成策略
      const fullRegenerateStrategy = this.createFullRegenerateStrategy(diff, snapshot1, snapshot2);
      strategies.push(fullRegenerateStrategy);

      // 2. 增量更新策略
      const incrementalStrategy = this.createIncrementalUpdateStrategy(diff, snapshot1, snapshot2);
      strategies.push(incrementalStrategy);

      // 3. 手動審核策略
      if (opts.allowManualReview) {
        const manualReviewStrategy = this.createManualReviewStrategy(diff, snapshot1, snapshot2);
        strategies.push(manualReviewStrategy);
      }

      // 4. 不採取行動策略
      const noActionStrategy = this.createNoActionStrategy(diff, snapshot1, snapshot2);
      strategies.push(noActionStrategy);

      // 根據優先級排序
      strategies.sort((a, b) => this.compareStrategies(a, b, opts));

      console.log(`✅ Generated ${strategies.length} strategies`);
      this.emit('strategies_generated', { diff, strategies });

      return strategies;
    } catch (error) {
      console.error('❌ Failed to generate strategy:', error);
      throw error;
    }
  }

  /**
   * 自動選擇最佳策略
   */
  async selectBestStrategy(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot,
    options?: Partial<StrategyOptions>
  ): Promise<UpdateStrategy> {
    const strategies = await this.generateStrategy(diff, snapshot1, snapshot2, options);
    return strategies[0]; // 已排序，第一個為最佳
  }

  /**
   * 創建完全重新生成策略
   */
  private createFullRegenerateStrategy(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot
  ): UpdateStrategy {
    const pagesAffected = diff.summary.pagesAdded + diff.summary.pagesRemoved + diff.summary.pagesModified;
    const totalPages = snapshot2.explorationData.pages.size;

    // 估算時間 (每頁 5 分鐘)
    const estimatedMinutes = totalPages * 5;
    const estimatedTime = this.formatTime(estimatedMinutes);

    // 建議操作
    const actions: RecommendedAction[] = [
      {
        action: 'reexplore',
        target: 'all_pages',
        reason: 'Complete re-exploration to capture all changes',
        priority: 'high',
      },
      {
        action: 'update_content',
        target: 'all_sections',
        reason: 'Regenerate all documentation content',
        priority: 'high',
      },
      {
        action: 'update_screenshots',
        target: 'all_pages',
        reason: 'Capture fresh screenshots for all pages',
        priority: 'high',
      },
    ];

    // 風險評估
    const risks: Risk[] = [
      {
        type: 'data_loss',
        description: 'All manual edits and customizations will be lost',
        probability: 'high',
        impact: 'high',
        mitigation: 'Export current manual for backup before regeneration',
      },
      {
        type: 'inconsistency',
        description: 'Documentation structure may change significantly',
        probability: 'medium',
        impact: 'medium',
        mitigation: 'Review generated content before publishing',
      },
    ];

    // 優先級計算
    const changeRatio = pagesAffected / Math.max(totalPages, 1);
    const priority = changeRatio > 0.5 ? 100 : Math.floor((1 - changeRatio) * 50);

    return {
      id: 'full_regenerate',
      name: 'Full Regenerate',
      description: 'Completely regenerate the entire documentation from scratch',
      type: 'full_regenerate',
      estimation: {
        time: estimatedTime,
        pagesAffected: totalPages,
        effort: 'high',
        cost: totalPages * 2, // Cost units
      },
      recommendedActions: actions,
      risks,
      priority,
    };
  }

  /**
   * 創建增量更新策略
   */
  private createIncrementalUpdateStrategy(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot
  ): UpdateStrategy {
    const actions: RecommendedAction[] = [];
    const risks: Risk[] = [];

    // 處理新增的頁面
    if (diff.summary.pagesAdded > 0) {
      actions.push({
        action: 'reexplore',
        target: `${diff.summary.pagesAdded} new pages`,
        reason: 'Explore newly added pages',
        priority: 'high',
      });

      actions.push({
        action: 'add_section',
        target: `${diff.summary.pagesAdded} sections`,
        reason: 'Add documentation for new features',
        priority: 'high',
      });
    }

    // 處理刪除的頁面
    if (diff.summary.pagesRemoved > 0) {
      actions.push({
        action: 'remove_section',
        target: `${diff.summary.pagesRemoved} sections`,
        reason: 'Remove documentation for deprecated features',
        priority: 'high',
      });

      risks.push({
        type: 'data_loss',
        description: `${diff.summary.pagesRemoved} sections will be removed`,
        probability: 'high',
        impact: 'medium',
        mitigation: 'Mark as deprecated instead of removing immediately',
      });
    }

    // 處理修改的頁面
    if (diff.summary.pagesModified > 0) {
      const criticalPages = diff.details.pages.filter((p) => p.severity === 'critical').length;
      const majorPages = diff.details.pages.filter((p) => p.severity === 'major').length;

      if (criticalPages > 0) {
        actions.push({
          action: 'reexplore',
          target: `${criticalPages} critical pages`,
          reason: 'Re-explore pages with critical changes',
          priority: 'high',
        });
      }

      if (majorPages > 0) {
        actions.push({
          action: 'update_content',
          target: `${majorPages} sections`,
          reason: 'Update documentation for modified features',
          priority: 'medium',
        });
      }

      actions.push({
        action: 'update_screenshots',
        target: `${diff.summary.visualChanges} pages`,
        reason: 'Update screenshots for visually changed pages',
        priority: 'medium',
      });

      risks.push({
        type: 'inconsistency',
        description: 'Mixed old and new content may cause confusion',
        probability: 'medium',
        impact: 'low',
        mitigation: 'Use suggestion mode for review',
      });
    }

    // 估算時間
    const pagesAffected = diff.summary.pagesAdded + diff.summary.pagesRemoved + diff.summary.pagesModified;
    const estimatedMinutes =
      diff.summary.pagesAdded * 5 + // New pages: 5 min each
      diff.summary.pagesRemoved * 1 + // Remove: 1 min each
      diff.summary.pagesModified * 3; // Update: 3 min each

    const estimatedTime = this.formatTime(estimatedMinutes);

    // 優先級計算
    const totalPages = snapshot2.explorationData.pages.size;
    const changeRatio = pagesAffected / Math.max(totalPages, 1);
    const priority = changeRatio < 0.1 ? 100 : changeRatio < 0.5 ? 80 : 60;

    return {
      id: 'incremental_update',
      name: 'Incremental Update',
      description: 'Update only the changed portions of the documentation',
      type: 'incremental_update',
      estimation: {
        time: estimatedTime,
        pagesAffected,
        effort: pagesAffected > 10 ? 'high' : pagesAffected > 3 ? 'medium' : 'low',
        cost: pagesAffected * 1.5, // Cost units
      },
      recommendedActions: actions,
      risks,
      priority,
    };
  }

  /**
   * 創建手動審核策略
   */
  private createManualReviewStrategy(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot
  ): UpdateStrategy {
    const actions: RecommendedAction[] = [
      {
        action: 'reexplore',
        target: 'changed pages',
        reason: 'Re-explore to capture latest state',
        priority: 'medium',
      },
      {
        action: 'update_content',
        target: 'selected sections',
        reason: 'Update content based on manual review',
        priority: 'low',
      },
    ];

    const risks: Risk[] = [
      {
        type: 'quality_degradation',
        description: 'Manual review may miss important changes',
        probability: 'medium',
        impact: 'medium',
        mitigation: 'Use diff viewer to highlight all changes',
      },
    ];

    const pagesAffected = diff.summary.pagesModified;
    const estimatedMinutes = pagesAffected * 10; // 10 min per page for manual review

    return {
      id: 'manual_review',
      name: 'Manual Review',
      description: 'Review changes manually and selectively update documentation',
      type: 'manual_review',
      estimation: {
        time: this.formatTime(estimatedMinutes),
        pagesAffected,
        effort: 'high',
        cost: pagesAffected * 3, // Higher cost due to manual work
      },
      recommendedActions: actions,
      risks,
      priority: 50, // Medium priority
    };
  }

  /**
   * 創建不採取行動策略
   */
  private createNoActionStrategy(
    diff: SnapshotDiff,
    snapshot1: ProjectSnapshot,
    snapshot2: ProjectSnapshot
  ): UpdateStrategy {
    const risks: Risk[] = [
      {
        type: 'quality_degradation',
        description: 'Documentation will become outdated',
        probability: 'high',
        impact: diff.severity.critical > 0 ? 'high' : diff.severity.major > 0 ? 'medium' : 'low',
        mitigation: 'Schedule update in the future',
      },
    ];

    // 優先級計算
    const priority = diff.summary.totalChanges === 0 ? 100 : diff.severity.critical > 0 ? 0 : 20;

    return {
      id: 'no_action',
      name: 'No Action',
      description: 'Do not update the documentation',
      type: 'no_action',
      estimation: {
        time: '0 minutes',
        pagesAffected: 0,
        effort: 'low',
        cost: 0,
      },
      recommendedActions: [],
      risks,
      priority,
    };
  }

  /**
   * 比較兩個策略
   */
  private compareStrategies(
    a: UpdateStrategy,
    b: UpdateStrategy,
    options: StrategyOptions
  ): number {
    switch (options.priority) {
      case 'speed':
        // 優先考慮時間
        return this.parseTimeMinutes(a.estimation.time) - this.parseTimeMinutes(b.estimation.time);

      case 'cost':
        // 優先考慮成本
        return (a.estimation.cost || 0) - (b.estimation.cost || 0);

      case 'quality':
      default:
        // 優先考慮優先級分數
        return b.priority - a.priority;
    }
  }

  /**
   * 格式化時間
   */
  private formatTime(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minutes`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (mins === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }

    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} minutes`;
  }

  /**
   * 解析時間為分鐘數
   */
  private parseTimeMinutes(timeStr: string): number {
    const hoursMatch = timeStr.match(/(\d+)\s*hour/);
    const minutesMatch = timeStr.match(/(\d+)\s*minute/);

    let totalMinutes = 0;

    if (hoursMatch) {
      totalMinutes += parseInt(hoursMatch[1], 10) * 60;
    }

    if (minutesMatch) {
      totalMinutes += parseInt(minutesMatch[1], 10);
    }

    return totalMinutes;
  }

  /**
   * 估算成本
   */
  estimateCost(strategy: UpdateStrategy): number {
    // Base cost from estimation
    let cost = strategy.estimation.cost || 0;

    // Add risk-based cost
    for (const risk of strategy.risks) {
      const riskCost =
        (risk.probability === 'high' ? 3 : risk.probability === 'medium' ? 2 : 1) *
        (risk.impact === 'high' ? 3 : risk.impact === 'medium' ? 2 : 1);
      cost += riskCost;
    }

    return cost;
  }

  /**
   * 驗證策略可行性
   */
  validateStrategy(strategy: UpdateStrategy, options: StrategyOptions): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // 檢查時間預算
    if (options.timeBudget) {
      const estimatedMinutes = this.parseTimeMinutes(strategy.estimation.time);
      if (estimatedMinutes > options.timeBudget) {
        reasons.push(`Estimated time (${strategy.estimation.time}) exceeds budget (${options.timeBudget} minutes)`);
      }
    }

    // 檢查成本預算
    if (options.costBudget) {
      const estimatedCost = this.estimateCost(strategy);
      if (estimatedCost > options.costBudget) {
        reasons.push(`Estimated cost (${estimatedCost}) exceeds budget (${options.costBudget})`);
      }
    }

    return {
      valid: reasons.length === 0,
      reasons,
    };
  }
}
