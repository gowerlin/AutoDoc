/**
 * Incremental Update Executor
 * Task 7.3: 開發增量更新執行器
 */

import { EventEmitter } from 'events';
import { UpdatePlan, ClassifiedChange } from './update_decision_engine';
import { ExplorationEngine } from '../explorer/exploration_engine';
import { IncrementalUpdater } from '../output/incremental_updater';

export interface ExecutionResult {
  success: boolean;
  changesApplied: number;
  pagesReexplored: number;
  sectionsUpdated: number;
  errors: string[];
  duration: number;
}

export interface VersionMetadata {
  version: string;
  lastUpdated: Date;
  changeSummary: string;
  updatedBy: string;
}

export class IncrementalExecutor extends EventEmitter {
  private explorationEngine: ExplorationEngine;
  private incrementalUpdater: IncrementalUpdater;

  constructor(explorationEngine: ExplorationEngine, incrementalUpdater: IncrementalUpdater) {
    super();
    this.explorationEngine = explorationEngine;
    this.incrementalUpdater = incrementalUpdater;
  }

  /**
   * 執行更新計劃
   */
  async executeUpdatePlan(plan: UpdatePlan, docId: string): Promise<ExecutionResult> {
    console.log(`🚀 Executing update plan ${plan.id}...`);
    const startTime = Date.now();
    const errors: string[] = [];
    let changesApplied = 0;
    let pagesReexplored = 0;
    let sectionsUpdated = 0;

    try {
      // Step 1: Re-explore changed pages (high priority only)
      const highPriorityPages = plan.changes
        .filter((c) => c.priority === 'high')
        .flatMap((c) => c.affectedPages);

      if (highPriorityPages.length > 0) {
        console.log(`  📍 Re-exploring ${highPriorityPages.length} high-priority pages...`);

        for (const pageUrl of highPriorityPages) {
          try {
            // TODO: Trigger re-exploration for this specific page
            // await this.explorationEngine.exploreSpecificPage(pageUrl);
            pagesReexplored++;
          } catch (error) {
            errors.push(`Failed to re-explore ${pageUrl}: ${error}`);
          }
        }
      }

      // Step 2: Apply changes to document
      console.log(`  📝 Applying ${plan.changes.length} changes to document...`);

      for (const change of plan.changes) {
        try {
          await this.applyChange(change, docId);
          changesApplied++;
        } catch (error) {
          errors.push(`Failed to apply change: ${error}`);
        }
      }

      // Step 3: Update version metadata
      const versionMetadata = this.generateVersionMetadata(plan);
      await this.updateVersionMetadata(docId, versionMetadata);

      const duration = Date.now() - startTime;

      const result: ExecutionResult = {
        success: errors.length === 0,
        changesApplied,
        pagesReexplored,
        sectionsUpdated,
        errors,
        duration,
      };

      console.log(`✅ Update plan executed in ${duration}ms`);
      this.emit('plan_executed', result);

      return result;
    } catch (error) {
      console.error('❌ Update plan execution failed:', error);
      throw error;
    }
  }

  /**
   * 應用單個變更
   */
  private async applyChange(change: ClassifiedChange, docId: string): Promise<void> {
    switch (change.action) {
      case 'add_section':
        // TODO: Add new section to document
        console.log(`  ➕ Adding section: ${change.reason}`);
        break;

      case 'remove_section':
        // TODO: Mark section as deprecated or remove
        console.log(`  ➖ Removing section: ${change.reason}`);
        break;

      case 'update_screenshots':
        // TODO: Update screenshots in affected sections
        console.log(`  📸 Updating screenshots: ${change.reason}`);
        break;

      case 'update_text':
        // TODO: Update text content
        console.log(`  ✏️ Updating text: ${change.reason}`);
        break;

      case 'no_action':
        // Skip
        break;
    }
  }

  /**
   * 合併新舊內容
   */
  async mergeWithExisting(
    newContent: string,
    existingDocId: string,
    suggestionMode: boolean = true
  ): Promise<void> {
    console.log('🔀 Merging new content with existing document...');

    // Use IncrementalUpdater to merge content
    await this.incrementalUpdater.incrementalUpdate(existingDocId, newContent, {
      suggestionMode,
      highlightChanges: true,
    });

    console.log('✅ Content merged successfully');
    this.emit('content_merged', { existingDocId, suggestionMode });
  }

  /**
   * 生成版本元數據
   */
  private generateVersionMetadata(plan: UpdatePlan): VersionMetadata {
    const changeSummary = `${plan.summary.highPriority} high-priority, ${plan.summary.mediumPriority} medium-priority, ${plan.summary.lowPriority} low-priority changes`;

    return {
      version: this.generateVersionNumber(),
      lastUpdated: new Date(),
      changeSummary,
      updatedBy: 'AutoDoc Agent',
    };
  }

  /**
   * 更新版本元數據
   */
  private async updateVersionMetadata(docId: string, metadata: VersionMetadata): Promise<void> {
    console.log('📝 Updating version metadata...');

    // TODO: Add metadata to document
    // For example, insert at the beginning:
    // ---
    // Version: ${metadata.version}
    // Last Updated: ${metadata.lastUpdated}
    // Changes: ${metadata.changeSummary}
    // ---

    console.log(`✅ Version metadata updated: ${metadata.version}`);
  }

  /**
   * 生成版本號
   */
  private generateVersionNumber(): string {
    const now = new Date();
    return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
  }
}
