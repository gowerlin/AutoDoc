/**
 * Google Docs Content Writer
 * Task 5.2: 實作內容寫入器
 */

import { docs_v1 } from 'googleapis';
import { GoogleDocsClient } from './google_docs_client';
import { EventEmitter } from 'events';
import * as fs from 'fs';

export type TextStyle = 'bold' | 'italic' | 'underline' | 'strikethrough';
export type HeadingLevel = 'HEADING_1' | 'HEADING_2' | 'HEADING_3' | 'HEADING_4' | 'HEADING_5' | 'HEADING_6' | 'NORMAL_TEXT';
export type ListType = 'bullet' | 'numbered';

export interface InsertTextOptions {
  suggestionMode?: boolean;
  style?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    foregroundColor?: string;
  };
}

export interface InsertImageOptions {
  caption?: string;
  width?: number;
  height?: number;
  suggestionMode?: boolean;
}

export interface TextRange {
  startIndex: number;
  endIndex: number;
}

export interface FormattingStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  foregroundColor?: string;
  backgroundColor?: string;
  link?: string;
}

export class DocsContentWriter extends EventEmitter {
  private client: GoogleDocsClient;
  private docsAPI: docs_v1.Docs;
  private driveAPI: any;

  constructor(client: GoogleDocsClient) {
    super();

    if (!client.isAuthenticated()) {
      throw new Error('GoogleDocsClient must be authenticated before creating DocsContentWriter');
    }

    this.client = client;
    this.docsAPI = client.getDocsAPI();
    this.driveAPI = client.getDriveAPI();
  }

