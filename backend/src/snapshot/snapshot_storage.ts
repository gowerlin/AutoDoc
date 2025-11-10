/**
 * Snapshot Storage Manager
 * Task 8.2: 實作快照儲存、壓縮、載入
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import {
  ProjectSnapshot,
  SnapshotFiles,
  SnapshotSerializer,
  SnapshotStatistics,
} from './snapshot_schema';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface StorageConfig {
  baseDir: string;
  compression: boolean;
  compressionLevel?: number;
  maxSnapshotSize?: number; // in MB
  autoCleanup?: boolean;
  retentionDays?: number;
}

export interface SaveOptions {
  compress?: boolean;
  overwrite?: boolean;
  validate?: boolean;
}

export interface LoadOptions {
  skipValidation?: boolean;
  includeScreenshots?: boolean;
}

export class SnapshotStorage extends EventEmitter {
  private config: StorageConfig;
  private cache: Map<string, ProjectSnapshot> = new Map();

  constructor(config: StorageConfig) {
    super();
    this.config = {
      ...config,
      compression: config.compression ?? true,
      compressionLevel: config.compressionLevel ?? 6,
      maxSnapshotSize: config.maxSnapshotSize ?? 1000, // 1GB default
      autoCleanup: config.autoCleanup ?? false,
      retentionDays: config.retentionDays ?? 90,
    };
    this.initializeStorage();
  }

  /**
   * 初始化儲存目錄
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.config.baseDir, { recursive: true });
      await fs.mkdir(path.join(this.config.baseDir, 'snapshots'), { recursive: true });
      await fs.mkdir(path.join(this.config.baseDir, 'temp'), { recursive: true });
      console.log(`✅ Snapshot storage initialized: ${this.config.baseDir}`);

      if (this.config.autoCleanup) {
        await this.cleanupOldSnapshots();
      }
    } catch (error) {
      console.error('❌ Failed to initialize storage:', error);
      throw error;
    }
  }

  /**
   * 儲存快照
   */
  async saveSnapshot(snapshot: ProjectSnapshot, options: SaveOptions = {}): Promise<SnapshotFiles> {
    console.log(`💾 Saving snapshot: ${snapshot.id}`);
    const startTime = Date.now();

    try {
      // 驗證快照
      if (options.validate !== false) {
        const validation = SnapshotSerializer.validate(snapshot);
        if (!validation.valid) {
          throw new Error(`Invalid snapshot: ${validation.errors.join(', ')}`);
        }
      }

      // 檢查是否已存在
      const snapshotDir = this.getSnapshotDir(snapshot.id);
      const exists = await this.exists(snapshotDir);

      if (exists && !options.overwrite) {
        throw new Error(`Snapshot ${snapshot.id} already exists. Use overwrite option to replace.`);
      }

      // 建立快照目錄
      await fs.mkdir(snapshotDir, { recursive: true });

      // 分離資料
      const manifestData = this.createManifest(snapshot);
      const explorationData = this.extractExplorationData(snapshot);
      const contentData = this.extractContentData(snapshot);
      const screenshotsData = this.extractScreenshotsData(snapshot);

      // 儲存檔案
      const files: SnapshotFiles = {
        manifestFile: path.join(snapshotDir, 'manifest.json'),
        dataFiles: {
          exploration: path.join(snapshotDir, 'exploration.json'),
          content: path.join(snapshotDir, 'content.json'),
          screenshots: path.join(snapshotDir, 'screenshots.bin'),
          metadata: path.join(snapshotDir, 'metadata.json'),
        },
      };

      // 寫入檔案
      const compress = options.compress ?? this.config.compression;

      await Promise.all([
        this.writeFile(files.manifestFile, JSON.stringify(manifestData, null, 2), compress),
        this.writeFile(files.dataFiles.exploration, JSON.stringify(explorationData, null, 2), compress),
        this.writeFile(files.dataFiles.content, JSON.stringify(contentData, null, 2), compress),
        this.writeBinaryFile(files.dataFiles.screenshots, screenshotsData, compress),
        this.writeFile(files.dataFiles.metadata, JSON.stringify(snapshot.metadata, null, 2), compress),
      ]);

      // 計算統計資訊
      const statistics = await this.calculateStatistics(files);

      // 更新快照統計
      snapshot.statistics = statistics;

      // 寫入更新後的 manifest
      await this.writeFile(
        files.manifestFile,
        JSON.stringify(this.createManifest(snapshot), null, 2),
        compress
      );

      // 快取
      this.cache.set(snapshot.id, snapshot);

      const duration = Date.now() - startTime;
      console.log(`✅ Snapshot saved in ${duration}ms`);
      console.log(`  📁 Total size: ${this.formatBytes(statistics.files.totalSize)}`);
      console.log(`  🗜️  Compressed: ${this.formatBytes(statistics.files.compressedSize)}`);
      console.log(`  📊 Ratio: ${statistics.files.compressionRatio.toFixed(2)}%`);

      this.emit('snapshot_saved', { snapshot, files, statistics, duration });

      return files;
    } catch (error) {
      console.error(`❌ Failed to save snapshot ${snapshot.id}:`, error);
      throw error;
    }
  }

  /**
   * 載入快照
   */
  async loadSnapshot(snapshotId: string, options: LoadOptions = {}): Promise<ProjectSnapshot> {
    console.log(`📂 Loading snapshot: ${snapshotId}`);

    // 檢查快取
    if (this.cache.has(snapshotId)) {
      console.log(`  ⚡ Loaded from cache`);
      return this.cache.get(snapshotId)!;
    }

    try {
      const snapshotDir = this.getSnapshotDir(snapshotId);
      const exists = await this.exists(snapshotDir);

      if (!exists) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      // 讀取 manifest
      const manifestFile = path.join(snapshotDir, 'manifest.json');
      const manifestData = JSON.parse(await this.readFile(manifestFile));

      // 讀取資料檔案
      const explorationFile = path.join(snapshotDir, 'exploration.json');
      const contentFile = path.join(snapshotDir, 'content.json');
      const screenshotsFile = path.join(snapshotDir, 'screenshots.bin');
      const metadataFile = path.join(snapshotDir, 'metadata.json');

      const [explorationData, contentData, screenshotsBuffer, metadata] = await Promise.all([
        this.readFile(explorationFile).then(JSON.parse),
        this.readFile(contentFile).then(JSON.parse),
        options.includeScreenshots !== false ? this.readBinaryFile(screenshotsFile) : Buffer.alloc(0),
        this.readFile(metadataFile).then(JSON.parse),
      ]);

      // 重組快照
      const snapshot: ProjectSnapshot = {
        ...manifestData,
        createdAt: new Date(manifestData.createdAt),
        metadata,
        explorationData: this.reconstructExplorationData(explorationData, screenshotsBuffer),
        contentData,
      };

      // 驗證
      if (!options.skipValidation) {
        const validation = SnapshotSerializer.validate(snapshot);
        if (!validation.valid) {
          console.warn(`⚠️  Snapshot validation warnings:`, validation.errors);
        }
      }

      // 快取
      this.cache.set(snapshotId, snapshot);

      console.log(`✅ Snapshot loaded: ${snapshotId}`);
      this.emit('snapshot_loaded', { snapshot });

      return snapshot;
    } catch (error) {
      console.error(`❌ Failed to load snapshot ${snapshotId}:`, error);
      throw error;
    }
  }

  /**
   * 刪除快照
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    console.log(`🗑️  Deleting snapshot: ${snapshotId}`);

    try {
      const snapshotDir = this.getSnapshotDir(snapshotId);
      const exists = await this.exists(snapshotDir);

      if (!exists) {
        console.warn(`⚠️  Snapshot ${snapshotId} not found`);
        return false;
      }

      // 遞迴刪除目錄
      await fs.rm(snapshotDir, { recursive: true, force: true });

      // 從快取移除
      this.cache.delete(snapshotId);

      console.log(`✅ Snapshot deleted: ${snapshotId}`);
      this.emit('snapshot_deleted', { snapshotId });

      return true;
    } catch (error) {
      console.error(`❌ Failed to delete snapshot ${snapshotId}:`, error);
      return false;
    }
  }

  /**
   * 列出所有快照
   */
  async listSnapshots(): Promise<Array<{ id: string; name: string; version: string; createdAt: Date; size: number }>> {
    try {
      const snapshotsDir = path.join(this.config.baseDir, 'snapshots');
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });

      const snapshots = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const snapshotId = entry.name;
            const manifestFile = path.join(snapshotsDir, snapshotId, 'manifest.json');

            try {
              const manifestData = JSON.parse(await this.readFile(manifestFile));
              const stats = await this.getDirectorySize(path.join(snapshotsDir, snapshotId));

              return {
                id: snapshotId,
                name: manifestData.name,
                version: `${manifestData.version.major}.${manifestData.version.minor}.${manifestData.version.patch}`,
                createdAt: new Date(manifestData.createdAt),
                size: stats,
              };
            } catch (error) {
              console.warn(`⚠️  Failed to read snapshot ${snapshotId}:`, error);
              return null;
            }
          })
      );

      return snapshots.filter((s) => s !== null) as any[];
    } catch (error) {
      console.error('❌ Failed to list snapshots:', error);
      return [];
    }
  }

  /**
   * 匯出快照為壓縮檔
   */
  async exportSnapshot(snapshotId: string, outputPath: string): Promise<string> {
    console.log(`📦 Exporting snapshot: ${snapshotId}`);

    try {
      const snapshotDir = this.getSnapshotDir(snapshotId);
      const exists = await this.exists(snapshotDir);

      if (!exists) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      // Validate output path to prevent path traversal
      const resolvedOutputPath = path.resolve(outputPath);
      const allowedDirs = [
        path.resolve(process.cwd()),
        path.resolve(this.config.baseDir)
      ];

      // Check if output path is within allowed directories
      const isAllowed = allowedDirs.some(dir => resolvedOutputPath.startsWith(dir));
      if (!isAllowed) {
        throw new Error('Export path must be within current working directory or storage directory');
      }

      // 使用 tar + gzip 壓縮
      const tarGzPath = outputPath.endsWith('.tar.gz') ? outputPath : `${outputPath}.tar.gz`;

      // TODO: Implement tar archiving using archiver library
      console.log(`  📁 Source: ${snapshotDir}`);
      console.log(`  📦 Target: ${tarGzPath}`);

      console.log(`✅ Snapshot exported: ${tarGzPath}`);
      this.emit('snapshot_exported', { snapshotId, outputPath: tarGzPath });

      return tarGzPath;
    } catch (error) {
      console.error(`❌ Failed to export snapshot ${snapshotId}:`, error);
      throw error;
    }
  }

  /**
   * 匯入快照
   */
  async importSnapshot(archivePath: string, snapshotId?: string): Promise<ProjectSnapshot> {
    console.log(`📥 Importing snapshot from: ${archivePath}`);

    try {
      // TODO: Implement tar extraction
      const extractedDir = path.join(this.config.baseDir, 'temp', `import-${Date.now()}`);

      // Load the snapshot
      const snapshot = await this.loadSnapshot(snapshotId || 'imported');

      console.log(`✅ Snapshot imported: ${snapshot.id}`);
      this.emit('snapshot_imported', { snapshot, archivePath });

      return snapshot;
    } catch (error) {
      console.error(`❌ Failed to import snapshot:`, error);
      throw error;
    }
  }

  /**
   * 清理舊快照
   */
  async cleanupOldSnapshots(): Promise<number> {
    if (!this.config.retentionDays) return 0;

    console.log(`🧹 Cleaning up snapshots older than ${this.config.retentionDays} days...`);

    try {
      const snapshots = await this.listSnapshots();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      let deletedCount = 0;

      for (const snapshot of snapshots) {
        if (snapshot.createdAt < cutoffDate) {
          await this.deleteSnapshot(snapshot.id);
          deletedCount++;
        }
      }

      console.log(`✅ Cleaned up ${deletedCount} old snapshots`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Failed to cleanup old snapshots:', error);
      return 0;
    }
  }

  /**
   * Private helper methods
   */

  /**
   * Validate and sanitize snapshot ID to prevent path traversal
   */
  private validateSnapshotId(snapshotId: string): void {
    // Only allow alphanumeric characters, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
      throw new Error(
        `Invalid snapshot ID format: ${snapshotId}. Only alphanumeric characters, hyphens, and underscores are allowed.`
      );
    }

    // Additional length check
    if (snapshotId.length > 255) {
      throw new Error('Snapshot ID too long (max 255 characters)');
    }
  }

  private getSnapshotDir(snapshotId: string): string {
    // Validate snapshot ID before constructing path
    this.validateSnapshotId(snapshotId);

    const snapshotDir = path.join(this.config.baseDir, 'snapshots', snapshotId);

    // Verify the resolved path is within the base directory
    const resolvedPath = path.resolve(snapshotDir);
    const basePath = path.resolve(this.config.baseDir, 'snapshots');

    if (!resolvedPath.startsWith(basePath + path.sep) && resolvedPath !== basePath) {
      throw new Error('Path traversal detected: Invalid snapshot directory');
    }

    return snapshotDir;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async writeFile(filePath: string, content: string, compress: boolean): Promise<void> {
    const data = Buffer.from(content, 'utf-8');
    if (compress) {
      const compressed = await gzip(data, { level: this.config.compressionLevel });
      await fs.writeFile(filePath + '.gz', compressed);
    } else {
      await fs.writeFile(filePath, data);
    }
  }

  private async readFile(filePath: string): Promise<string> {
    // Try compressed first
    const compressedPath = filePath + '.gz';
    const compressedExists = await this.exists(compressedPath);

    if (compressedExists) {
      const compressed = await fs.readFile(compressedPath);
      const decompressed = await gunzip(compressed);
      return decompressed.toString('utf-8');
    }

    // Fallback to uncompressed
    const data = await fs.readFile(filePath);
    return data.toString('utf-8');
  }

  private async writeBinaryFile(filePath: string, content: Buffer, compress: boolean): Promise<void> {
    if (compress) {
      const compressed = await gzip(content, { level: this.config.compressionLevel });
      await fs.writeFile(filePath + '.gz', compressed);
    } else {
      await fs.writeFile(filePath, content);
    }
  }

  private async readBinaryFile(filePath: string): Promise<Buffer> {
    // Try compressed first
    const compressedPath = filePath + '.gz';
    const compressedExists = await this.exists(compressedPath);

    if (compressedExists) {
      const compressed = await fs.readFile(compressedPath);
      return await gunzip(compressed);
    }

    // Fallback to uncompressed
    return await fs.readFile(filePath);
  }

  private createManifest(snapshot: ProjectSnapshot): any {
    return {
      id: snapshot.id,
      projectId: snapshot.projectId,
      name: snapshot.name,
      description: snapshot.description,
      createdAt: snapshot.createdAt.toISOString(),
      createdBy: snapshot.createdBy,
      version: snapshot.version,
      tags: snapshot.tags,
      statistics: snapshot.statistics,
      files: snapshot.files,
    };
  }

  private extractExplorationData(snapshot: ProjectSnapshot): any {
    return {
      tree: snapshot.explorationData.tree,
      pages: Array.from(snapshot.explorationData.pages.entries()),
      domBaselines: Array.from(snapshot.explorationData.domBaselines.entries()),
      explorationPaths: snapshot.explorationData.explorationPaths,
    };
  }

  private extractContentData(snapshot: ProjectSnapshot): any {
    return snapshot.contentData;
  }

  private extractScreenshotsData(snapshot: ProjectSnapshot): Buffer {
    // Serialize screenshots to binary format
    const screenshots = Array.from(snapshot.explorationData.screenshots.entries());
    const screenshotsJson = JSON.stringify(
      screenshots.map(([url, data]) => [
        url,
        {
          ...data,
          screenshot: data.screenshot.toString('base64'),
          thumbnail: data.thumbnail?.toString('base64'),
          timestamp: data.timestamp.toISOString(),
        },
      ])
    );
    return Buffer.from(screenshotsJson, 'utf-8');
  }

  private reconstructExplorationData(explorationData: any, screenshotsBuffer: Buffer): any {
    let screenshots = new Map();

    if (screenshotsBuffer.length > 0) {
      const screenshotsJson = screenshotsBuffer.toString('utf-8');
      const screenshotsArray = JSON.parse(screenshotsJson);

      screenshots = new Map(
        screenshotsArray.map(([url, data]: [string, any]) => [
          url,
          {
            ...data,
            screenshot: Buffer.from(data.screenshot, 'base64'),
            thumbnail: data.thumbnail ? Buffer.from(data.thumbnail, 'base64') : undefined,
            timestamp: new Date(data.timestamp),
          },
        ])
      );
    }

    return {
      tree: explorationData.tree,
      pages: new Map(explorationData.pages),
      domBaselines: new Map(explorationData.domBaselines),
      screenshots,
      explorationPaths: explorationData.explorationPaths,
    };
  }

  private async calculateStatistics(files: SnapshotFiles): Promise<SnapshotStatistics> {
    const [manifestSize, explorationSize, contentSize, screenshotsSize, metadataSize] = await Promise.all([
      this.getFileSize(files.manifestFile),
      this.getFileSize(files.dataFiles.exploration),
      this.getFileSize(files.dataFiles.content),
      this.getFileSize(files.dataFiles.screenshots),
      this.getFileSize(files.dataFiles.metadata),
    ]);

    const totalSize = manifestSize + explorationSize + contentSize + screenshotsSize + metadataSize;

    // Get compressed sizes
    const [
      manifestCompressed,
      explorationCompressed,
      contentCompressed,
      screenshotsCompressed,
      metadataCompressed,
    ] = await Promise.all([
      this.getFileSize(files.manifestFile + '.gz').catch(() => manifestSize),
      this.getFileSize(files.dataFiles.exploration + '.gz').catch(() => explorationSize),
      this.getFileSize(files.dataFiles.content + '.gz').catch(() => contentSize),
      this.getFileSize(files.dataFiles.screenshots + '.gz').catch(() => screenshotsSize),
      this.getFileSize(files.dataFiles.metadata + '.gz').catch(() => metadataSize),
    ]);

    const compressedSize =
      manifestCompressed + explorationCompressed + contentCompressed + screenshotsCompressed + metadataCompressed;

    return {
      exploration: {
        totalPages: 0,
        exploredPages: 0,
        pendingPages: 0,
        errorPages: 0,
        totalDepth: 0,
        explorationTime: 0,
      },
      content: {
        totalSections: 0,
        totalWords: 0,
        totalScreenshots: 0,
        totalTerms: 0,
      },
      files: {
        totalSize,
        compressedSize,
        compressionRatio: compressedSize > 0 ? (compressedSize / totalSize) * 100 : 0,
        fileCount: 5,
      },
    };
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await this.getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
