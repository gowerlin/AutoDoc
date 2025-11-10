/**
 * Terminology Manager
 * Task 4.4: 建立專業術語管理
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';

export interface Term {
  id: string;
  term: string;
  definition: string;
  category?: string;
  synonyms: string[];
  translations?: {
    [locale: string]: string;
  };
  usage?: {
    context: string;
    example: string;
  };
  firstSeen?: Date;
  frequency?: number;
}

export interface TerminologyDatabase {
  terms: Map<string, Term>;
  synonymMap: Map<string, string>; // synonym -> preferred term
  categories: Set<string>;
  metadata: {
    totalTerms: number;
    lastUpdated: Date;
  };
}

export interface ConsistencyIssue {
  type: 'inconsistent_synonym' | 'mixed_terminology' | 'undefined_term';
  term: string;
  preferredTerm?: string;
  locations: Array<{
    section: string;
    context: string;
  }>;
  severity: 'low' | 'medium' | 'high';
}

export interface ConsistencyReport {
  issues: ConsistencyIssue[];
  fixedCount: number;
  totalChecks: number;
  score: number; // 0-100
}

export interface Glossary {
  title: string;
  categories: Array<{
    name: string;
    terms: Term[];
  }>;
  metadata: {
    totalTerms: number;
    generatedAt: Date;
  };
}

export class TerminologyManager extends EventEmitter {
  private anthropic: Anthropic;
  private database: TerminologyDatabase;
  private stopWords: Set<string>;

  constructor(apiKey?: string) {
    super();

    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });

    this.database = {
      terms: new Map(),
      synonymMap: new Map(),
      categories: new Set(),
      metadata: {
        totalTerms: 0,
        lastUpdated: new Date(),
      },
    };

    // Common stop words to exclude from terminology
    this.stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      '的',
      '是',
      '在',
      '和',
      '與',
      '或',
      '了',
      '著',
      '將',
      '會',
    ]);
  }

  /**
   * 提取專業術語
   */
  async extractTerminology(content: string, options?: {
    useAI?: boolean;
    minFrequency?: number;
    categories?: string[];
  }): Promise<Term[]> {
    console.log('🔍 Extracting terminology from content...');

    const useAI = options?.useAI !== false;
    const minFrequency = options?.minFrequency || 2;

    let extractedTerms: Term[] = [];

    if (useAI) {
      // Use Claude to extract terminology
      extractedTerms = await this.extractTerminologyWithAI(content);
    } else {
      // Use rule-based extraction
      extractedTerms = this.extractTerminologyRuleBased(content);
    }

    // Filter by frequency
    extractedTerms = extractedTerms.filter((term) => (term.frequency || 0) >= minFrequency);

    // Add to database
    extractedTerms.forEach((term) => {
      this.addTerm(term);
    });

    console.log(`✅ Extracted ${extractedTerms.length} terms`);

    this.emit('terminology_extracted', extractedTerms);

    return extractedTerms;
  }

  /**
   * 使用 AI 提取術語
   */
  private async extractTerminologyWithAI(content: string): Promise<Term[]> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `分析以下文件並提取所有專業術語（產品特定的專有名詞、技術術語、業務概念等）。

對每個術語提供：
1. 術語名稱
2. 定義（簡短說明）
3. 類別（技術、業務、產品功能等）
4. 同義詞（如果有）

請以 JSON 格式回應：
{
  "terms": [
    {
      "term": "術語名稱",
      "definition": "定義說明",
      "category": "類別",
      "synonyms": ["同義詞1", "同義詞2"]
    }
  ]
}

文件內容：
${content.substring(0, 3000)}`,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent && 'text' in textContent ? textContent.text : '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return parsed.terms.map((t: any) => ({
          id: this.generateTermId(t.term),
          term: t.term,
          definition: t.definition || '',
          category: t.category,
          synonyms: t.synonyms || [],
          firstSeen: new Date(),
          frequency: this.countOccurrences(content, t.term),
        }));
      }

      // Fallback to rule-based
      return this.extractTerminologyRuleBased(content);
    } catch (error) {
      console.warn('⚠️ AI extraction failed, using rule-based extraction');
      return this.extractTerminologyRuleBased(content);
    }
  }

  /**
   * 基於規則提取術語
   */
  private extractTerminologyRuleBased(content: string): Term[] {
    const terms: Term[] = [];
    const termCounts = new Map<string, number>();

    // Extract capitalized phrases (likely product names or proper nouns)
    const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match;
    while ((match = capitalizedPattern.exec(content)) !== null) {
      const term = match[1];
      if (!this.stopWords.has(term.toLowerCase())) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }
    }

    // Extract quoted terms (usually important terms)
    const quotedPattern = /[「『"']([^」』"']+)[」』"']/g;
    while ((match = quotedPattern.exec(content)) !== null) {
      const term = match[1];
      if (term.length > 2 && !this.stopWords.has(term.toLowerCase())) {
        termCounts.set(term, (termCounts.get(term) || 0) + 2); // Higher weight for quoted terms
      }
    }

    // Extract Chinese technical terms (3-8 characters)
    const chineseTermPattern = /[\u4e00-\u9fa5]{3,8}/g;
    while ((match = chineseTermPattern.exec(content)) !== null) {
      const term = match[0];
      if (!this.stopWords.has(term)) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }
    }

    // Convert to Term objects
    termCounts.forEach((count, term) => {
      terms.push({
        id: this.generateTermId(term),
        term,
        definition: '',
        category: this.categorizeTerm(term),
        synonyms: [],
        firstSeen: new Date(),
        frequency: count,
      });
    });

    // Sort by frequency
    return terms.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
  }

  /**
   * 確保術語一致性
   */
  async ensureConsistency(
    content: string,
    options?: {
      autoFix?: boolean;
      checkUndefined?: boolean;
    }
  ): Promise<{
    content: string;
    report: ConsistencyReport;
  }> {
    console.log('✅ Checking terminology consistency...');

    const autoFix = options?.autoFix !== false;
    const checkUndefined = options?.checkUndefined !== false;

    const issues: ConsistencyIssue[] = [];
    let fixedContent = content;
    let fixedCount = 0;

    // Check for inconsistent synonyms
    this.database.synonymMap.forEach((preferredTerm, synonym) => {
      const pattern = new RegExp(`\\b${this.escapeRegex(synonym)}\\b`, 'gi');
      const matches = Array.from(content.matchAll(pattern));

      if (matches.length > 0) {
        issues.push({
          type: 'inconsistent_synonym',
          term: synonym,
          preferredTerm,
          locations: matches.slice(0, 5).map((m) => ({
            section: 'content',
            context: this.getContext(content, m.index || 0),
          })),
          severity: 'medium',
        });

        if (autoFix) {
          fixedContent = fixedContent.replace(pattern, preferredTerm);
          fixedCount++;
        }
      }
    });

    // Check for undefined terms (terms not in database)
    if (checkUndefined) {
      const potentialTerms = this.extractTerminologyRuleBased(content);

      potentialTerms.forEach((term) => {
        if (!this.hasTerm(term.term) && (term.frequency || 0) >= 3) {
          issues.push({
            type: 'undefined_term',
            term: term.term,
            locations: [{
              section: 'content',
              context: `Used ${term.frequency} times`,
            }],
            severity: 'low',
          });
        }
      });
    }

    const totalChecks = content.split(/\s+/).length;
    const score = Math.max(0, 100 - (issues.length * 5));

    const report: ConsistencyReport = {
      issues,
      fixedCount,
      totalChecks,
      score,
    };

    console.log(`✅ Consistency check complete: ${issues.length} issues found (score: ${score})`);

    this.emit('consistency_checked', report);

    return { content: fixedContent, report };
  }

  /**
   * 生成術語表
   */
  generateGlossary(options?: {
    sortBy?: 'alphabetical' | 'category' | 'frequency';
    includeCategories?: string[];
    minFrequency?: number;
  }): Glossary {
    console.log('📖 Generating glossary...');

    const sortBy = options?.sortBy || 'category';
    const minFrequency = options?.minFrequency || 0;

    // Filter terms
    let terms = Array.from(this.database.terms.values()).filter(
      (term) => (term.frequency || 0) >= minFrequency
    );

    if (options?.includeCategories) {
      terms = terms.filter((term) =>
        options.includeCategories!.includes(term.category || '')
      );
    }

    // Group by category
    const categorizedTerms = new Map<string, Term[]>();

    terms.forEach((term) => {
      const category = term.category || '其他';

      if (!categorizedTerms.has(category)) {
        categorizedTerms.set(category, []);
      }

      categorizedTerms.get(category)!.push(term);
    });

    // Sort terms within each category
    categorizedTerms.forEach((terms, category) => {
      switch (sortBy) {
        case 'alphabetical':
          terms.sort((a, b) => a.term.localeCompare(b.term));
          break;
        case 'frequency':
          terms.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
          break;
        default:
          // Already grouped by category
          terms.sort((a, b) => a.term.localeCompare(b.term));
      }
    });

    // Convert to glossary format
    const categories = Array.from(categorizedTerms.entries())
      .map(([name, terms]) => ({ name, terms }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const glossary: Glossary = {
      title: '術語表',
      categories,
      metadata: {
        totalTerms: terms.length,
        generatedAt: new Date(),
      },
    };

    console.log(`✅ Generated glossary with ${glossary.metadata.totalTerms} terms in ${categories.length} categories`);

    this.emit('glossary_generated', glossary);

    return glossary;
  }

  /**
   * 添加術語
   */
  addTerm(term: Term): void {
    const existingTerm = this.database.terms.get(term.id);

    if (existingTerm) {
      // Merge with existing term
      existingTerm.frequency = (existingTerm.frequency || 0) + (term.frequency || 1);
      existingTerm.synonyms = Array.from(
        new Set([...existingTerm.synonyms, ...term.synonyms])
      );
    } else {
      this.database.terms.set(term.id, term);

      if (term.category) {
        this.database.categories.add(term.category);
      }

      // Add synonyms to synonym map
      term.synonyms.forEach((synonym) => {
        this.database.synonymMap.set(synonym, term.term);
      });

      this.database.metadata.totalTerms++;
    }

    this.database.metadata.lastUpdated = new Date();
  }

  /**
   * 定義術語（添加定義）
   */
  defineTerm(termName: string, definition: string): boolean {
    const term = this.findTerm(termName);

    if (term) {
      term.definition = definition;
      console.log(`✅ Updated definition for: ${termName}`);
      return true;
    }

    console.warn(`⚠️ Term not found: ${termName}`);
    return false;
  }

  /**
   * 添加同義詞
   */
  addSynonym(termName: string, synonym: string): boolean {
    const term = this.findTerm(termName);

    if (term) {
      if (!term.synonyms.includes(synonym)) {
        term.synonyms.push(synonym);
        this.database.synonymMap.set(synonym, term.term);
        console.log(`✅ Added synonym "${synonym}" for: ${termName}`);
      }
      return true;
    }

    console.warn(`⚠️ Term not found: ${termName}`);
    return false;
  }

  /**
   * 查找術語
   */
  findTerm(termName: string): Term | undefined {
    // Check direct match
    const term = Array.from(this.database.terms.values()).find(
      (t) => t.term.toLowerCase() === termName.toLowerCase()
    );

    if (term) return term;

    // Check synonyms
    const preferredTerm = this.database.synonymMap.get(termName);
    if (preferredTerm) {
      return Array.from(this.database.terms.values()).find(
        (t) => t.term === preferredTerm
      );
    }

    return undefined;
  }

  /**
   * 檢查是否有術語
   */
  hasTerm(termName: string): boolean {
    return this.findTerm(termName) !== undefined;
  }

  /**
   * 取得所有術語
   */
  getAllTerms(): Term[] {
    return Array.from(this.database.terms.values());
  }

  /**
   * 取得術語統計
   */
  getStats(): {
    totalTerms: number;
    totalCategories: number;
    totalSynonyms: number;
    lastUpdated: Date;
  } {
    return {
      totalTerms: this.database.metadata.totalTerms,
      totalCategories: this.database.categories.size,
      totalSynonyms: this.database.synonymMap.size,
      lastUpdated: this.database.metadata.lastUpdated,
    };
  }

  /**
   * 匯出術語庫
   */
  exportDatabase(): TerminologyDatabase {
    return JSON.parse(JSON.stringify({
      ...this.database,
      terms: Array.from(this.database.terms.entries()),
      synonymMap: Array.from(this.database.synonymMap.entries()),
      categories: Array.from(this.database.categories),
    }));
  }

  /**
   * 匯入術語庫
   */
  importDatabase(data: any): void {
    this.database.terms = new Map(data.terms);
    this.database.synonymMap = new Map(data.synonymMap);
    this.database.categories = new Set(data.categories);
    this.database.metadata = data.metadata;

    console.log(`✅ Imported ${this.database.metadata.totalTerms} terms`);
  }

  /**
   * 清除術語庫
   */
  clearDatabase(): void {
    this.database.terms.clear();
    this.database.synonymMap.clear();
    this.database.categories.clear();
    this.database.metadata.totalTerms = 0;
    this.database.metadata.lastUpdated = new Date();

    console.log('✅ Database cleared');
  }

  /**
   * 格式化術語表為 Markdown
   */
  glossaryToMarkdown(glossary: Glossary): string {
    let markdown = `# ${glossary.title}\n\n`;
    markdown += `*總計 ${glossary.metadata.totalTerms} 個術語*\n\n`;
    markdown += `---\n\n`;

    glossary.categories.forEach((category) => {
      markdown += `## ${category.name}\n\n`;

      category.terms.forEach((term) => {
        markdown += `### ${term.term}\n\n`;
        markdown += `${term.definition}\n\n`;

        if (term.synonyms.length > 0) {
          markdown += `**同義詞**: ${term.synonyms.join(', ')}\n\n`;
        }

        if (term.usage) {
          markdown += `**使用範例**: ${term.usage.example}\n\n`;
        }

        markdown += `---\n\n`;
      });
    });

    return markdown;
  }

  /**
   * 輔助函數：生成術語 ID
   */
  private generateTermId(term: string): string {
    return `term-${term.toLowerCase().replace(/\s+/g, '-')}`;
  }

  /**
   * 輔助函數：分類術語
   */
  private categorizeTerm(term: string): string {
    const patterns = [
      { category: '產品功能', pattern: /功能|模組|系統|平台/ },
      { category: '技術術語', pattern: /API|SDK|URL|HTTP|JSON/ },
      { category: '業務概念', pattern: /用戶|客戶|訂單|交易|報表/ },
      { category: 'UI 元件', pattern: /按鈕|輸入框|下拉選單|對話框/ },
      { category: '操作動作', pattern: /新增|編輯|刪除|查詢|匯出/ },
    ];

    for (const { category, pattern } of patterns) {
      if (pattern.test(term)) {
        return category;
      }
    }

    return '一般術語';
  }

  /**
   * 輔助函數：計算出現次數
   */
  private countOccurrences(text: string, term: string): number {
    const pattern = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  /**
   * 輔助函數：轉義正則表達式
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 輔助函數：取得上下文
   */
  private getContext(text: string, position: number, contextLength: number = 50): string {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(text.length, position + contextLength);
    return '...' + text.substring(start, end) + '...';
  }
}
