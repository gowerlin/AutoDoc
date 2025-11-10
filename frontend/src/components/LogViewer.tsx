/**
 * Log Viewer Component
 * Task 6.6: Real-time log display with filtering
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, LogEntry } from '../store';

export const LogViewer: React.FC = () => {
  const { logs, clearLogs, logFilter, setLogFilter } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesFilter = logFilter === 'all' || log.level === logFilter;
    const matchesSearch = searchTerm === '' || log.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Export logs
  const handleExport = (format: 'txt' | 'json') => {
    const data = format === 'json'
      ? JSON.stringify(logs, null, 2)
      : logs.map((log) => `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}`).join('\n');

    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get log icon and color
  const getLogStyle = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return { icon: 'ℹ️', color: 'text-blue-600 bg-blue-50' };
      case 'warning':
        return { icon: '⚠️', color: 'text-yellow-600 bg-yellow-50' };
      case 'error':
        return { icon: '❌', color: 'text-red-600 bg-red-50' };
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-6 py-4">
        <h2 className="text-xl font-bold">Log Viewer</h2>
        <p className="text-sm text-gray-300 mt-1">Real-time system logs</p>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 bg-gray-50 border-b space-y-3">
        {/* Search and Filter */}
        <div className="flex space-x-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 px-4 py-2 border rounded focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
          />
          <select
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value as any)}
            className="px-4 py-2 border rounded focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <label className="flex items-center text-sm text-gray-700">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="mr-2"
              />
              Auto-scroll
            </label>
            <span className="text-sm text-gray-600">
              {filteredLogs.length} / {logs.length} logs
            </span>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => handleExport('txt')}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Export TXT
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Export JSON
            </button>
            <button
              onClick={clearLogs}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Logs Display */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-900 text-gray-100">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm font-medium">No logs to display</p>
            <p className="text-xs mt-1">Logs will appear here during exploration</p>
          </div>
        ) : (
          <>
            {filteredLogs.map((log) => {
              const style = getLogStyle(log.level);
              return (
                <div key={log.id} className="mb-2 p-2 rounded hover:bg-gray-800 transition-colors">
                  <div className="flex items-start space-x-2">
                    <span className={`flex-shrink-0 ${style.color} px-2 py-0.5 rounded text-xs font-semibold`}>
                      {style.icon} {log.level.toUpperCase()}
                    </span>
                    <span className="text-gray-400 flex-shrink-0 text-xs">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="flex-1 text-gray-200">{log.message}</span>
                  </div>
                  {log.details && (
                    <div className="mt-1 ml-24 text-xs text-gray-400 bg-gray-950 p-2 rounded overflow-x-auto">
                      <pre>{JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        Logs are retained for current session only
      </div>
    </div>
  );
};
