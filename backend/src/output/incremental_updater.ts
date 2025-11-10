/**
 * Incremental Updater
 * Task 5.4: 實作增量更新機制
 */

import { docs_v1 } from 'googleapis';
import { GoogleDocsClient } from './google_docs_client';
import { DocsContentWriter } from './docs_content_writer';
import { BatchOperations } from './batch_operations';
import { EventEmitter } from 'events';
import * as Diff from 'diff';

export type ChangeType = 'added' | 'modified' | 'deleted' | 'unchanged';

export interface ContentChange {
  type: ChangeType;
  oldContent?: string;
  newContent?: string;
  position?: number;
  length?: number;
}

export interface DiffResult {
  changes: ContentChange[];
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  unchangedCount: number;
  similarity: number; // 0-1
}

export interface UpdateSuggestion {
  id: string;
  type: ChangeType;
  content: string;
  position: number;
  metadata?: {
    reason?: string;
    confidence?: number;
  };
}

export interface HighlightOptions {
  addedColor?: string;
  modifiedColor?: string;
  deletedStyle?: 'strikethrough' | 'highlight';
}

export class IncrementalUpdater extends EventEmitter {
  private client: GoogleDocsClient;
  private writer: DocsContentWriter;
  private batchOps: BatchOperations;

  constructor(client: GoogleDocsClient) {
    super();

    if (!client.isAuthenticated()) {
      throw new Error('GoogleDocsClient must be authenticated');
    }

    this.client = client;
    this.writer = new DocsContentWriter(client);
    this.batchOps = new BatchOperations(client);
  }

  /**
   * 對比舊版內容
   */
  async compareWithExisting(
    docId: string,
    newContent: string
  ): Promise<DiffResult> {
    try {
      console.log(`🔍 Comparing with existing document ${docId}...`);

      // Get existing content
      const existingContent = await this.writer.getDocumentContent(docId);

      // Perform diff
      const diffResult = this.performDiff(existingContent, newContent);

      console.log(`✅ Comparison complete:`);
      console.log(`   Added: ${diffResult.addedCount} blocks`);
      console.log(`   Modified: ${diffResult.modifiedCount} blocks`);
      console.log(`   Deleted: ${diffResult.deletedCount} blocks`);
      console.log(`   Similarity: ${(diffResult.similarity * 100).toFixed(1)}%`);

      this.emit('comparison_complete', diffResult);

      return diffResult;
    } catch (error) {
      console.error('❌ Failed to compare with existing document:', error);
      throw error;
    }
  }

  /**
   * 執行 Diff 演算法
   */
  private performDiff(oldContent: string, newContent: string): DiffResult {
    // Split into paragraphs
    const oldParagraphs = oldContent.split('\n').filter((p) => p.trim());
    const newParagraphs = newContent.split('\n').filter((p) => p.trim());

    // Perform line-by-line diff
    const diffs = Diff.diffLines(oldContent, newContent);

    const changes: ContentChange[] = [];
    let addedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;
    let unchangedCount = 0;
    let currentPosition = 0;

    diffs.forEach((diff) => {
      const lines = diff.value.split('\n').filter((l) => l.trim());

      if (diff.added) {
        // Added content
        lines.forEach((line) => {
          changes.push({
            type: 'added',
            newContent: line,
            position: currentPosition,
            length: line.length,
          });
          addedCount++;
          currentPosition += line.length + 1; // +1 for newline
        });
      } else if (diff.removed) {
        // Deleted content
        lines.forEach((line) => {
          changes.push({
            type: 'deleted',
            oldContent: line,
            position: currentPosition,
            length: line.length,
          });
          deletedCount++;
        });
      } else {
        // Unchanged content
        lines.forEach((line) => {
          changes.push({
            type: 'unchanged',
            oldContent: line,
            newContent: line,
            position: currentPosition,
            length: line.length,
          });
          unchangedCount++;
          currentPosition += line.length + 1;
        });
      }
    });

    // Check for modifications (deleted + added at same position)
    for (let i = 0; i < changes.length - 1; i++) {
      const current = changes[i];
      const next = changes[i + 1];

      if (current.type === 'deleted' && next.type === 'added') {
        // This is a modification
        current.type = 'modified';
        current.newContent = next.newContent;
        changes.splice(i + 1, 1);
        modifiedCount++;
        addedCount--;
        deletedCount--;
      }
    }

    // Calculate similarity
    const totalBlocks = addedCount + modifiedCount + deletedCount + unchangedCount;
    const similarity = totalBlocks > 0 ? unchangedCount / totalBlocks : 0;

    return {
      changes,
      addedCount,
      modifiedCount,
      deletedCount,
      unchangedCount,
      similarity,
    };
  }

