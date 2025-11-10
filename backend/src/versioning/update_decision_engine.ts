/**
 * Update Decision Engine
 * Task 7.2: 實作智能更新決策引擎
 */

import { EventEmitter } from 'events';
import { DOMChange, VisualChange, ChangeSeverity } from './change_detector';

export type UpdateAction = 'add_section' | 'remove_section' | 'update_screenshots' | 'update_text' | 'no_action';
export type UpdatePriority = 'high' | 'medium' | 'low';

export interface ClassifiedChange {
  originalChange: DOMChange | VisualChange;
  action: UpdateAction;
  priority: UpdatePriority;
  reason: string;
  affectedPages: string[];
  affectedSections: string[];
}

export interface UpdatePlan {
  id: string;
  createdAt: Date;
  changes: ClassifiedChange[];
  pagesToReexplore: string[];
  sectionsToUpdate: string[];
  estimatedTime: string;
  summary: {
    totalChanges: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  };
}

export class UpdateDecisionEngine extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * 分類變更類型
   */
  classifyChange(change: DOMChange | VisualChange): ClassifiedChange {
    let action: UpdateAction = 'no_action';
    let priority: UpdatePriority = 'low';
    let reason = '';
    const affectedPages: string[] = [];
    const affectedSections: string[] = [];

    if ('selector' in change) {
      // DOM change
      const domChange = change as DOMChange;

      if (domChange.type === 'added') {
        // New element added
        if (['button', 'a'].includes(domChange.after?.tagName || '')) {
          action = 'add_section';
          priority = 'high';
          reason = 'New interactive element requires new documentation section';
        } else {
          action = 'update_text';
          priority = 'medium';
          reason = 'New element may require text updates';
        }
      } else if (domChange.type === 'removed') {
        // Element removed
        if (['button', 'a', 'form'].includes(domChange.before?.tagName || '')) {
          action = 'remove_section';
          priority = 'high';
          reason = 'Removed feature requires section removal or update';
        } else {
          action = 'update_text';
          priority = 'low';
          reason = 'Minor element removed';
        }
      } else if (domChange.type === 'modified') {
        // Element modified
        if (domChange.description.includes('text changed')) {
          action = 'update_text';
          priority = 'medium';
          reason = 'Text content changed';
        }
        if (domChange.description.includes('position changed')) {
          action = 'update_screenshots';
          priority = 'medium';
          reason = 'Element position changed';
        }
      }
    } else {
      // Visual change
      const visualChange = change as VisualChange;

      if (visualChange.differencePercentage > 10) {
        action = 'update_screenshots';
        priority = 'high';
        reason = 'Significant visual changes detected';
      } else if (visualChange.differencePercentage > 2) {
        action = 'update_screenshots';
        priority = 'medium';
        reason = 'Moderate visual changes detected';
      } else {
        action = 'update_screenshots';
        priority = 'low';
        reason = 'Minor cosmetic changes';
      }

      affectedPages.push(visualChange.url);
    }

    return {
      originalChange: change,
      action,
      priority,
      reason,
      affectedPages,
      affectedSections,
    };
  }

  /**
   * 優先級排序
   */
  prioritizeUpdates(changes: ClassifiedChange[]): ClassifiedChange[] {
    return [...changes].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * 生成更新計劃
   */
  generateUpdatePlan(
    domChanges: DOMChange[],
    visualChanges: VisualChange[]
  ): UpdatePlan {
    console.log('📋 Generating update plan...');

    // Classify all changes
    const allChanges = [...domChanges, ...visualChanges];
    const classifiedChanges = allChanges.map((change) => this.classifyChange(change));

    // Prioritize
    const prioritizedChanges = this.prioritizeUpdates(classifiedChanges);

    // Extract pages to re-explore
    const pagesToReexplore = [
      ...new Set(
        prioritizedChanges
          .filter((c) => c.priority === 'high' && (c.action === 'add_section' || c.action === 'remove_section'))
          .flatMap((c) => c.affectedPages)
      ),
    ];

    // Extract sections to update
    const sectionsToUpdate = [
      ...new Set(
        prioritizedChanges
          .filter((c) => c.action !== 'no_action')
          .flatMap((c) => c.affectedSections)
      ),
    ];

    // Estimate time
    const estimatedMinutes =
      prioritizedChanges.filter((c) => c.priority === 'high').length * 5 +
      prioritizedChanges.filter((c) => c.priority === 'medium').length * 2 +
      prioritizedChanges.filter((c) => c.priority === 'low').length * 1;

    const estimatedTime = estimatedMinutes < 60
      ? `${estimatedMinutes} minutes`
      : `${Math.ceil(estimatedMinutes / 60)} hours`;

    const plan: UpdatePlan = {
      id: `plan-${Date.now()}`,
      createdAt: new Date(),
      changes: prioritizedChanges,
      pagesToReexplore,
      sectionsToUpdate,
      estimatedTime,
      summary: {
        totalChanges: prioritizedChanges.length,
        highPriority: prioritizedChanges.filter((c) => c.priority === 'high').length,
        mediumPriority: prioritizedChanges.filter((c) => c.priority === 'medium').length,
        lowPriority: prioritizedChanges.filter((c) => c.priority === 'low').length,
      },
    };

    console.log(`✅ Update plan generated: ${plan.summary.totalChanges} changes, ${estimatedTime}`);
    this.emit('plan_generated', plan);

    return plan;
  }
}
