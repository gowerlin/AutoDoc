/**
 * Credential Manager
 * Task 10.1: 認證儲存與加密 - 安全管理認證資訊
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 認證類型
 */
export type AuthType = 'basic' | 'bearer' | 'api_key' | 'oauth2' | 'cookie' | 'custom';

/**
 * 認證憑證
 */
export interface Credential {
  id: string;
  name: string;
  type: AuthType;
  url?: string;
  domain?: string;

  // Basic Auth
  username?: string;
  password?: string;

  // Bearer Token / API Key
  token?: string;
  apiKey?: string;

  // OAuth2
  oauth?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    tokenType?: string;
    scope?: string[];
  };

  // Cookie
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;

  // Custom headers
  customHeaders?: Record<string, string>;

  // 元數據
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastUsed?: Date;
    expiresAt?: Date;
    tags?: string[];
    description?: string;
  };
}

/**
 * 加密配置
 */
export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
}

/**
 * 儲存配置
 */
export interface StorageConfig {
  storageDir: string;
  encryptionKey?: string;
  autoBackup?: boolean;
  backupInterval?: number;
}

/**
 * 認證管理器
 */
export class CredentialManager extends EventEmitter {
  private credentials: Map<string, Credential> = new Map();
  private encryptionConfig: EncryptionConfig;
  private storageConfig: StorageConfig;
  private masterKey: Buffer;

  constructor(storageConfig: StorageConfig, encryptionKey?: string) {
    super();

    this.storageConfig = {
      autoBackup: true,
      backupInterval: 3600000, // 1 hour
      ...storageConfig,
    };

    this.encryptionConfig = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      iterations: 100000,
    };

    // 生成或載入主密鑰
    this.masterKey = this.deriveMasterKey(
      encryptionKey || this.storageConfig.encryptionKey || 'default-key-change-me'
    );

