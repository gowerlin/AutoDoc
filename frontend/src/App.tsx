/**
 * Main App Component
 * Task 6: Frontend UI Integration
 */

import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { wsClient } from './services/websocket';
import { BrowserPreview } from './components/BrowserPreview';
import { ExplorationProgress } from './components/ExplorationProgress';
import { InteractionPanel } from './components/InteractionPanel';
import { ControlPanel } from './components/ControlPanel';
import { LogViewer } from './components/LogViewer';

function App() {
  const {
    connectionStatus,
    setConnectionStatus,
    setCurrentScreenshot,
    setCurrentUrl,
    setCurrentTitle,
    setExplorationState,
    setProgressStats,
    setCurrentAIQuestion,
    addLog,
  } = useAppStore();

  // Initialize WebSocket connection
  useEffect(() => {
    // Set up WebSocket event listeners
    wsClient.onStatusChange(setConnectionStatus);

    // Subscribe to messages
    wsClient.on('screenshot_update', (payload) => {
      setCurrentScreenshot(payload.screenshot);
      setCurrentUrl(payload.url);
      setCurrentTitle(payload.title);
    });

    wsClient.on('exploration_progress', (payload) => {
      setProgressStats(payload.stats);
    });

    wsClient.on('ai_question', (payload) => {
      setCurrentAIQuestion({
        id: payload.id,
        question: payload.question,
        type: payload.type,
        options: payload.options,
        screenshot: payload.screenshot,
        timestamp: new Date(payload.timestamp),
      });
    });

    wsClient.on('state_change', (payload) => {
      setExplorationState(payload.state);
      addLog({
        level: 'info',
        message: `Exploration state changed to: ${payload.state}`,
      });
    });

    wsClient.on('log', (payload) => {
      addLog({
        level: payload.level,
        message: payload.message,
        details: payload.details,
      });
    });

    wsClient.on('error', (payload) => {
      addLog({
        level: 'error',
        message: payload.message,
        details: payload.details,
      });
    });

    // Connect to WebSocket server (uncomment when backend is ready)
    // wsClient.connect();

    return () => {
      wsClient.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <span className="text-2xl">🤖</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">AutoDoc Agent</h1>
              <p className="text-sm text-blue-100">AI-Powered User Manual Generator</p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-green-400 animate-pulse'
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              ></div>
              <span className="text-sm font-medium capitalize">{connectionStatus}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Control + Progress */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <ControlPanel />
            <div className="h-[600px]">
              <ExplorationProgress />
            </div>
          </div>

          {/* Center Column - Browser Preview */}
          <div className="col-span-12 lg:col-span-6">
            <BrowserPreview />
          </div>

          {/* Right Column - Interaction + Logs */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <div className="h-[400px]">
              <InteractionPanel />
            </div>
            <div className="h-[400px]">
              <LogViewer />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-4 mt-8">
        <div className="container mx-auto px-6 text-center text-sm">
          <p>AutoDoc Agent v1.0 • Built with React, TypeScript & Tailwind CSS</p>
          <p className="text-gray-400 mt-1">
            Real-time browser automation • AI-powered documentation • Google Docs integration
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
