import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { SnapshotStorage } from '../../src/snapshot/snapshot_storage';

describe('SnapshotStorage - Security Tests', () => {
  let storage: SnapshotStorage;
  let tempDir: string;

  beforeEach(async () => {
    const parentTemp = path.join(__dirname, '../__temp__');
    if (!fs.existsSync(parentTemp)) {
      fs.mkdirSync(parentTemp, { recursive: true });
    }

    tempDir = path.join(parentTemp, `test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    storage = new SnapshotStorage({
      baseDir: tempDir,
      maxSnapshots: 10,
      compressionEnabled: false
    });

    // Wait for storage initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Path Traversal Prevention', () => {
    it('should reject snapshot IDs with path traversal attempts', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'valid/../../../etc/passwd',
        'valid/../../secrets',
        '....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f',
        '..%252f..%252f',
      ];

      for (const id of maliciousIds) {
        await expect(
          storage.createSnapshot(id, {
            url: 'http://example.com',
            timestamp: Date.now(),
            screenshots: [],
            domSnapshot: '<html></html>',
            metadata: {}
          })
        ).rejects.toThrow(/Invalid snapshot ID format/);
      }
    });

    it('should reject snapshot IDs with invalid characters', async () => {
      const invalidIds = [
        'snapshot/../evil',
        'snapshot/test',
        'snapshot\\test',
        'snapshot;test',
        'snapshot&test',
        'snapshot|test',
        'snapshot$test',
        'snapshot`test',
        'snapshot<test',
        'snapshot>test',
      ];

      for (const id of invalidIds) {
        await expect(
          storage.createSnapshot(id, {
            url: 'http://example.com',
            timestamp: Date.now(),
            screenshots: [],
            domSnapshot: '<html></html>',
            metadata: {}
          })
        ).rejects.toThrow(/Invalid snapshot ID format/);
      }
    });

    it('should accept valid snapshot IDs', async () => {
      const validIds = [
        'snapshot-123',
        'test_snapshot_456',
        'ValidSnapshot789',
        'a-b-c-d-e',
        'test_123_snapshot',
      ];

      for (const id of validIds) {
        await expect(
          storage.createSnapshot(id, {
            url: 'http://example.com',
            timestamp: Date.now(),
            screenshots: [],
            domSnapshot: '<html></html>',
            metadata: {}
          })
        ).resolves.not.toThrow();

        // Clean up
        await storage.deleteSnapshot(id);
      }
    });

    it('should reject snapshot IDs that are too long', async () => {
      const longId = 'a'.repeat(256); // Exceeds 255 character limit

      await expect(
        storage.createSnapshot(longId, {
          url: 'http://example.com',
          timestamp: Date.now(),
          screenshots: [],
          domSnapshot: '<html></html>',
          metadata: {}
        })
      ).rejects.toThrow(/Snapshot ID too long/);
    });

    it('should ensure created paths stay within baseDir', async () => {
      const snapshotId = 'test-snapshot-safe';

      await storage.createSnapshot(snapshotId, {
        url: 'http://example.com',
        timestamp: Date.now(),
        screenshots: [],
        domSnapshot: '<html></html>',
        metadata: {}
      });

      // Verify the snapshot directory is within baseDir
      const snapshotPath = path.join(tempDir, 'snapshots', snapshotId);
      const resolvedPath = path.resolve(snapshotPath);
      const basePath = path.resolve(tempDir, 'snapshots');

      expect(resolvedPath.startsWith(basePath)).toBe(true);
    });
  });

  describe('Export Path Validation', () => {
    it('should reject export to paths outside allowed directories', async () => {
      const snapshotId = 'test-export';

      // Create a test snapshot
      await storage.createSnapshot(snapshotId, {
        url: 'http://example.com',
        timestamp: Date.now(),
        screenshots: [],
        domSnapshot: '<html></html>',
        metadata: {}
      });

      const dangerousPaths = [
        '/etc/passwd',
        '/tmp/../../../etc/passwd',
        'C:\\Windows\\System32\\config',
        '../../../home/user/.ssh/id_rsa',
      ];

      for (const dangerousPath of dangerousPaths) {
        await expect(
          storage.exportSnapshot(snapshotId, dangerousPath)
        ).rejects.toThrow(/must be within allowed directory/);
      }
    });

    it('should allow export to current working directory', async () => {
      const snapshotId = 'test-export-safe';

      await storage.createSnapshot(snapshotId, {
        url: 'http://example.com',
        timestamp: Date.now(),
        screenshots: [],
        domSnapshot: '<html></html>',
        metadata: {}
      });

      const safePath = path.join(process.cwd(), 'test-export.zip');

      await expect(
        storage.exportSnapshot(snapshotId, safePath)
      ).resolves.not.toThrow();

      // Cleanup
      if (fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
      }
    });
  });

  describe('Input Sanitization', () => {
    it('should handle empty snapshot ID', async () => {
      await expect(
        storage.createSnapshot('', {
          url: 'http://example.com',
          timestamp: Date.now(),
          screenshots: [],
          domSnapshot: '<html></html>',
          metadata: {}
        })
      ).rejects.toThrow(/Invalid snapshot ID format/);
    });

    it('should handle null bytes in snapshot ID', async () => {
      await expect(
        storage.createSnapshot('test\x00malicious', {
          url: 'http://example.com',
          timestamp: Date.now(),
          screenshots: [],
          domSnapshot: '<html></html>',
          metadata: {}
        })
      ).rejects.toThrow(/Invalid snapshot ID format/);
    });

    it('should handle unicode characters in snapshot ID', async () => {
      await expect(
        storage.createSnapshot('test-日本語-snapshot', {
          url: 'http://example.com',
          timestamp: Date.now(),
          screenshots: [],
          domSnapshot: '<html></html>',
          metadata: {}
        })
      ).rejects.toThrow(/Invalid snapshot ID format/);
    });
  });
});
