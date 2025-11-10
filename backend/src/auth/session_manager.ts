/**
 * Session Manager
 * Task 10.2: Session 管理 - Cookie 注入、Session 維護
 */

import { EventEmitter } from 'events';
import { Credential, CredentialManager } from './credential_manager';

/**
 * Session 狀態
 */
export type SessionStatus = 'active' | 'expired' | 'invalid' | 'pending';

/**
 * Session 資訊
 */
export interface Session {
  id: string;
  credentialId: string;
  url: string;
  status: SessionStatus;

  // Cookie 資訊
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;

  // Session 元數據
  metadata: {
    createdAt: Date;
    lastAccessedAt: Date;
    expiresAt?: Date;
    userAgent?: string;
    ipAddress?: string;
  };
}

/**
 * 登入結果
 */
export interface LoginResult {
  success: boolean;
  session?: Session;
  error?: string;
  requiresMfa?: boolean;
  mfaType?: 'totp' | 'sms' | 'email';
}

/**
 * Session 配置
 */
export interface SessionConfig {
  maxSessions: number;
  sessionTimeout: number; // milliseconds
  autoRefresh: boolean;
  refreshThreshold: number; // milliseconds before expiry
}

/**
 * Session 管理器
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private credentialManager: CredentialManager;
  private config: SessionConfig;
  private cdpWrapper: any; // CDP Wrapper for browser control

  constructor(
    credentialManager: CredentialManager,
    cdpWrapper: any,
    config?: Partial<SessionConfig>
  ) {
    super();

    this.credentialManager = credentialManager;
    this.cdpWrapper = cdpWrapper;

    this.config = {
      maxSessions: 10,
      sessionTimeout: 3600000, // 1 hour
      autoRefresh: true,
      refreshThreshold: 300000, // 5 minutes
      ...config,
    };

    this.startSessionMonitor();
  }

  /**
   * 使用認證登入
   */
  async login(credentialId: string, url: string): Promise<LoginResult> {
    console.log(`🔐 Attempting login with credential: ${credentialId}`);

    try {
      const credential = await this.credentialManager.getCredential(credentialId);
      if (!credential) {
        return {
          success: false,
          error: 'Credential not found',
        };
      }

      // 根據認證類型執行登入
      let session: Session | null = null;

      switch (credential.type) {
        case 'basic':
          session = await this.loginBasicAuth(credential, url);
          break;
        case 'cookie':
          session = await this.loginWithCookies(credential, url);
          break;
        case 'bearer':
        case 'api_key':
          session = await this.loginWithToken(credential, url);
          break;
        case 'oauth2':
          session = await this.loginOAuth2(credential, url);
          break;
        case 'custom':
          session = await this.loginCustom(credential, url);
          break;
        default:
          return {
            success: false,
            error: `Unsupported auth type: ${credential.type}`,
          };
      }

      if (session) {
        this.sessions.set(session.id, session);

        console.log(`✅ Login successful: ${session.id}`);
        this.emit('login_success', { session });

        return {
          success: true,
          session,
        };
      }

      return {
        success: false,
        error: 'Login failed',
      };
    } catch (error) {
      console.error('❌ Login failed:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Basic Auth 登入
   */
  private async loginBasicAuth(credential: Credential, url: string): Promise<Session | null> {
    console.log('  🔑 Using Basic Auth');

    if (!credential.username || !credential.password) {
      throw new Error('Username or password missing');
    }

    // Navigate to URL
    await this.cdpWrapper.navigate(url);

    // Inject Basic Auth header
    const authHeader = Buffer.from(`${credential.username}:${credential.password}`).toString('base64');

    await this.cdpWrapper.setExtraHTTPHeaders({
      Authorization: `Basic ${authHeader}`,
    });

    // Wait for page load
    await this.cdpWrapper.waitForPageLoad();

    // Extract cookies
    const cookies = await this.cdpWrapper.getCookies();

    return this.createSession(credential.id, url, cookies);
  }

  /**
   * Cookie 登入
   */
  private async loginWithCookies(credential: Credential, url: string): Promise<Session | null> {
    console.log('  🍪 Using Cookie Auth');

    if (!credential.cookies || credential.cookies.length === 0) {
      throw new Error('No cookies provided');
    }

    // Navigate to URL
    await this.cdpWrapper.navigate(url);

    // Inject cookies
    for (const cookie of credential.cookies) {
      await this.cdpWrapper.setCookie({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || new URL(url).hostname,
        path: cookie.path || '/',
        expires: cookie.expires ? Math.floor(cookie.expires.getTime() / 1000) : undefined,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      });
    }

    // Reload page with cookies
    await this.cdpWrapper.reload();

    // Wait for page load
    await this.cdpWrapper.waitForPageLoad();

    // Verify login success (check for logout button or user profile)
    const isLoggedIn = await this.verifyLoginSuccess();

    if (!isLoggedIn) {
      throw new Error('Cookie authentication failed - not logged in');
    }

    // Get all cookies
    const cookies = await this.cdpWrapper.getCookies();

    return this.createSession(credential.id, url, cookies);
  }

  /**
   * Token 登入 (Bearer / API Key)
   */
  private async loginWithToken(credential: Credential, url: string): Promise<Session | null> {
    console.log('  🎫 Using Token Auth');

    const token = credential.token || credential.apiKey;
    if (!token) {
      throw new Error('Token or API key missing');
    }

    // Navigate to URL
    await this.cdpWrapper.navigate(url);

    // Set auth header
    const headers: Record<string, string> = {};

    if (credential.type === 'bearer') {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (credential.type === 'api_key') {
      // Common API key header names
      headers['X-API-Key'] = token;
      headers['Authorization'] = `ApiKey ${token}`;
    }

    // Add custom headers
    if (credential.customHeaders) {
      Object.assign(headers, credential.customHeaders);
    }

    await this.cdpWrapper.setExtraHTTPHeaders(headers);

    // Reload with headers
    await this.cdpWrapper.reload();

    // Wait for page load
    await this.cdpWrapper.waitForPageLoad();

    // Get cookies
    const cookies = await this.cdpWrapper.getCookies();

    return this.createSession(credential.id, url, cookies);
  }

  /**
   * OAuth2 登入
   */
  private async loginOAuth2(credential: Credential, url: string): Promise<Session | null> {
    console.log('  🔐 Using OAuth2');

    if (!credential.oauth || !credential.oauth.accessToken) {
      throw new Error('OAuth2 access token missing');
    }

    // Check if token expired
    if (credential.oauth.expiresAt && new Date() > credential.oauth.expiresAt) {
      console.log('  ⏰ Access token expired, refreshing...');
      if (credential.oauth.refreshToken) {
        // TODO: Implement token refresh
        throw new Error('Token refresh not implemented');
      } else {
        throw new Error('Access token expired and no refresh token available');
      }
    }

    // Navigate to URL
    await this.cdpWrapper.navigate(url);

    // Set OAuth bearer token
    await this.cdpWrapper.setExtraHTTPHeaders({
      Authorization: `${credential.oauth.tokenType || 'Bearer'} ${credential.oauth.accessToken}`,
    });

    // Reload with headers
    await this.cdpWrapper.reload();

    // Wait for page load
    await this.cdpWrapper.waitForPageLoad();

    // Get cookies
    const cookies = await this.cdpWrapper.getCookies();

    return this.createSession(credential.id, url, cookies);
  }

  /**
   * 自訂登入邏輯
   */
  private async loginCustom(credential: Credential, url: string): Promise<Session | null> {
    console.log('  ⚙️  Using Custom Auth');

    // Navigate to URL
    await this.cdpWrapper.navigate(url);

    // Set custom headers
    if (credential.customHeaders) {
      await this.cdpWrapper.setExtraHTTPHeaders(credential.customHeaders);
    }

    // Inject cookies if provided
    if (credential.cookies && credential.cookies.length > 0) {
      for (const cookie of credential.cookies) {
        await this.cdpWrapper.setCookie(cookie);
      }
    }

    // Reload with auth
    await this.cdpWrapper.reload();

    // Wait for page load
    await this.cdpWrapper.waitForPageLoad();

    // Get cookies
    const cookies = await this.cdpWrapper.getCookies();

    return this.createSession(credential.id, url, cookies);
  }

  /**
   * 創建 Session
   */
  private createSession(credentialId: string, url: string, cookies: any[]): Session {
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      credentialId,
      url,
      status: 'active',
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires ? new Date(c.expires * 1000) : undefined,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
      metadata: {
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.sessionTimeout),
      },
    };

    return session;
  }

  /**
   * 驗證登入成功
   */
  private async verifyLoginSuccess(): Promise<boolean> {
    try {
      // 常見的登入成功指標
      const indicators = [
        'button[data-logout]',
        'button[data-signout]',
        'a[href*="logout"]',
        'a[href*="signout"]',
        '.user-profile',
        '.user-menu',
        '#user-menu',
        '[data-user-name]',
      ];

      for (const selector of indicators) {
        const exists = await this.cdpWrapper.elementExists(selector);
        if (exists) {
          return true;
        }
      }

      // 檢查 URL 變化（通常登入後會重定向）
      const currentUrl = await this.cdpWrapper.getCurrentUrl();
      if (currentUrl.includes('dashboard') || currentUrl.includes('home') || currentUrl.includes('profile')) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to verify login:', error);
      return false;
    }
  }

  /**
   * 恢復 Session
   */
  async restoreSession(sessionId: string): Promise<boolean> {
    console.log(`🔄 Restoring session: ${sessionId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      return false;
    }

    try {
      // Navigate to URL
      await this.cdpWrapper.navigate(session.url);

      // Inject cookies
      for (const cookie of session.cookies) {
        await this.cdpWrapper.setCookie(cookie);
      }

      // Reload with cookies
      await this.cdpWrapper.reload();

      // Wait for page load
      await this.cdpWrapper.waitForPageLoad();

      // Update last accessed
      session.metadata.lastAccessedAt = new Date();
      session.status = 'active';

      console.log(`✅ Session restored: ${sessionId}`);
      this.emit('session_restored', { session });

      return true;
    } catch (error) {
      console.error(`❌ Failed to restore session:`, error);
      session.status = 'invalid';
      return false;
    }
  }

  /**
   * 獲取 Session
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 獲取所有 Session
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 根據 URL 查找 Session
   */
  findSessionsByUrl(url: string): Session[] {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    return Array.from(this.sessions.values()).filter((session) => {
      const sessionUrl = new URL(session.url);
      return sessionUrl.hostname === domain;
    });
  }

  /**
   * 登出
   */
  async logout(sessionId: string): Promise<boolean> {
    console.log(`👋 Logging out session: ${sessionId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Clear cookies
      await this.cdpWrapper.clearCookies();

      // Remove session
      this.sessions.delete(sessionId);

      console.log(`✅ Logged out: ${sessionId}`);
      this.emit('logout', { sessionId });

      return true;
    } catch (error) {
      console.error(`❌ Logout failed:`, error);
      return false;
    }
  }

  /**
   * 刷新 Session
   */
  async refreshSession(sessionId: string): Promise<boolean> {
    console.log(`🔄 Refreshing session: ${sessionId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Reload page to refresh cookies
      await this.cdpWrapper.reload();

      // Get updated cookies
      const cookies = await this.cdpWrapper.getCookies();

      session.cookies = cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires ? new Date(c.expires * 1000) : undefined,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }));

      session.metadata.lastAccessedAt = new Date();
      session.metadata.expiresAt = new Date(Date.now() + this.config.sessionTimeout);

      console.log(`✅ Session refreshed: ${sessionId}`);
      this.emit('session_refreshed', { session });

      return true;
    } catch (error) {
      console.error(`❌ Failed to refresh session:`, error);
      return false;
    }
  }

  /**
   * 監控 Session
   */
  private startSessionMonitor(): void {
    setInterval(() => {
      this.checkSessions();
    }, 60000); // Check every minute

    console.log('🔍 Session monitor started');
  }

  /**
   * 檢查 Session
   */
  private async checkSessions(): Promise<void> {
    const now = new Date();

    for (const [sessionId, session] of this.sessions.entries()) {
      // Check expiration
      if (session.metadata.expiresAt && now > session.metadata.expiresAt) {
        console.log(`⏰ Session expired: ${sessionId}`);
        session.status = 'expired';
        this.emit('session_expired', { session });

        // Auto-refresh if enabled
        if (this.config.autoRefresh) {
          await this.refreshSession(sessionId);
        }
      }

      // Check if close to expiration
      if (
        this.config.autoRefresh &&
        session.metadata.expiresAt &&
        session.metadata.expiresAt.getTime() - now.getTime() < this.config.refreshThreshold
      ) {
        console.log(`⏰ Session close to expiry, refreshing: ${sessionId}`);
        await this.refreshSession(sessionId);
      }
    }
  }

  /**
   * 清理過期 Session
   */
  cleanupExpiredSessions(): number {
    const now = new Date();
    let count = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === 'expired' || session.status === 'invalid') {
        this.sessions.delete(sessionId);
        count++;
      }
    }

    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} expired sessions`);
    }

    return count;
  }
}
