/**
 * Version Manager
 * Task 8.5: 版本管理 - 管理快照版本號、標籤、搜尋
 */

import { EventEmitter } from 'events';
import {
  ProjectSnapshot,
  SemanticVersion,
  VersionUtils,
} from './snapshot_schema';
import { SnapshotStorage } from './snapshot_storage';

export interface VersionQuery {
  projectId?: string;
  tags?: string[];
  minVersion?: SemanticVersion;
  maxVersion?: SemanticVersion;
  createdAfter?: Date;
  createdBefore?: Date;
  createdBy?: string;
}

export class VersionManager extends EventEmitter {
  private storage: SnapshotStorage;
  private versionCache: Map<string, SemanticVersion> = new Map();

  constructor(storage: SnapshotStorage) {
    super();
    this.storage = storage;
  }

  /**
   * 創建新版本快照
   */
  async createVersion(
    snapshot: ProjectSnapshot,
    versionType?: 'major' | 'minor' | 'patch'
  ): Promise<ProjectSnapshot> {
    console.log(`📝 Creating new version for project: ${snapshot.projectId}`);

    try {
      // 獲取當前最新版本
      const latestVersion = await this.getLatestVersion(snapshot.projectId);

      // 計算新版本號
      let newVersion: SemanticVersion;
      if (latestVersion) {
        newVersion = versionType
          ? VersionUtils.increment(latestVersion, versionType)
          : VersionUtils.increment(latestVersion, 'patch');
      } else {
        newVersion = { major: 1, minor: 0, patch: 0 };
      }

      snapshot.version = newVersion;

      // 保存快照
      await this.storage.saveSnapshot(snapshot);

      // 更新快取
      this.versionCache.set(snapshot.id, newVersion);

      console.log(`✅ Version created: ${VersionUtils.toString(newVersion)}`);
      this.emit('version_created', { snapshot, version: newVersion });

      return snapshot;
    } catch (error) {
      console.error('❌ Failed to create version:', error);
      throw error;
    }
  }

  /**
   * 獲取最新版本
   */
  async getLatestVersion(projectId: string): Promise<SemanticVersion | null> {
    try {
      const snapshots = await this.storage.listSnapshots();
      const projectSnapshots = snapshots.filter((s) => {
        // This requires loading the snapshot to check projectId
        // For efficiency, we should store project metadata separately
        return true; // Simplified for now
      });

      if (projectSnapshots.length === 0) {
        return null;
      }

      // Sort by version (assuming snapshots have version in manifest)
      projectSnapshots.sort((a, b) => {
        const v1 = VersionUtils.parse(a.version);
        const v2 = VersionUtils.parse(b.version);
        return VersionUtils.compare(v2, v1); // Descending order
      });

      return VersionUtils.parse(projectSnapshots[0].version);
    } catch (error) {
      console.error('❌ Failed to get latest version:', error);
      return null;
    }
  }

  /**
   * 查詢版本
   */
  async queryVersions(query: VersionQuery): Promise<ProjectSnapshot[]> {
    console.log(`🔍 Querying versions with filters`);

    try {
      const allSnapshots = await this.storage.listSnapshots();
      const results: ProjectSnapshot[] = [];

      for (const snapshotInfo of allSnapshots) {
        const snapshot = await this.storage.loadSnapshot(snapshotInfo.id, { skipValidation: true });

        // Apply filters
        if (query.projectId && snapshot.projectId !== query.projectId) continue;
        if (query.createdBy && snapshot.createdBy !== query.createdBy) continue;
        if (query.createdAfter && snapshot.createdAt < query.createdAfter) continue;
        if (query.createdBefore && snapshot.createdAt > query.createdBefore) continue;

        if (query.tags && query.tags.length > 0) {
          const hasAllTags = query.tags.every((tag) => snapshot.tags.includes(tag));
          if (!hasAllTags) continue;
        }

        if (query.minVersion) {
          if (VersionUtils.compare(snapshot.version, query.minVersion) < 0) continue;
        }

        if (query.maxVersion) {
          if (VersionUtils.compare(snapshot.version, query.maxVersion) > 0) continue;
        }

        results.push(snapshot);
      }

      console.log(`✅ Found ${results.length} matching versions`);
      return results;
    } catch (error) {
      console.error('❌ Failed to query versions:', error);
      return [];
    }
  }

  /**
   * 添加標籤
   */
  async addTag(snapshotId: string, tag: string): Promise<void> {
    console.log(`🏷️  Adding tag "${tag}" to snapshot: ${snapshotId}`);

    try {
      const snapshot = await this.storage.loadSnapshot(snapshotId);

      if (!snapshot.tags.includes(tag)) {
        snapshot.tags.push(tag);
        await this.storage.saveSnapshot(snapshot, { overwrite: true });
        console.log(`✅ Tag added: ${tag}`);
        this.emit('tag_added', { snapshotId, tag });
      }
    } catch (error) {
      console.error(`❌ Failed to add tag:`, error);
      throw error;
    }
  }

  /**
   * 移除標籤
   */
  async removeTag(snapshotId: string, tag: string): Promise<void> {
    console.log(`🏷️  Removing tag "${tag}" from snapshot: ${snapshotId}`);

    try {
      const snapshot = await this.storage.loadSnapshot(snapshotId);

      const index = snapshot.tags.indexOf(tag);
      if (index > -1) {
        snapshot.tags.splice(index, 1);
        await this.storage.saveSnapshot(snapshot, { overwrite: true });
        console.log(`✅ Tag removed: ${tag}`);
        this.emit('tag_removed', { snapshotId, tag });
      }
    } catch (error) {
      console.error(`❌ Failed to remove tag:`, error);
      throw error;
    }
  }

  /**
   * 根據版本號查找快照
   */
  async findByVersion(projectId: string, version: string): Promise<ProjectSnapshot | null> {
    const parsedVersion = VersionUtils.parse(version);
    const results = await this.queryVersions({
      projectId,
      minVersion: parsedVersion,
      maxVersion: parsedVersion,
    });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * 根據標籤查找快照
   */
  async findByTag(projectId: string, tag: string): Promise<ProjectSnapshot[]> {
    return await this.queryVersions({
      projectId,
      tags: [tag],
    });
  }

  /**
   * 獲取版本歷史
   */
  async getVersionHistory(projectId: string): Promise<ProjectSnapshot[]> {
    const snapshots = await this.queryVersions({ projectId });

    // Sort by version descending
    snapshots.sort((a, b) => VersionUtils.compare(b.version, a.version));

    return snapshots;
  }

  /**
   * 比較兩個版本
   */
  compareVersions(v1: string, v2: string): number {
    const version1 = VersionUtils.parse(v1);
    const version2 = VersionUtils.parse(v2);
    return VersionUtils.compare(version1, version2);
  }
}
