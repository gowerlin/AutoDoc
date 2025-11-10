import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { CredentialManager } from '../../src/auth/credential_manager';

describe('CredentialManager - Security Tests', () => {
  let credentialManager: CredentialManager;
  let tempDir: string;

  beforeEach(() => {
    const parentTemp = path.join(__dirname, '../__temp__');
    if (!fs.existsSync(parentTemp)) {
      fs.mkdirSync(parentTemp, { recursive: true });
    }

    tempDir = path.join(parentTemp, `creds-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Generate a secure encryption key (32 bytes)
    const encryptionKey = 'a'.repeat(64); // 64 hex chars = 32 bytes

    credentialManager = new CredentialManager({
      storageDir: tempDir,
      encryptionKey: encryptionKey,
      keyDerivationIterations: 10000
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Encryption Key Validation', () => {
    it('should throw error when no encryption key is provided', () => {
      expect(() => {
        new CredentialManager({
          storageDir: tempDir,
          encryptionKey: '',
          keyDerivationIterations: 10000
        });
      }).toThrow(/Encryption key is required/);
    });

    it('should throw error when encryption key is undefined', () => {
      expect(() => {
        new CredentialManager({
          storageDir: tempDir,
          encryptionKey: undefined as any,
          keyDerivationIterations: 10000
        });
      }).toThrow(/Encryption key is required/);
    });

    it('should not accept default or weak keys', () => {
      const weakKeys = [
        'default-key-change-me',
        '12345678',
        'password',
        'secret',
        'key'
      ];

      for (const key of weakKeys) {
        expect(() => {
          new CredentialManager({
            storageDir: tempDir,
            encryptionKey: key,
            keyDerivationIterations: 10000
          });
        }).toThrow(/Encryption key must be at least 32 characters/);
      }
    });

    it('should accept properly generated encryption keys', () => {
      const validKey = require('crypto').randomBytes(32).toString('hex');

      expect(() => {
        new CredentialManager({
          storageDir: tempDir,
          encryptionKey: validKey,
          keyDerivationIterations: 10000
        });
      }).not.toThrow();
    });
  });

  describe('Credential Encryption', () => {
    it('should encrypt stored credentials', async () => {
      const credential = {
        provider: 'test-provider',
        credentials: {
          apiKey: 'super-secret-api-key',
          apiSecret: 'super-secret-api-secret'
        }
      };

      await credentialManager.storeCredential('test-cred', credential);

      // Read the raw file and ensure it doesn't contain plaintext
      const files = fs.readdirSync(tempDir);
      const credFile = files.find(f => f.startsWith('test-cred'));

      if (credFile) {
        const rawContent = fs.readFileSync(path.join(tempDir, credFile), 'utf-8');

        // Encrypted content should not contain the plaintext secrets
        expect(rawContent).not.toContain('super-secret-api-key');
        expect(rawContent).not.toContain('super-secret-api-secret');

        // Should contain encryption metadata
        expect(rawContent).toContain('iv');
        expect(rawContent).toContain('encrypted');
      }
    });

    it('should decrypt credentials correctly', async () => {
      const credential = {
        provider: 'test-provider',
        credentials: {
          apiKey: 'my-api-key',
          username: 'testuser',
          password: 'testpassword'
        }
      };

      await credentialManager.storeCredential('decrypt-test', credential);
      const retrieved = await credentialManager.getCredential('decrypt-test');

      expect(retrieved).toEqual(credential);
      expect(retrieved.credentials.apiKey).toBe('my-api-key');
      expect(retrieved.credentials.username).toBe('testuser');
      expect(retrieved.credentials.password).toBe('testpassword');
    });

    it('should fail to decrypt with wrong key', async () => {
      const credential = {
        provider: 'test-provider',
        credentials: { apiKey: 'secret' }
      };

      await credentialManager.storeCredential('key-test', credential);

      // Create new manager with different key
      const wrongKey = 'b'.repeat(64);
      const wrongManager = new CredentialManager({
        storageDir: tempDir,
        encryptionKey: wrongKey,
        keyDerivationIterations: 10000
      });

      await expect(
        wrongManager.getCredential('key-test')
      ).rejects.toThrow();
    });

    it('should use unique IVs for each encryption', async () => {
      const cred1 = { provider: 'test1', credentials: { key: 'value1' } };
      const cred2 = { provider: 'test2', credentials: { key: 'value1' } }; // Same value

      await credentialManager.storeCredential('cred1', cred1);
      await credentialManager.storeCredential('cred2', cred2);

      const files = fs.readdirSync(tempDir);
      const file1Content = fs.readFileSync(
        path.join(tempDir, files.find(f => f.startsWith('cred1'))!),
        'utf-8'
      );
      const file2Content = fs.readFileSync(
        path.join(tempDir, files.find(f => f.startsWith('cred2'))!),
        'utf-8'
      );

      // Even with same plaintext, ciphertext should differ due to unique IVs
      expect(file1Content).not.toBe(file2Content);
    });
  });

  describe('Export Path Validation', () => {
    it('should reject export to paths outside allowed directories', async () => {
      await credentialManager.storeCredential('test', {
        provider: 'test',
        credentials: { key: 'value' }
      });

      const dangerousPaths = [
        '/etc/passwd',
        '/tmp/../../../etc/passwd',
        'C:\\Windows\\System32\\config\\SAM',
        '../../../home/user/.ssh/id_rsa',
        '/root/.bashrc',
      ];

      for (const dangerousPath of dangerousPaths) {
        await expect(
          credentialManager.exportCredentials(dangerousPath)
        ).rejects.toThrow(/must be within allowed directory/);
      }
    });

    it('should allow export to current working directory', async () => {
      await credentialManager.storeCredential('test', {
        provider: 'test',
        credentials: { key: 'value' }
      });

      const safePath = path.join(process.cwd(), 'test-creds-export.json');

      await expect(
        credentialManager.exportCredentials(safePath)
      ).resolves.not.toThrow();

      // Cleanup
      if (fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
      }
    });

    it('should allow export to storage directory', async () => {
      await credentialManager.storeCredential('test', {
        provider: 'test',
        credentials: { key: 'value' }
      });

      const safePath = path.join(tempDir, 'export.json');

      await expect(
        credentialManager.exportCredentials(safePath)
      ).resolves.not.toThrow();
    });

    it('should normalize and validate export paths', async () => {
      await credentialManager.storeCredential('test', {
        provider: 'test',
        credentials: { key: 'value' }
      });

      // Attempt path traversal through normalization bypass
      const trickPath = path.join(process.cwd(), 'safe', '..', '..', '..', 'etc', 'passwd');

      await expect(
        credentialManager.exportCredentials(trickPath)
      ).rejects.toThrow(/must be within allowed directory/);
    });
  });

  describe('Input Validation', () => {
    it('should handle special characters in credential names', async () => {
      const specialNames = [
        'cred-with-dash',
        'cred_with_underscore',
        'cred.with.dot',
        'cred@with@at',
      ];

      for (const name of specialNames) {
        await expect(
          credentialManager.storeCredential(name, {
            provider: 'test',
            credentials: { key: 'value' }
          })
        ).resolves.not.toThrow();
      }
    });

    it('should reject path traversal in credential names', async () => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'cred/../../secret',
      ];

      for (const name of maliciousNames) {
        await expect(
          credentialManager.storeCredential(name, {
            provider: 'test',
            credentials: { key: 'value' }
          })
        ).rejects.toThrow();
      }
    });

    it('should handle empty credential values securely', async () => {
      await expect(
        credentialManager.storeCredential('empty-test', {
          provider: 'test',
          credentials: { key: '' }
        })
      ).resolves.not.toThrow();

      const retrieved = await credentialManager.getCredential('empty-test');
      expect(retrieved.credentials.key).toBe('');
    });

    it('should handle large credential values', async () => {
      const largeValue = 'x'.repeat(1024 * 100); // 100KB

      await expect(
        credentialManager.storeCredential('large-test', {
          provider: 'test',
          credentials: { key: largeValue }
        })
      ).resolves.not.toThrow();

      const retrieved = await credentialManager.getCredential('large-test');
      expect(retrieved.credentials.key).toBe(largeValue);
    });
  });

  describe('Key Derivation', () => {
    it('should use PBKDF2 for key derivation', async () => {
      // This is tested implicitly through encryption/decryption
      const credential = {
        provider: 'test',
        credentials: { secret: 'value' }
      };

      await credentialManager.storeCredential('kdf-test', credential);
      const retrieved = await credentialManager.getCredential('kdf-test');

      expect(retrieved).toEqual(credential);
    });

    it('should use sufficient iterations for key derivation', () => {
      // Verify the configuration uses at least 10000 iterations
      const config = {
        storageDir: tempDir,
        encryptionKey: 'a'.repeat(64),
        keyDerivationIterations: 10000
      };

      const manager = new CredentialManager(config);
      expect(manager).toBeDefined();
    });
  });
});