  /**
   * 插入文字
   */
  async insertText(
    docId: string,
    text: string,
    position: number,
    options: InsertTextOptions = {}
  ): Promise<void> {
    try {
      console.log(`✍️ Inserting text at position ${position}${options.suggestionMode ? ' (suggestion mode)' : ''}...`);

      const requests: docs_v1.Schema$Request[] = [];

      // Insert text
      requests.push({
        insertText: {
          location: {
            index: position,
          },
          text,
        },
      });

      // Apply styling if provided
      if (options.style) {
        const endIndex = position + text.length;

        requests.push({
          updateTextStyle: {
            range: {
              startIndex: position,
              endIndex,
            },
            textStyle: {
              bold: options.style.bold,
              italic: options.style.italic,
              underline: options.style.underline,
              fontSize: options.style.fontSize ? { magnitude: options.style.fontSize, unit: 'PT' } : undefined,
              foregroundColor: options.style.foregroundColor ? this.parseColor(options.style.foregroundColor) : undefined,
            },
            fields: this.buildFieldMask(options.style),
          },
        });
      }

      // Execute batch update
      await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests,
          writeControl: options.suggestionMode ? { requiredRevisionId: await this.getRevisionId(docId) } : undefined,
        },
      });

      console.log(`✅ Text inserted (${text.length} characters)`);
      this.emit('text_inserted', { docId, position, length: text.length });
    } catch (error) {
      console.error('❌ Failed to insert text:', error);
      throw error;
    }
  }

  /**
   * 插入圖片
   */
  async insertImage(
    docId: string,
    imageSource: Buffer | string,
    position: number,
    options: InsertImageOptions = {}
  ): Promise<void> {
    try {
      console.log(`🖼️ Inserting image at position ${position}...`);

      let imageUrl: string;

      // Upload image to Drive if it's a Buffer
      if (Buffer.isBuffer(imageSource)) {
        imageUrl = await this.uploadImageToDrive(imageSource, `image-${Date.now()}.png`);
      } else {
        imageUrl = imageSource;
      }

      const requests: docs_v1.Schema$Request[] = [];

      // Insert image
      const insertImageRequest: docs_v1.Schema$Request = {
        insertInlineImage: {
          location: {
            index: position,
          },
          uri: imageUrl,
          objectSize: options.width || options.height ? {
            width: options.width ? { magnitude: options.width, unit: 'PT' } : undefined,
            height: options.height ? { magnitude: options.height, unit: 'PT' } : undefined,
          } : undefined,
        },
      };

      requests.push(insertImageRequest);

      // Add caption if provided
      if (options.caption) {
        // Insert caption after image (assuming image takes 1 character)
        requests.push({
          insertText: {
            location: {
              index: position + 1,
            },
            text: `\n${options.caption}\n`,
          },
        });

        // Make caption italic
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: position + 2,
              endIndex: position + 2 + options.caption.length,
            },
            textStyle: {
              italic: true,
              fontSize: { magnitude: 10, unit: 'PT' },
            },
            fields: 'italic,fontSize',
          },
        });
      }

      // Execute batch update
      await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests,
        },
      });

      console.log('✅ Image inserted');
      this.emit('image_inserted', { docId, position, imageUrl });
    } catch (error) {
      console.error('❌ Failed to insert image:', error);
      throw error;
    }
  }

  /**
   * 上傳圖片到 Drive
   */
  private async uploadImageToDrive(imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      console.log(`📤 Uploading image to Drive: ${filename}`);

      const response = await this.driveAPI.files.create({
        requestBody: {
          name: filename,
          mimeType: 'image/png',
        },
        media: {
          mimeType: 'image/png',
          body: imageBuffer,
        },
        fields: 'id,webContentLink',
      });

      const fileId = response.data.id;

      // Make file publicly accessible
      await this.driveAPI.permissions.create({
        fileId,
        requestBody: {
          type: 'anyone',
          role: 'reader',
        },
      });

      const imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

      console.log(`✅ Image uploaded: ${imageUrl}`);

      return imageUrl;
    } catch (error) {
      console.error('❌ Failed to upload image:', error);
      throw error;
    }
  }

  /**
   * 套用格式
   */
  async applyFormatting(
    docId: string,
    range: TextRange,
    style: FormattingStyle
  ): Promise<void> {
    try {
      console.log(`🎨 Applying formatting to range ${range.startIndex}-${range.endIndex}...`);

      const requests: docs_v1.Schema$Request[] = [];

      requests.push({
        updateTextStyle: {
          range: {
            startIndex: range.startIndex,
            endIndex: range.endIndex,
          },
          textStyle: {
            bold: style.bold,
            italic: style.italic,
            underline: style.underline,
            strikethrough: style.strikethrough,
            fontSize: style.fontSize ? { magnitude: style.fontSize, unit: 'PT' } : undefined,
            foregroundColor: style.foregroundColor ? this.parseColor(style.foregroundColor) : undefined,
            backgroundColor: style.backgroundColor ? this.parseColor(style.backgroundColor) : undefined,
            link: style.link ? { url: style.link } : undefined,
          },
          fields: this.buildFieldMask(style),
        },
      });

      await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests,
        },
      });

      console.log('✅ Formatting applied');
      this.emit('formatting_applied', { docId, range, style });
    } catch (error) {
      console.error('❌ Failed to apply formatting:', error);
      throw error;
    }
  }

  /**
   * 設置標題層級
   */
  async setHeadingLevel(
    docId: string,
    range: TextRange,
    level: HeadingLevel
  ): Promise<void> {
    try {
      console.log(`📑 Setting heading level ${level} for range ${range.startIndex}-${range.endIndex}...`);

      await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              updateParagraphStyle: {
                range: {
                  startIndex: range.startIndex,
                  endIndex: range.endIndex,
                },
                paragraphStyle: {
                  namedStyleType: level,
                },
                fields: 'namedStyleType',
              },
            },
          ],
        },
      });

      console.log('✅ Heading level set');
      this.emit('heading_set', { docId, range, level });
    } catch (error) {
      console.error('❌ Failed to set heading level:', error);
      throw error;
    }
  }

  /**
   * 創建列表
   */
  async createList(
    docId: string,
    range: TextRange,
    listType: ListType
  ): Promise<void> {
    try {
      console.log(`📋 Creating ${listType} list for range ${range.startIndex}-${range.endIndex}...`);

      const requests: docs_v1.Schema$Request[] = [];

      // Create bullet list
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: range.startIndex,
            endIndex: range.endIndex,
          },
          bulletPreset: listType === 'bullet' ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_ALPHA_ROMAN',
        },
      });

      await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests,
        },
      });

      console.log('✅ List created');
      this.emit('list_created', { docId, range, listType });
    } catch (error) {
      console.error('❌ Failed to create list:', error);
      throw error;
    }
  }

  /**
   * 生成目錄
   */
  async createTableOfContents(docId: string, position: number = 1): Promise<void> {
    try {
      console.log(`📑 Creating table of contents at position ${position}...`);

      // Get document to find headings
      const doc = await this.client.getDocument(docId);

      // Extract headings
      const headings: Array<{ text: string; level: string; index: number }> = [];

      if (doc.body?.content) {
        for (const element of doc.body.content) {
          if (element.paragraph && element.paragraph.paragraphStyle) {
            const style = element.paragraph.paragraphStyle.namedStyleType;

            if (style && style.startsWith('HEADING_')) {
              const text = element.paragraph.elements
                ?.map((e) => e.textRun?.content || '')
                .join('')
                .trim();

              if (text) {
                headings.push({
                  text,
                  level: style,
                  index: element.startIndex || 0,
                });
              }
            }
          }
        }
      }

      console.log(`  Found ${headings.length} headings`);

      if (headings.length === 0) {
        console.warn('⚠️ No headings found in document');
        return;
      }

      // Build TOC text
      let tocText = '目錄\n\n';

      headings.forEach((heading) => {
        const level = parseInt(heading.level.replace('HEADING_', ''));
        const indent = '  '.repeat(level - 1);
        tocText += `${indent}${heading.text}\n`;
      });

      tocText += '\n---\n\n';

      // Insert TOC
      await this.insertText(docId, tocText, position);

      // Make "目錄" bold
      await this.applyFormatting(
        docId,
        { startIndex: position, endIndex: position + 2 },
        { bold: true, fontSize: 16 }
      );

      console.log('✅ Table of contents created');
      this.emit('toc_created', { docId, position, headingCount: headings.length });
    } catch (error) {
      console.error('❌ Failed to create table of contents:', error);
      throw error;
    }
  }

  /**
   * 插入分隔線
   */
  async insertHorizontalRule(docId: string, position: number): Promise<void> {
    try {
      await this.docsAPI.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: position },
                text: '\n─────────────────────────────────────────\n',
              },
            },
          ],
        },
      });

      console.log('✅ Horizontal rule inserted');
    } catch (error) {
      console.error('❌ Failed to insert horizontal rule:', error);
      throw error;
    }
  }

  /**
   * 取得文檔內容
   */
  async getDocumentContent(docId: string): Promise<string> {
    try {
      const doc = await this.client.getDocument(docId);

      let content = '';

      if (doc.body?.content) {
        for (const element of doc.body.content) {
          if (element.paragraph) {
            const text = element.paragraph.elements
              ?.map((e) => e.textRun?.content || '')
              .join('');

            if (text) {
              content += text;
            }
          }
        }
      }

      return content;
    } catch (error) {
      console.error('❌ Failed to get document content:', error);
      throw error;
    }
  }

  /**
   * 取得文檔結束位置
   */
  async getEndIndex(docId: string): Promise<number> {
    try {
      const doc = await this.client.getDocument(docId);

      if (doc.body?.content && doc.body.content.length > 0) {
        const lastElement = doc.body.content[doc.body.content.length - 1];
        return lastElement.endIndex || 1;
      }

      return 1;
    } catch (error) {
      console.error('❌ Failed to get end index:', error);
      throw error;
    }
  }

  /**
   * 清除所有內容
   */
  async clearDocument(docId: string): Promise<void> {
    try {
      console.log(`🗑️ Clearing document ${docId}...`);

      const endIndex = await this.getEndIndex(docId);

      if (endIndex > 1) {
        await this.docsAPI.documents.batchUpdate({
          documentId: docId,
          requestBody: {
            requests: [
              {
                deleteContentRange: {
                  range: {
                    startIndex: 1,
                    endIndex: endIndex - 1,
                  },
                },
              },
            ],
          },
        });
      }

      console.log('✅ Document cleared');
      this.emit('document_cleared', docId);
    } catch (error) {
      console.error('❌ Failed to clear document:', error);
      throw error;
    }
  }

  /**
   * 輔助函數：解析顏色
   */
  private parseColor(color: string): docs_v1.Schema$OptionalColor {
    // Support hex colors (#RRGGBB)
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

    // Support named colors
    const namedColors: { [key: string]: { r: number; g: number; b: number } } = {
      black: { r: 0, g: 0, b: 0 },
      white: { r: 1, g: 1, b: 1 },
      red: { r: 1, g: 0, b: 0 },
      green: { r: 0, g: 1, b: 0 },
      blue: { r: 0, g: 0, b: 1 },
      yellow: { r: 1, g: 1, b: 0 },
      cyan: { r: 0, g: 1, b: 1 },
      magenta: { r: 1, g: 0, b: 1 },
    };

    const namedColor = namedColors[color.toLowerCase()];
    if (namedColor) {
      return {
        color: {
          rgbColor: { red: namedColor.r, green: namedColor.g, blue: namedColor.b },
        },
      };
    }

    // Default to black
    return {
      color: {
        rgbColor: { red: 0, green: 0, blue: 0 },
      },
    };
  }

  /**
   * 輔助函數：建立欄位遮罩
   */
  private buildFieldMask(style: any): string {
    const fields: string[] = [];

    if (style.bold !== undefined) fields.push('bold');
    if (style.italic !== undefined) fields.push('italic');
    if (style.underline !== undefined) fields.push('underline');
    if (style.strikethrough !== undefined) fields.push('strikethrough');
    if (style.fontSize !== undefined) fields.push('fontSize');
    if (style.foregroundColor !== undefined) fields.push('foregroundColor');
    if (style.backgroundColor !== undefined) fields.push('backgroundColor');
    if (style.link !== undefined) fields.push('link');

    return fields.join(',');
  }

  /**
   * 輔助函數：取得版本 ID
   */
  private async getRevisionId(docId: string): Promise<string> {
    const doc = await this.client.getDocument(docId);
    return doc.revisionId || '';
  }
}
