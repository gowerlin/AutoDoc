/**
 * Global State Management with Zustand
 * Task 6.1: Frontend Architecture - State Management
 */

import { create } from 'zustand';
import { ConnectionStatus } from '../services/websocket';

// Types
export interface ExplorationNode {
  id: string;
  url: string;
  title: string;
  status: 'completed' | 'in_progress' | 'pending' | 'error';
  children: ExplorationNode[];
  depth: number;
}

export interface ProgressStats {
  exploredPages: number;
  pendingPages: number;
  errorPages: number;
  totalPages: number;
  generatedSections: number;
  estimatedTimeRemaining: string;
}

export interface AIQuestion {
  id: string;
  question: string;
  type: 'choice' | 'fill_in' | 'demonstration';
  options?: string[];
  screenshot?: string;
  timestamp: Date;
}

export interface Message {
  id: string;
  type: 'ai' | 'human';
  content: string;
  timestamp: Date;
  isMarkdown?: boolean;
}

export interface LogEntry {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
  details?: any;
}

export interface ExplorationConfig {
  entryUrl: string;
  maxDepth: number;
  strategy: 'bfs' | 'dfs' | 'importance';
  screenshotQuality: 'high' | 'medium' | 'low';
  googleDocsTitle: string;
  shareEmails: string[];
}

// State Interface
interface AppState {
  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Exploration
  explorationState: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  setExplorationState: (state: AppState['explorationState']) => void;
  explorationTree: ExplorationNode | null;
  setExplorationTree: (tree: ExplorationNode | null) => void;
  progressStats: ProgressStats;
  setProgressStats: (stats: ProgressStats) => void;
  config: ExplorationConfig;
  setConfig: (config: Partial<ExplorationConfig>) => void;

  // Browser Preview
  currentScreenshot: string | null;
  setCurrentScreenshot: (screenshot: string | null) => void;
  currentUrl: string;
  setCurrentUrl: (url: string) => void;
  currentTitle: string;
  setCurrentTitle: (title: string) => void;
  highlightedElement: { x: number; y: number; width: number; height: number } | null;
  setHighlightedElement: (element: AppState['highlightedElement']) => void;

  // AI Questions
  currentAIQuestion: AIQuestion | null;
  setCurrentAIQuestion: (question: AIQuestion | null) => void;
  aiQuestionHistory: AIQuestion[];
  addAIQuestion: (question: AIQuestion) => void;

  // Chat Messages
  messages: Message[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  // Logs
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  logFilter: LogEntry['level'] | 'all';
  setLogFilter: (filter: AppState['logFilter']) => void;

  // UI State
  isFullscreen: boolean;
  setIsFullscreen: (fullscreen: boolean) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  selectedNode: string | null;
  setSelectedNode: (nodeId: string | null) => void;
}

// Create Store
export const useAppStore = create<AppState>((set) => ({
  // Connection
  connectionStatus: 'disconnected',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Exploration
  explorationState: 'idle',
  setExplorationState: (state) => set({ explorationState: state }),
  explorationTree: null,
  setExplorationTree: (tree) => set({ explorationTree: tree }),
  progressStats: {
    exploredPages: 0,
    pendingPages: 0,
    errorPages: 0,
    totalPages: 0,
    generatedSections: 0,
    estimatedTimeRemaining: '0 min',
  },
  setProgressStats: (stats) => set({ progressStats: stats }),
  config: {
    entryUrl: '',
    maxDepth: 3,
    strategy: 'importance',
    screenshotQuality: 'medium',
    googleDocsTitle: 'User Manual',
    shareEmails: [],
  },
  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),

  // Browser Preview
  currentScreenshot: null,
  setCurrentScreenshot: (screenshot) => set({ currentScreenshot: screenshot }),
  currentUrl: '',
  setCurrentUrl: (url) => set({ currentUrl: url }),
  currentTitle: '',
  setCurrentTitle: (title) => set({ currentTitle: title }),
  highlightedElement: null,
  setHighlightedElement: (element) => set({ highlightedElement: element }),

  // AI Questions
  currentAIQuestion: null,
  setCurrentAIQuestion: (question) => set({ currentAIQuestion: question }),
  aiQuestionHistory: [],
  addAIQuestion: (question) =>
    set((state) => ({
      aiQuestionHistory: [...state.aiQuestionHistory, question],
    })),

  // Chat Messages
  messages: [],
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `msg-${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),

  // Logs
  logs: [],
  addLog: (log) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...log,
          id: `log-${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
        },
      ].slice(-1000), // Keep last 1000 logs
    })),
  clearLogs: () => set({ logs: [] }),
  logFilter: 'all',
  setLogFilter: (filter) => set({ logFilter: filter }),

  // UI State
  isFullscreen: false,
  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  zoom: 1,
  setZoom: (zoom) => set({ zoom: zoom }),
  selectedNode: null,
  setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),
}));
