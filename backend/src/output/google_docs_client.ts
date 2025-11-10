/**
 * Google Docs API Client
 * Task 5.1: 整合 Google Docs API
 */

import { google, docs_v1, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export type ShareRole = 'reader' | 'commenter' | 'writer';

export interface DocumentInfo {
  id: string;
  title: string;
  url: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface SharePermission {
  email: string;
  role: ShareRole;
  type: 'user' | 'group' | 'domain' | 'anyone';
}

export interface AuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  serviceAccountKeyPath?: string;
  refreshToken?: string;
  useServiceAccount?: boolean;
}

export interface APIError {
  code: number;
  message: string;
  type: 'quota_exceeded' | 'permission_denied' | 'not_found' | 'network_error' | 'unknown';
}

export class GoogleDocsClient extends EventEmitter {
  private auth: OAuth2Client | null = null;
  private docsAPI: docs_v1.Docs | null = null;
  private driveAPI: drive_v3.Drive | null = null;
  private config: AuthConfig;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;

  constructor(config: AuthConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化認證
   */
  async authenticate(): Promise<boolean> {
    try {
      console.log('🔐 Authenticating with Google...');

      if (this.config.useServiceAccount) {
        // 使用服務帳號認證
        await this.authenticateWithServiceAccount();
      } else {
        // 使用 OAuth 2.0 認證
        await this.authenticateWithOAuth();
      }

      // Initialize APIs
      this.docsAPI = google.docs({ version: 'v1', auth: this.auth! });
      this.driveAPI = google.drive({ version: 'v3', auth: this.auth! });

      // Setup token auto-refresh
      this.setupTokenAutoRefresh();

      console.log('✅ Google authentication successful');
      this.emit('authenticated');

      return true;
    } catch (error) {
      console.error('❌ Google authentication failed:', error);
      this.emit('auth_error', error);
      throw this.createAPIError(error);
    }
  }

  /**
   * 使用服務帳號認證
   */
  private async authenticateWithServiceAccount(): Promise<void> {
    if (!this.config.serviceAccountKeyPath) {
      throw new Error('Service account key path is required');
    }

    const keyPath = path.resolve(this.config.serviceAccountKeyPath);

    if (!fs.existsSync(keyPath)) {
      throw new Error(`Service account key file not found: ${keyPath}`);
    }

    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

    this.auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive',
      ],
    }).getClient() as any;

    console.log('✅ Service account authentication configured');
  }

  /**
   * 使用 OAuth 2.0 認證
   */
  private async authenticateWithOAuth(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('OAuth client ID and secret are required');
    }

    this.auth = new OAuth2Client(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri || 'http://localhost:3000/oauth/callback'
    );

    // If refresh token is provided, set it
    if (this.config.refreshToken) {
      this.auth.setCredentials({
        refresh_token: this.config.refreshToken,
      });

      // Get fresh access token
      const { credentials } = await this.auth.refreshAccessToken();
      this.auth.setCredentials(credentials);

      console.log('✅ OAuth authentication configured with refresh token');
    } else {
      // Generate auth URL for user to authorize
      const authUrl = this.auth.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/drive',
        ],
      });

      console.log('🔗 Please authorize this app by visiting:', authUrl);
      throw new Error('OAuth authorization required. Please visit the URL above.');
    }
  }

  /**
   * 設置 Token 自動刷新
   */
  private setupTokenAutoRefresh(): void {
    // Refresh token every 50 minutes (tokens expire after 60 minutes)
    this.tokenRefreshInterval = setInterval(async () => {
      try {
        if (this.auth && !this.config.useServiceAccount) {
          console.log('🔄 Refreshing access token...');
          const { credentials } = await this.auth.refreshAccessToken();
          this.auth.setCredentials(credentials);
          console.log('✅ Access token refreshed');
          this.emit('token_refreshed');
        }
      } catch (error) {
        console.error('❌ Token refresh failed:', error);
        this.emit('token_refresh_error', error);
      }
    }, 50 * 60 * 1000);
  }

  /**
   * 處理授權碼（用於 OAuth 流程）
   */
  async handleAuthorizationCode(code: string): Promise<void> {
    if (!this.auth) {
      throw new Error('OAuth client not initialized');
    }

    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);

    console.log('✅ OAuth tokens obtained');
    console.log('💾 Save this refresh token for future use:', tokens.refresh_token);

    this.emit('tokens_obtained', tokens);
  }

  /**
   * 建立新文檔
   */
  async createDocument(title: string): Promise<DocumentInfo> {
    try {
      if (!this.docsAPI) {
        throw new Error('Docs API not initialized. Call authenticate() first.');
      }

      console.log(`📄 Creating document: ${title}`);

      const response = await this.docsAPI.documents.create({
        requestBody: {
          title,
        },
      });

      const doc = response.data;

      const documentInfo: DocumentInfo = {
        id: doc.documentId!,
        title: doc.title!,
        url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      console.log(`✅ Document created: ${documentInfo.url}`);
      this.emit('document_created', documentInfo);

      return documentInfo;
    } catch (error) {
      console.error('❌ Failed to create document:', error);
      throw this.createAPIError(error);
    }
  }

  /**
   * 分享文檔
   */
  async shareDocument(
    docId: string,
    permissions: SharePermission[]
  ): Promise<void> {
    try {
      if (!this.driveAPI) {
        throw new Error('Drive API not initialized. Call authenticate() first.');
      }

      console.log(`🔗 Sharing document ${docId} with ${permissions.length} users...`);

      for (const permission of permissions) {
        await this.driveAPI.permissions.create({
          fileId: docId,
          requestBody: {
            type: permission.type,
            role: permission.role,
            emailAddress: permission.email,
          },
          sendNotificationEmail: true,
        });

        console.log(`  ✅ Shared with ${permission.email} (${permission.role})`);
      }

      console.log('✅ Document sharing complete');
      this.emit('document_shared', { docId, permissions });
    } catch (error) {
      console.error('❌ Failed to share document:', error);
      throw this.createAPIError(error);
    }
  }

  /**
   * 取得文檔資訊
   */
  async getDocument(docId: string): Promise<docs_v1.Schema$Document> {
    try {
      if (!this.docsAPI) {
        throw new Error('Docs API not initialized. Call authenticate() first.');
      }

      const response = await this.docsAPI.documents.get({
        documentId: docId,
      });

      return response.data;
    } catch (error) {
      console.error('❌ Failed to get document:', error);
      throw this.createAPIError(error);
    }
  }

  /**
   * 刪除文檔
   */
  async deleteDocument(docId: string): Promise<void> {
    try {
      if (!this.driveAPI) {
        throw new Error('Drive API not initialized. Call authenticate() first.');
      }

      console.log(`🗑️ Deleting document ${docId}...`);

      await this.driveAPI.files.delete({
        fileId: docId,
      });

      console.log('✅ Document deleted');
      this.emit('document_deleted', docId);
    } catch (error) {
      console.error('❌ Failed to delete document:', error);
      throw this.createAPIError(error);
    }
  }

  /**
   * 列出所有文檔
   */
  async listDocuments(maxResults: number = 100): Promise<DocumentInfo[]> {
    try {
      if (!this.driveAPI) {
        throw new Error('Drive API not initialized. Call authenticate() first.');
      }

      const response = await this.driveAPI.files.list({
        pageSize: maxResults,
        q: "mimeType='application/vnd.google-apps.document'",
        fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
        orderBy: 'modifiedTime desc',
      });

      const documents: DocumentInfo[] = (response.data.files || []).map((file) => ({
        id: file.id!,
        title: file.name!,
        url: file.webViewLink!,
        createdAt: new Date(file.createdTime!),
        modifiedAt: new Date(file.modifiedTime!),
      }));

      console.log(`📋 Found ${documents.length} documents`);

      return documents;
    } catch (error) {
      console.error('❌ Failed to list documents:', error);
      throw this.createAPIError(error);
    }
  }

  /**
   * 檢查認證狀態
   */
  isAuthenticated(): boolean {
    return this.auth !== null && this.docsAPI !== null && this.driveAPI !== null;
  }

  /**
   * 取得 Docs API 實例
   */
  getDocsAPI(): docs_v1.Docs {
    if (!this.docsAPI) {
      throw new Error('Docs API not initialized. Call authenticate() first.');
    }
    return this.docsAPI;
  }

  /**
   * 取得 Drive API 實例
   */
  getDriveAPI(): drive_v3.Drive {
    if (!this.driveAPI) {
      throw new Error('Drive API not initialized. Call authenticate() first.');
    }
    return this.driveAPI;
  }

  /**
   * 建立 API 錯誤
   */
  private createAPIError(error: any): Error {
    const apiError: APIError = {
      code: error.code || 500,
      message: error.message || 'Unknown error',
      type: this.classifyError(error),
    };

    // Check specific error types
    if (error.code === 429) {
      apiError.type = 'quota_exceeded';
      apiError.message = 'API quota exceeded. Please try again later.';
    } else if (error.code === 403) {
      apiError.type = 'permission_denied';
      apiError.message = 'Permission denied. Check your API credentials and permissions.';
    } else if (error.code === 404) {
      apiError.type = 'not_found';
      apiError.message = 'Document not found.';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      apiError.type = 'network_error';
      apiError.message = 'Network error. Please check your internet connection.';
    }

    const err = new Error(apiError.message);
    (err as any).apiError = apiError;

    return err;
  }

  /**
   * 分類錯誤類型
   */
  private classifyError(error: any): APIError['type'] {
    if (error.code === 429) return 'quota_exceeded';
    if (error.code === 403) return 'permission_denied';
    if (error.code === 404) return 'not_found';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') return 'network_error';
    return 'unknown';
  }

  /**
   * 測試連接
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔌 Testing Google API connection...');

      if (!this.isAuthenticated()) {
        throw new Error('Not authenticated');
      }

      // Try to list documents (with limit 1)
      await this.listDocuments(1);

      console.log('✅ Google API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Google API connection failed:', error);
      return false;
    }
  }

  /**
   * 取得配額資訊
   */
  async getQuotaInfo(): Promise<{
    used: number;
    limit: number;
    remaining: number;
  }> {
    // Note: Google doesn't provide direct quota information via API
    // This is a placeholder that could be implemented with usage tracking
    console.warn('⚠️ Quota information not available via API');

    return {
      used: 0,
      limit: 300, // Default quota: 300 requests per minute
      remaining: 300,
    };
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Google Docs client...');

    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }

    this.auth = null;
    this.docsAPI = null;
    this.driveAPI = null;

    console.log('✅ Cleanup complete');
  }
}
