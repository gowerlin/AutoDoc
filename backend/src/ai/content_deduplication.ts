/**
 * Content Deduplication and Merging
 * Task 4.3: 實作內容去重與合併
 */

import Anthropic from '@anthropic-ai/sdk';
import { Functionality, StepByStepGuide } from './content_structurer';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface ManualSection {
  id: string;
  level: number; // 1 = H1, 2 = H2, etc.
  title: string;
  content: string;
  subsections: ManualSection[];
  metadata?: {
    url?: string;
    functionality?: Functionality;
    guide?: StepByStepGuide;
    [key: string]: any;
  };
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  similarity: number;
  duplicateOf?: string;
  reason?: string;
}

export interface MergedSection {
  id: string;
  title: string;
  content: string;
  alternativePaths: Array<{
    name: string;
    description: string;
    url: string;
  }>;
  mergedFrom: string[];
}

export interface TableOfContents {
  items: TOCItem[];
}

export interface TOCItem {
  id: string;
  level: number;
  title: string;
  anchor: string;
  children: TOCItem[];
}

export interface OptimizedManual {
  title: string;
  toc: TableOfContents;
  sections: ManualSection[];
  metadata: {
    totalSections: number;
    maxDepth: number;
    optimizedAt: Date;
  };
}

export class ContentDeduplication extends EventEmitter {
  private anthropic: Anthropic;
  private similarityThreshold: number = 0.9;
  private embeddingsCache: Map<string, number[]> = new Map();

