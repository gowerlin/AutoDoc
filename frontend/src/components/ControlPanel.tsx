/**
 * Control Panel Component
 * Task 6.5: Exploration control interface
 */

import React, { useState } from 'react';
import { useAppStore } from '../store';

export const ControlPanel: React.FC = () => {
  const {
    config,
    setConfig,
    explorationState,
    setExplorationState,
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);

  // Handle start exploration
  const handleStart = () => {
    if (!config.entryUrl) {
      alert('Please enter an entry URL');
      return;
    }
    // TODO: Send start command via WebSocket
    setExplorationState('running');
  };

  // Handle pause
  const handlePause = () => {
    // TODO: Send pause command via WebSocket
    setExplorationState('paused');
  };

  // Handle resume
  const handleResume = () => {
    // TODO: Send resume command via WebSocket
    setExplorationState('running');
  };

  // Handle stop
  const handleStop = () => {
    // TODO: Send stop command via WebSocket
    setExplorationState('idle');
  };

  // Handle export
  const handleExport = () => {
    // TODO: Trigger export to Google Docs
    alert('Export feature will be implemented with backend integration');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4">
        <h2 className="text-xl font-bold">Control Panel</h2>
        <p className="text-sm text-green-100 mt-1">Configure and control exploration</p>
      </div>

      {/* Main Controls */}
      <div className="p-6 space-y-4">
        {/* Entry URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entry URL *
          </label>
          <input
            type="url"
            value={config.entryUrl}
            onChange={(e) => setConfig({ entryUrl: e.target.value })}
            placeholder="https://example.com"
            className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
            disabled={explorationState === 'running'}
          />
        </div>

        {/* Quick Settings */}
        <div className="grid grid-cols-2 gap-4">
          {/* Max Depth */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Depth
            </label>
            <input
              type="number"
              value={config.maxDepth}
              onChange={(e) => setConfig({ maxDepth: parseInt(e.target.value) })}
              min="1"
              max="10"
              className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
              disabled={explorationState === 'running'}
            />
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Strategy
            </label>
            <select
              value={config.strategy}
              onChange={(e) => setConfig({ strategy: e.target.value as any })}
              className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
              disabled={explorationState === 'running'}
            >
              <option value="importance">Importance-First</option>
              <option value="bfs">Breadth-First (BFS)</option>
              <option value="dfs">Depth-First (DFS)</option>
            </select>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex space-x-2 pt-4">
          {explorationState === 'idle' && (
            <button
              onClick={handleStart}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
            >
              🚀 Start Exploration
            </button>
          )}

          {explorationState === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="flex-1 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold"
              >
                ⏸️ Pause
              </button>
              <button
                onClick={handleStop}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                ⏹️ Stop
              </button>
            </>
          )}

          {explorationState === 'paused' && (
            <>
              <button
                onClick={handleResume}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                ▶️ Resume
              </button>
              <button
                onClick={handleStop}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                ⏹️ Stop
              </button>
            </>
          )}
        </div>

        {/* Secondary Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm"
          >
            ⚙️ Advanced Settings
          </button>
          <button
            onClick={handleExport}
            disabled={explorationState !== 'completed'}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
          >
            📄 Export Manual
          </button>
        </div>

        {/* Advanced Settings */}
        {showSettings && (
          <div className="pt-4 border-t space-y-4">
            <h3 className="font-semibold text-gray-900">Advanced Settings</h3>

            {/* Screenshot Quality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Screenshot Quality
              </label>
              <select
                value={config.screenshotQuality}
                onChange={(e) => setConfig({ screenshotQuality: e.target.value as any })}
                className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Google Docs Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Google Docs Title
              </label>
              <input
                type="text"
                value={config.googleDocsTitle}
                onChange={(e) => setConfig({ googleDocsTitle: e.target.value })}
                placeholder="User Manual"
                className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* Share Emails */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Share With (emails, comma-separated)
              </label>
              <input
                type="text"
                value={config.shareEmails.join(', ')}
                onChange={(e) =>
                  setConfig({
                    shareEmails: e.target.value.split(',').map((email) => email.trim()).filter(Boolean),
                  })
                }
                placeholder="user@example.com, team@example.com"
                className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