  /**
   * 提出修訂建議
   */
  async suggestChanges(
    docId: string,
    changes: ContentChange[],
    suggestionMode: boolean = true
  ): Promise<void> {
    try {
      console.log(`💡 Suggesting ${changes.length} changes to document ${docId}...`);

      const requests: docs_v1.Schema$Request[] = [];

      changes.forEach((change) => {
        if (change.type === 'added') {
          // Insert new content
          requests.push({
            insertText: {
              location: { index: change.position || 1 },
              text: change.newContent + '\n',
            },
          });
        } else if (change.type === 'modified') {
          // Delete old content and insert new
          if (change.position !== undefined && change.length !== undefined) {
            requests.push({
              deleteContentRange: {
                range: {
                  startIndex: change.position,
                  endIndex: change.position + change.length,
                },
              },
            });

            requests.push({
              insertText: {
                location: { index: change.position },
                text: change.newContent + '\n',
              },
            });
          }
        } else if (change.type === 'deleted') {
          // Delete content (or mark with strikethrough in suggestion mode)
          if (change.position !== undefined && change.length !== undefined) {
            if (suggestionMode) {
              // Apply strikethrough instead of deleting
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: change.position,
                    endIndex: change.position + change.length,
                  },
                  textStyle: {
                    strikethrough: true,
                  },
                  fields: 'strikethrough',
                },
              });
            } else {
              requests.push({
                deleteContentRange: {
                  range: {
                    startIndex: change.position,
                    endIndex: change.position + change.length,
                  },
                },
              });
            }
          }
        }
      });

      // Execute batch update
      if (requests.length > 0) {
        await this.batchOps.batchRequests(docId, requests);
        await this.batchOps.waitForCompletion();
      }

      console.log(`✅ Suggestions applied`);
      this.emit('suggestions_applied', { docId, changeCount: changes.length });
    } catch (error) {
      console.error('❌ Failed to suggest changes:', error);
      throw error;
    }
  }

  /**
   * 高亮變更區域
   */
  async highlightChanges(
    docId: string,
    changes: ContentChange[],
    options: HighlightOptions = {}
  ): Promise<void> {
    try {
      console.log(`🎨 Highlighting ${changes.length} changes in document ${docId}...`);

      const addedColor = options.addedColor || '#00FF00'; // Green
      const modifiedColor = options.modifiedColor || '#FFFF00'; // Yellow
      const deletedStyle = options.deletedStyle || 'strikethrough';

      const requests: docs_v1.Schema$Request[] = [];

      changes.forEach((change) => {
        if (change.position === undefined || change.length === undefined) return;

        const range = {
          startIndex: change.position,
          endIndex: change.position + (change.newContent?.length || change.length),
        };

        if (change.type === 'added') {
          // Green background for added content
          requests.push({
            updateTextStyle: {
              range,
              textStyle: {
                backgroundColor: this.parseColor(addedColor),
              },
              fields: 'backgroundColor',
            },
          });
        } else if (change.type === 'modified') {
          // Yellow background for modified content
          requests.push({
            updateTextStyle: {
              range,
              textStyle: {
                backgroundColor: this.parseColor(modifiedColor),
              },
              fields: 'backgroundColor',
            },
          });
        } else if (change.type === 'deleted') {
          // Strikethrough or highlight for deleted content
          if (deletedStyle === 'strikethrough') {
            requests.push({
              updateTextStyle: {
                range: {
                  startIndex: change.position,
                  endIndex: change.position + change.length,
                },
                textStyle: {
                  strikethrough: true,
                  foregroundColor: this.parseColor('#FF0000'), // Red text
                },
                fields: 'strikethrough,foregroundColor',
              },
            });
          } else {
            requests.push({
              updateTextStyle: {
                range: {
                  startIndex: change.position,
                  endIndex: change.position + change.length,
                },
                textStyle: {
                  backgroundColor: this.parseColor('#FFB6C1'), // Light red
                },
                fields: 'backgroundColor',
              },
            });
          }
        }
      });

      // Execute batch update
      if (requests.length > 0) {
        await this.batchOps.batchRequests(docId, requests);
        await this.batchOps.waitForCompletion();
      }

      console.log(`✅ Changes highlighted`);
      this.emit('changes_highlighted', { docId, changeCount: changes.length });
    } catch (error) {
      console.error('❌ Failed to highlight changes:', error);
      throw error;
    }
  }

  /**
   * 增量更新文檔（對比 + 建議 + 高亮）
   */
  async incrementalUpdate(
    docId: string,
    newContent: string,
    options: {
      suggestionMode?: boolean;
      highlightChanges?: boolean;
      highlightOptions?: HighlightOptions;
    } = {}
  ): Promise<DiffResult> {
    try {
      console.log(`🔄 Performing incremental update on document ${docId}...`);

      const suggestionMode = options.suggestionMode !== false;
      const shouldHighlight = options.highlightChanges !== false;

      // 1. Compare with existing content
      const diffResult = await this.compareWithExisting(docId, newContent);

      // 2. Filter out unchanged content
      const changesOnly = diffResult.changes.filter((c) => c.type !== 'unchanged');

      if (changesOnly.length === 0) {
        console.log('ℹ️ No changes detected');
        return diffResult;
      }

      // 3. Suggest changes
      await this.suggestChanges(docId, changesOnly, suggestionMode);

      // 4. Highlight changes if requested
      if (shouldHighlight) {
        await this.highlightChanges(docId, changesOnly, options.highlightOptions);
      }

      console.log(`✅ Incremental update complete`);
      this.emit('incremental_update_complete', { docId, diffResult });

      return diffResult;
    } catch (error) {
      console.error('❌ Incremental update failed:', error);
      throw error;
    }
  }

  /**
   * 清除所有高亮
   */
  async clearHighlights(docId: string): Promise<void> {
    try {
      console.log(`🧹 Clearing highlights in document ${docId}...`);

      const endIndex = await this.writer.getEndIndex(docId);

      const requests: docs_v1.Schema$Request[] = [
        {
          updateTextStyle: {
            range: {
              startIndex: 1,
              endIndex: endIndex - 1,
            },
            textStyle: {
              backgroundColor: { color: {} }, // Clear background
              strikethrough: false,
            },
            fields: 'backgroundColor,strikethrough',
          },
        },
      ];

      await this.batchOps.batchRequests(docId, requests);
      await this.batchOps.waitForCompletion();

      console.log('✅ Highlights cleared');
      this.emit('highlights_cleared', docId);
    } catch (error) {
      console.error('❌ Failed to clear highlights:', error);
      throw error;
    }
  }

  /**
   * 接受所有建議（移除高亮）
   */
  async acceptAllSuggestions(docId: string): Promise<void> {
    try {
      console.log(`✅ Accepting all suggestions in document ${docId}...`);

      await this.clearHighlights(docId);

      // Remove strikethrough content
      const doc = await this.client.getDocument(docId);
      const requests: docs_v1.Schema$Request[] = [];

      if (doc.body?.content) {
        for (const element of doc.body.content) {
          if (element.paragraph) {
            for (const textElement of element.paragraph.elements || []) {
              if (
                textElement.textRun?.textStyle?.strikethrough &&
                textElement.startIndex !== undefined &&
                textElement.endIndex !== undefined
              ) {
                // Delete strikethrough content
                requests.push({
                  deleteContentRange: {
                    range: {
                      startIndex: textElement.startIndex,
                      endIndex: textElement.endIndex,
                    },
                  },
                });
              }
            }
          }
        }
      }

      if (requests.length > 0) {
        await this.batchOps.batchRequests(docId, requests);
        await this.batchOps.waitForCompletion();
      }

      console.log('✅ All suggestions accepted');
      this.emit('suggestions_accepted', docId);
    } catch (error) {
      console.error('❌ Failed to accept suggestions:', error);
      throw error;
    }
  }

  /**
   * 拒絕所有建議（移除高亮，保留原內容）
   */
  async rejectAllSuggestions(docId: string): Promise<void> {
    try {
      console.log(`❌ Rejecting all suggestions in document ${docId}...`);

      await this.clearHighlights(docId);

      // Remove added/modified content (with green/yellow background)
      // Keep deleted content (remove strikethrough)
      const doc = await this.client.getDocument(docId);
      const requests: docs_v1.Schema$Request[] = [];

      if (doc.body?.content) {
        for (const element of doc.body.content) {
          if (element.paragraph) {
            for (const textElement of element.paragraph.elements || []) {
              const hasBackground =
                textElement.textRun?.textStyle?.backgroundColor?.color?.rgbColor;

              if (
                hasBackground &&
                textElement.startIndex !== undefined &&
                textElement.endIndex !== undefined
              ) {
                // Delete content with background (added/modified)
                requests.push({
                  deleteContentRange: {
                    range: {
                      startIndex: textElement.startIndex,
                      endIndex: textElement.endIndex,
                    },
                  },
                });
              }
            }
          }
        }
      }

      if (requests.length > 0) {
        await this.batchOps.batchRequests(docId, requests);
        await this.batchOps.waitForCompletion();
      }

      console.log('✅ All suggestions rejected');
      this.emit('suggestions_rejected', docId);
    } catch (error) {
      console.error('❌ Failed to reject suggestions:', error);
      throw error;
    }
  }

  /**
   * 輔助函數：解析顏色
   */
  private parseColor(color: string): any {
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;

      return {
        color: {
          rgbColor: { red: r, green: g, blue: b },
        },
      };
    }

    return { color: {} };
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up incremental updater...');
    await this.batchOps.cleanup();
    console.log('✅ Cleanup complete');
  }
}
