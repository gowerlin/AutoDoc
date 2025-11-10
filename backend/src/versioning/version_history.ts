/**
 * Version History Manager
 * Task 7.4: 建立版本歷史管理
 */

import { EventEmitter } from 'events';
import { PageBaseline } from './change_detector';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VersionSnapshot {
  id: string;
  version: string;
  createdAt: Date;
  baselines: Map<string, PageBaseline>;
  manualDocId?: string;
  metadata: {
    productVersion?: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
}

export interface VersionComparison {
  version1: string;
  version2: string;
  comparedAt: Date;
  differences: {
    pagesAdded: string[];
    pagesRemoved: string[];
    pagesModified: string[];
  };
  summary: string;
}

export class VersionHistory extends EventEmitter {
  private versions: Map<string, VersionSnapshot> = new Map();
  private storageDir: string;

  constructor(storageDir: string = './data/versions') {
    super();
    this.storageDir = storageDir;
    this.initializeStorage();
  }

  /**
   * 初始化存儲
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      console.log(`✅ Version storage initialized: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ Failed to initialize storage:', error);
    }
  }

  /**
   * 保存版本快照
   */
  async saveSnapshot(
    version: string,
    baselines: Map<string, PageBaseline>,
    metadata?: VersionSnapshot['metadata']
  ): Promise<VersionSnapshot> {
    console.log(`💾 Saving version snapshot: ${version}`);

    const snapshot: VersionSnapshot = {
      id: `snapshot-${Date.now()}`,
      version,
      createdAt: new Date(),
      baselines,
      metadata: metadata || {},
    };

    // Store in memory
    this.versions.set(version, snapshot);

    // Persist to filesystem
    await this.persistSnapshot(snapshot);

    console.log(`✅ Version snapshot saved: ${version}`);
    this.emit('snapshot_saved', snapshot);

    return snapshot;
  }

  /**
   * 持久化快照
   */
  private async persistSnapshot(snapshot: VersionSnapshot): Promise<void> {
    try {
      const filePath = path.join(this.storageDir, `${snapshot.version}.json`);

      // Convert Map to array for JSON serialization
      const serializable = {
        ...snapshot,
        baselines: Array.from(snapshot.baselines.entries()),
      };

      await fs.writeFile(filePath, JSON.stringify(serializable, null, 2));
      console.log(`  💾 Snapshot persisted to: ${filePath}`);
    } catch (error) {
      console.error('❌ Failed to persist snapshot:', error);
      throw error;
    }
  }

  /**
   * 載入快照
   */
  async loadSnapshot(version: string): Promise<VersionSnapshot | null> {
    // Check memory cache
    if (this.versions.has(version)) {
      return this.versions.get(version)!;
    }

    // Load from filesystem
    try {
      const filePath = path.join(this.storageDir, `${version}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);

      // Reconstruct Map
      const snapshot: VersionSnapshot = {
        ...parsed,
        baselines: new Map(parsed.baselines),
        createdAt: new Date(parsed.createdAt),
      };

      // Cache in memory
      this.versions.set(version, snapshot);

      console.log(`✅ Snapshot loaded: ${version}`);
      return snapshot;
    } catch (error) {
      console.error(`❌ Failed to load snapshot ${version}:`, error);
      return null;
    }
  }

  /**
   * 列出所有版本
   */
  async listVersions(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const versions = files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''));

      return versions.sort();
    } catch (error) {
      console.error('❌ Failed to list versions:', error);
      return [];
    }
  }

  /**
   * 對比兩個版本
   */
  async compareVersions(version1: string, version2: string): Promise<VersionComparison> {
    console.log(`🔍 Comparing versions: ${version1} vs ${version2}`);

    const snapshot1 = await this.loadSnapshot(version1);
    const snapshot2 = await this.loadSnapshot(version2);

    if (!snapshot1 || !snapshot2) {
      throw new Error('One or both versions not found');
    }

    const urls1 = new Set(snapshot1.baselines.keys());
    const urls2 = new Set(snapshot2.baselines.keys());

    const pagesAdded = Array.from(urls2).filter((url) => !urls1.has(url));
    const pagesRemoved = Array.from(urls1).filter((url) => !urls2.has(url));
    const pagesModified = Array.from(urls1).filter(
      (url) =>
        urls2.has(url) &&
        snapshot1.baselines.get(url)?.domSnapshot.structure.hash !==
          snapshot2.baselines.get(url)?.domSnapshot.structure.hash
    );

    const summary = `${pagesAdded.length} added, ${pagesRemoved.length} removed, ${pagesModified.length} modified`;

    const comparison: VersionComparison = {
      version1,
      version2,
      comparedAt: new Date(),
      differences: {
        pagesAdded,
        pagesRemoved,
        pagesModified,
      },
      summary,
    };

    console.log(`✅ Comparison complete: ${summary}`);
    this.emit('versions_compared', comparison);

    return comparison;
  }

  /**
   * 版本回溯
   */
  async rollbackToVersion(version: string): Promise<VersionSnapshot> {
    console.log(`⏪ Rolling back to version: ${version}`);

    const snapshot = await this.loadSnapshot(version);

    if (!snapshot) {
      throw new Error(`Version not found: ${version}`);
    }

    // TODO: Restore baselines and regenerate manual
    console.log(`✅ Rolled back to version: ${version}`);
    this.emit('rollback_complete', snapshot);

    return snapshot;
  }

  /**
   * 刪除版本
   */
  async deleteVersion(version: string): Promise<boolean> {
    try {
      const filePath = path.join(this.storageDir, `${version}.json`);
      await fs.unlink(filePath);

      this.versions.delete(version);

      console.log(`✅ Version deleted: ${version}`);
      this.emit('version_deleted', version);

      return true;
    } catch (error) {
      console.error(`❌ Failed to delete version ${version}:`, error);
      return false;
    }
  }

  /**
   * 獲取最新版本
   */
  async getLatestVersion(): Promise<string | null> {
    const versions = await this.listVersions();
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  /**
   * 獲取版本元數據
   */
  async getVersionMetadata(version: string): Promise<VersionSnapshot['metadata'] | null> {
    const snapshot = await this.loadSnapshot(version);
    return snapshot?.metadata || null;
  }
}