  constructor(apiKey?: string) {
    super();

    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * 檢測重複內容
   */
  async detectDuplicateContent(
    content1: string,
    content2: string,
    metadata1?: any,
    metadata2?: any
  ): Promise<DuplicateDetectionResult> {
    console.log('🔍 Detecting duplicate content...');

    try {
      // Quick check: exact match
      if (content1 === content2) {
        return {
          isDuplicate: true,
          similarity: 1.0,
          reason: 'Exact match',
        };
      }

      // Quick check: very different lengths
      const lengthRatio = Math.min(content1.length, content2.length) / Math.max(content1.length, content2.length);
      if (lengthRatio < 0.5) {
        return {
          isDuplicate: false,
          similarity: 0,
          reason: 'Length difference too large',
        };
      }

      // Calculate text similarity using simple methods first
      const textSimilarity = this.calculateTextSimilarity(content1, content2);

      // If text similarity is very high, consider as duplicate
      if (textSimilarity >= this.similarityThreshold) {
        return {
          isDuplicate: true,
          similarity: textSimilarity,
          reason: 'High text similarity',
        };
      }

      // If text similarity is very low, skip expensive embedding calculation
      if (textSimilarity < 0.5) {
        return {
          isDuplicate: false,
          similarity: textSimilarity,
          reason: 'Low text similarity',
        };
      }

      // Use semantic similarity for borderline cases
      const semanticSimilarity = await this.calculateSemanticSimilarity(content1, content2);

      console.log(`   Text similarity: ${textSimilarity.toFixed(2)}`);
      console.log(`   Semantic similarity: ${semanticSimilarity.toFixed(2)}`);

      const isDuplicate = semanticSimilarity >= this.similarityThreshold;

      return {
        isDuplicate,
        similarity: semanticSimilarity,
        reason: isDuplicate ? 'High semantic similarity' : 'Different content',
      };
    } catch (error) {
      console.error('❌ Duplicate detection failed:', error);

      // Fall back to text-based comparison
      const textSimilarity = this.calculateTextSimilarity(content1, content2);
      return {
        isDuplicate: textSimilarity >= this.similarityThreshold,
        similarity: textSimilarity,
        reason: 'Fallback to text similarity',
      };
    }
  }

  /**
   * 批次檢測重複內容
   */
  async detectDuplicates(
    contents: Array<{ id: string; content: string; metadata?: any }>
  ): Promise<Map<string, string>> {
    console.log(`🔍 Detecting duplicates in ${contents.length} contents...`);

    const duplicates = new Map<string, string>(); // duplicateId -> originalId
    const processed = new Set<string>();

    for (let i = 0; i < contents.length; i++) {
      if (processed.has(contents[i].id)) continue;

      for (let j = i + 1; j < contents.length; j++) {
        if (processed.has(contents[j].id)) continue;

        const result = await this.detectDuplicateContent(
          contents[i].content,
          contents[j].content,
          contents[i].metadata,
          contents[j].metadata
        );

        if (result.isDuplicate) {
          duplicates.set(contents[j].id, contents[i].id);
          processed.add(contents[j].id);
          console.log(`   ✅ Found duplicate: ${contents[j].id} -> ${contents[i].id} (${(result.similarity * 100).toFixed(1)}%)`);
        }
      }

      processed.add(contents[i].id);
    }

    console.log(`✅ Found ${duplicates.size} duplicates`);

    return duplicates;
  }

  /**
   * 合併相關章節
   */
  mergeRelatedSections(
    sections: ManualSection[],
    duplicateMap?: Map<string, string>
  ): MergedSection[] {
    console.log(`🔀 Merging ${sections.length} related sections...`);

    const merged: MergedSection[] = [];
    const processed = new Set<string>();

    // Group sections by their original (non-duplicate) ID
    const groups = new Map<string, ManualSection[]>();

    sections.forEach((section) => {
      const originalId = duplicateMap?.get(section.id) || section.id;

      if (!groups.has(originalId)) {
        groups.set(originalId, []);
      }

      groups.get(originalId)!.push(section);
    });

    // Merge each group
    groups.forEach((group, originalId) => {
      if (group.length === 1) {
        // No duplicates, keep as is
        merged.push({
          id: group[0].id,
          title: group[0].title,
          content: group[0].content,
          alternativePaths: [],
          mergedFrom: [group[0].id],
        });
      } else {
        // Multiple sections, merge them
        const primary = group[0];
        const alternatives = group.slice(1);

        const mergedSection: MergedSection = {
          id: primary.id,
          title: primary.title,
          content: this.mergeSectionContent(group),
          alternativePaths: alternatives.map((alt) => ({
            name: alt.title,
            description: `此功能也可從${alt.metadata?.url || '其他頁面'}存取`,
            url: alt.metadata?.url || '',
          })),
          mergedFrom: group.map((s) => s.id),
        };

        merged.push(mergedSection);

        console.log(`   ✅ Merged ${group.length} sections into: ${primary.title}`);
      }
    });

    console.log(`✅ Created ${merged.length} merged sections`);

    return merged;
  }

  /**
   * 優化內容層級
   */
  optimizeContentHierarchy(sections: ManualSection[], title?: string): OptimizedManual {
    console.log('🏗️ Optimizing content hierarchy...');

    // Adjust section levels
    const adjustedSections = this.adjustSectionLevels(sections);

    // Generate table of contents
    const toc = this.generateTableOfContents(adjustedSections);

    // Calculate max depth
    const maxDepth = this.calculateMaxDepth(adjustedSections);

    const optimized: OptimizedManual = {
      title: title || 'User Manual',
      toc,
      sections: adjustedSections,
      metadata: {
        totalSections: this.countAllSections(adjustedSections),
        maxDepth,
        optimizedAt: new Date(),
      },
    };

    console.log(`✅ Optimized manual with ${optimized.metadata.totalSections} sections (max depth: ${maxDepth})`);

    return optimized;
  }

  /**
   * 生成目錄
   */
  generateTableOfContents(sections: ManualSection[]): TableOfContents {
    console.log('📑 Generating table of contents...');

    const items = sections.map((section) => this.sectionToTOCItem(section));

    return { items };
  }

  /**
   * 計算文字相似度（基於字元重疊）
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    // Normalize texts
    const norm1 = this.normalizeText(text1);
    const norm2 = this.normalizeText(text2);

    // Use Jaccard similarity on character n-grams
    const ngrams1 = this.generateNGrams(norm1, 3);
    const ngrams2 = this.generateNGrams(norm2, 3);

    const intersection = new Set([...ngrams1].filter((x) => ngrams2.has(x)));
    const union = new Set([...ngrams1, ...ngrams2]);

    return intersection.size / union.size;
  }

  /**
   * 計算語義相似度（使用 Claude API）
   */
  private async calculateSemanticSimilarity(text1: string, text2: string): Promise<number> {
    try {
      // Use Claude to compare semantic similarity
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `Compare the semantic similarity of these two texts and respond ONLY with a number between 0 and 1 (e.g., "0.85"), where 1 means identical meaning and 0 means completely different.

Text 1:
${text1.substring(0, 500)}

Text 2:
${text2.substring(0, 500)}

Similarity score:`,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent && 'text' in textContent ? textContent.text : '';

      // Extract number from response
      const match = responseText.match(/0?\.\d+|[01](?:\.\d+)?/);
      if (match) {
        return parseFloat(match[0]);
      }

      // Fallback to text similarity
      return this.calculateTextSimilarity(text1, text2);
    } catch (error) {
      console.warn('⚠️ Semantic similarity calculation failed, using text similarity');
      return this.calculateTextSimilarity(text1, text2);
    }
  }

  /**
   * 標準化文字
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
      .trim();
  }

  /**
   * 生成 N-grams
   */
  private generateNGrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();

    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.substring(i, i + n));
    }

    return ngrams;
  }

  /**
   * 合併章節內容
   */
  private mergeSectionContent(sections: ManualSection[]): string {
    if (sections.length === 1) {
      return sections[0].content;
    }

    // Use primary section's content as base
    let merged = sections[0].content;

    // Add note about alternative paths
    if (sections.length > 1) {
      merged += '\n\n---\n\n';
      merged += '## 其他存取方式\n\n';
      merged += '此功能可透過以下方式存取：\n\n';

      sections.slice(1).forEach((section, index) => {
        merged += `${index + 1}. **${section.title}** - ${section.metadata?.url || '其他頁面'}\n`;
      });
    }

    return merged;
  }

  /**
   * 調整章節層級
   */
  private adjustSectionLevels(sections: ManualSection[], baseLevel: number = 1): ManualSection[] {
    return sections.map((section) => {
      const adjusted = { ...section };
      adjusted.level = baseLevel;

      if (section.subsections.length > 0) {
        adjusted.subsections = this.adjustSectionLevels(section.subsections, baseLevel + 1);
      }

      return adjusted;
    });
  }

  /**
   * 轉換章節為目錄項目
   */
  private sectionToTOCItem(section: ManualSection): TOCItem {
    const anchor = this.generateAnchor(section.title);

    return {
      id: section.id,
      level: section.level,
      title: section.title,
      anchor,
      children: section.subsections.map((s) => this.sectionToTOCItem(s)),
    };
  }

  /**
   * 生成錨點
   */
  private generateAnchor(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '');
  }

  /**
   * 計算最大深度
   */
  private calculateMaxDepth(sections: ManualSection[]): number {
    if (sections.length === 0) return 0;

    let maxDepth = 1;

    sections.forEach((section) => {
      if (section.subsections.length > 0) {
        const subsectionDepth = this.calculateMaxDepth(section.subsections) + 1;
        maxDepth = Math.max(maxDepth, subsectionDepth);
      }
    });

    return maxDepth;
  }

  /**
   * 計算所有章節數量
   */
  private countAllSections(sections: ManualSection[]): number {
    let count = sections.length;

    sections.forEach((section) => {
      if (section.subsections.length > 0) {
        count += this.countAllSections(section.subsections);
      }
    });

    return count;
  }

  /**
   * 設定相似度閾值
   */
  setSimilarityThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }

    this.similarityThreshold = threshold;
    console.log(`✅ Similarity threshold set to ${threshold}`);
  }

  /**
   * 取得相似度閾值
   */
  getSimilarityThreshold(): number {
    return this.similarityThreshold;
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.embeddingsCache.clear();
    console.log('✅ Embeddings cache cleared');
  }

  /**
   * 格式化為 Markdown
   */
  toMarkdown(manual: OptimizedManual): string {
    let markdown = `# ${manual.title}\n\n`;

    // Table of contents
    markdown += '## 目錄\n\n';
    markdown += this.tocToMarkdown(manual.toc.items);
    markdown += '\n---\n\n';

    // Sections
    manual.sections.forEach((section) => {
      markdown += this.sectionToMarkdown(section);
    });

    return markdown;
  }

  /**
   * 目錄轉 Markdown
   */
  private tocToMarkdown(items: TOCItem[], indent: number = 0): string {
    let markdown = '';

    items.forEach((item) => {
      const indentation = '  '.repeat(indent);
      markdown += `${indentation}- [${item.title}](#${item.anchor})\n`;

      if (item.children.length > 0) {
        markdown += this.tocToMarkdown(item.children, indent + 1);
      }
    });

    return markdown;
  }

  /**
   * 章節轉 Markdown
   */
  private sectionToMarkdown(section: ManualSection): string {
    const hashes = '#'.repeat(section.level);
    let markdown = `${hashes} ${section.title}\n\n`;
    markdown += `${section.content}\n\n`;

    section.subsections.forEach((subsection) => {
      markdown += this.sectionToMarkdown(subsection);
    });

    return markdown;
  }
}
