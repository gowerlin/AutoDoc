import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { invoke } from '@tauri-apps/api/tauri'

// Mock Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}))

    render(<App />)
    expect(screen.getByText('載入中...')).toBeInTheDocument()
  })

  it('shows welcome wizard when no API key is configured', async () => {
    const mockConfig = {
      basic: {
        app_name: 'AutoDoc Agent',
        language: 'zh-TW',
        auto_start: false,
        minimize_to_tray: true,
        check_updates: true,
      },
      auth: {
        claude_api_key: '', // Empty API key triggers wizard
        claude_model: 'claude-sonnet-4-20250514',
        chrome_mcp_url: 'http://localhost',
        chrome_mcp_port: 3001,
      },
      exploration: {
        strategy: 'importance',
        max_depth: 5,
        max_pages: 100,
        screenshot_quality: 'medium',
        wait_for_network_idle: true,
      },
      storage: {
        snapshot_storage_path: '~/Documents/AutoDoc/snapshots',
        screenshot_storage_path: '~/Documents/AutoDoc/screenshots',
        database_path: '~/Documents/AutoDoc/autodoc.db',
        enable_compression: true,
        auto_cleanup: false,
        retention_days: 0,
      },
      advanced: {
        log_level: 'info',
        enable_telemetry: false,
        concurrent_tabs: 3,
        api_rate_limit: 20,
      },
    }

    vi.mocked(invoke).mockResolvedValue(mockConfig)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/歡迎使用 AutoDoc Agent/i)).toBeInTheDocument()
    })
  })

  it('shows main window when API key is configured', async () => {
    const mockConfig = {
      basic: {
        app_name: 'AutoDoc Agent',
        language: 'zh-TW',
        auto_start: false,
        minimize_to_tray: true,
        check_updates: true,
      },
      auth: {
        claude_api_key: 'sk-ant-api03-test123', // API key configured
        claude_model: 'claude-sonnet-4-20250514',
        chrome_mcp_url: 'http://localhost',
        chrome_mcp_port: 3001,
      },
      exploration: {
        strategy: 'importance',
        max_depth: 5,
        max_pages: 100,
        screenshot_quality: 'medium',
        wait_for_network_idle: true,
      },
      storage: {
        snapshot_storage_path: '~/Documents/AutoDoc/snapshots',
        screenshot_storage_path: '~/Documents/AutoDoc/screenshots',
        database_path: '~/Documents/AutoDoc/autodoc.db',
        enable_compression: true,
        auto_cleanup: false,
        retention_days: 0,
      },
      advanced: {
        log_level: 'info',
        enable_telemetry: false,
        concurrent_tabs: 3,
        api_rate_limit: 20,
      },
    }

    vi.mocked(invoke).mockResolvedValue(mockConfig)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('AutoDoc Agent')).toBeInTheDocument()
    })
  })
})