    this.initialize();
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storageConfig.storageDir, { recursive: true });
      await this.loadCredentials();

      if (this.storageConfig.autoBackup) {
        this.startAutoBackup();
      }

      console.log('✅ Credential Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Credential Manager:', error);
    }
  }

  /**
   * 生成主密鑰
   */
  private deriveMasterKey(passphrase: string): Buffer {
    const salt = crypto.randomBytes(this.encryptionConfig.saltLength);
    return crypto.pbkdf2Sync(
      passphrase,
      salt,
      this.encryptionConfig.iterations,
      this.encryptionConfig.keyLength,
      'sha512'
    );
  }

  /**
   * 加密數據
   */
  private encrypt(data: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(this.encryptionConfig.ivLength);
    const cipher = crypto.createCipheriv(this.encryptionConfig.algorithm, this.masterKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = (cipher as any).getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * 解密數據
   */
  private decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      this.encryptionConfig.algorithm,
      this.masterKey,
      Buffer.from(iv, 'hex')
    );

    (decipher as any).setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 添加認證
   */
  async addCredential(credential: Omit<Credential, 'id' | 'metadata'>): Promise<Credential> {
    console.log(`➕ Adding credential: ${credential.name}`);

    const newCredential: Credential = {
      ...credential,
      id: `cred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      },
    };

    this.credentials.set(newCredential.id, newCredential);

    await this.saveCredentials();

    console.log(`✅ Credential added: ${newCredential.id}`);
    this.emit('credential_added', { credential: newCredential });

    return newCredential;
  }

  /**
   * 獲取認證
   */
  async getCredential(id: string): Promise<Credential | undefined> {
    const credential = this.credentials.get(id);

    if (credential) {
      credential.metadata.lastUsed = new Date();
      await this.saveCredentials();
    }

    return credential;
  }

  /**
   * 獲取所有認證
   */
  getAllCredentials(): Credential[] {
    return Array.from(this.credentials.values());
  }

  /**
   * 根據 URL 查找認證
   */
  findCredentialsByUrl(url: string): Credential[] {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    return Array.from(this.credentials.values()).filter((cred) => {
      if (cred.url && cred.url === url) return true;
      if (cred.domain && domain.includes(cred.domain)) return true;
      return false;
    });
  }

  /**
   * 根據類型查找認證
   */
  findCredentialsByType(type: AuthType): Credential[] {
    return Array.from(this.credentials.values()).filter((cred) => cred.type === type);
  }

  /**
   * 更新認證
   */
  async updateCredential(id: string, updates: Partial<Credential>): Promise<Credential> {
    console.log(`✏️  Updating credential: ${id}`);

    const credential = this.credentials.get(id);
    if (!credential) {
      throw new Error(`Credential ${id} not found`);
    }

    Object.assign(credential, updates);
    credential.metadata.updatedAt = new Date();

    this.credentials.set(id, credential);

    await this.saveCredentials();

    console.log(`✅ Credential updated: ${id}`);
    this.emit('credential_updated', { credential });

    return credential;
  }

  /**
   * 刪除認證
   */
  async deleteCredential(id: string): Promise<boolean> {
    console.log(`🗑️  Deleting credential: ${id}`);

    const deleted = this.credentials.delete(id);

    if (deleted) {
      await this.saveCredentials();
      console.log(`✅ Credential deleted: ${id}`);
      this.emit('credential_deleted', { id });
    }

    return deleted;
  }

  /**
   * 儲存認證到檔案
   */
  private async saveCredentials(): Promise<void> {
    try {
      const filePath = path.join(this.storageConfig.storageDir, 'credentials.enc');

      // 序列化
      const data = JSON.stringify(Array.from(this.credentials.entries()), null, 2);

      // 加密
      const { encrypted, iv, authTag } = this.encrypt(data);

      // 儲存
      const payload = JSON.stringify({ encrypted, iv, authTag });
      await fs.writeFile(filePath, payload, 'utf8');

      console.log('💾 Credentials saved and encrypted');
    } catch (error) {
      console.error('❌ Failed to save credentials:', error);
      throw error;
    }
  }

  /**
   * 從檔案載入認證
   */
  private async loadCredentials(): Promise<void> {
    try {
      const filePath = path.join(this.storageConfig.storageDir, 'credentials.enc');

      // 檢查檔案是否存在
      try {
        await fs.access(filePath);
      } catch {
        console.log('ℹ️  No existing credentials file');
        return;
      }

      // 讀取
      const payload = await fs.readFile(filePath, 'utf8');
      const { encrypted, iv, authTag } = JSON.parse(payload);

      // 解密
      const data = this.decrypt(encrypted, iv, authTag);

      // 反序列化
      const entries = JSON.parse(data);
      this.credentials = new Map(
        entries.map(([id, cred]: [string, any]) => [
          id,
          {
            ...cred,
            metadata: {
              ...cred.metadata,
              createdAt: new Date(cred.metadata.createdAt),
              updatedAt: new Date(cred.metadata.updatedAt),
              lastUsed: cred.metadata.lastUsed ? new Date(cred.metadata.lastUsed) : undefined,
              expiresAt: cred.metadata.expiresAt ? new Date(cred.metadata.expiresAt) : undefined,
            },
          },
        ])
      );

      console.log(`📂 Loaded ${this.credentials.size} credentials`);
    } catch (error) {
      console.error('❌ Failed to load credentials:', error);
      throw error;
    }
  }

  /**
   * 備份認證
   */
  async backupCredentials(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.storageConfig.storageDir, `credentials-backup-${timestamp}.enc`);

      const sourcePath = path.join(this.storageConfig.storageDir, 'credentials.enc');
      await fs.copyFile(sourcePath, backupPath);

      console.log(`💾 Credentials backed up: ${backupPath}`);
      this.emit('credentials_backed_up', { backupPath });

      return backupPath;
    } catch (error) {
      console.error('❌ Failed to backup credentials:', error);
      throw error;
    }
  }

  /**
   * 自動備份
   */
  private startAutoBackup(): void {
    setInterval(() => {
      this.backupCredentials().catch((error) => {
        console.error('Auto backup failed:', error);
      });
    }, this.storageConfig.backupInterval!);

    console.log(`🔄 Auto backup enabled (every ${this.storageConfig.backupInterval! / 1000}s)`);
  }

  /**
   * 驗證認證是否過期
   */
  isCredentialExpired(credential: Credential): boolean {
    if (!credential.metadata.expiresAt) return false;
    return new Date() > credential.metadata.expiresAt;
  }

  /**
   * 清理過期認證
   */
  async cleanupExpiredCredentials(): Promise<number> {
    console.log('🧹 Cleaning up expired credentials...');

    let count = 0;
    for (const [id, credential] of this.credentials.entries()) {
      if (this.isCredentialExpired(credential)) {
        await this.deleteCredential(id);
        count++;
      }
    }

    console.log(`✅ Cleaned up ${count} expired credentials`);
    return count;
  }

  /**
   * 匯出認證（未加密，僅用於遷移）
   */
  async exportCredentials(outputPath: string): Promise<void> {
    console.log(`📤 Exporting credentials to: ${outputPath}`);

    const data = JSON.stringify(Array.from(this.credentials.entries()), null, 2);
    await fs.writeFile(outputPath, data, 'utf8');

    console.log('⚠️  Warning: Exported credentials are NOT encrypted!');
    this.emit('credentials_exported', { outputPath });
  }

  /**
   * 匯入認證
   */
  async importCredentials(inputPath: string): Promise<number> {
    console.log(`📥 Importing credentials from: ${inputPath}`);

    const data = await fs.readFile(inputPath, 'utf8');
    const entries = JSON.parse(data);

    let count = 0;
    for (const [id, cred] of entries) {
      this.credentials.set(id, cred);
      count++;
    }

    await this.saveCredentials();

    console.log(`✅ Imported ${count} credentials`);
    this.emit('credentials_imported', { count });

    return count;
  }
}
