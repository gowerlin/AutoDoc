/**
 * Exploration Progress Visualization
 * Task 6.3: Display exploration tree and statistics
 */

import React, { useMemo } from 'react';
import { useAppStore, ExplorationNode } from '../store';

export const ExplorationProgress: React.FC = () => {
  const {
    explorationTree,
    progressStats,
    explorationState,
    selectedNode,
    setSelectedNode,
  } = useAppStore();

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (progressStats.totalPages === 0) return 0;
    return Math.round((progressStats.exploredPages / progressStats.totalPages) * 100);
  }, [progressStats]);

  // Render tree node recursively
  const renderTreeNode = (node: ExplorationNode, level: number = 0): React.ReactNode => {
    const statusIcons = {
      completed: '✅',
      in_progress: '🔄',
      pending: '⏳',
      error: '❌',
    };

    const statusColors = {
      completed: 'text-green-600 bg-green-50',
      in_progress: 'text-blue-600 bg-blue-50',
      pending: 'text-gray-600 bg-gray-50',
      error: 'text-red-600 bg-red-50',
    };

    const isSelected = selectedNode === node.id;

    return (
      <div key={node.id} className="relative">
        {/* Node */}
        <div
          className={`flex items-start space-x-2 py-2 px-3 rounded cursor-pointer transition-colors ${
            isSelected ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'
          }`}
          style={{ marginLeft: `${level * 24}px` }}
          onClick={() => setSelectedNode(node.id)}
        >
          {/* Status Icon */}
          <span className={`text-lg ${statusColors[node.status]}`}>
            {statusIcons[node.status]}
          </span>

          {/* Node Info */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{node.title || 'Untitled'}</div>
            <div className="text-xs text-gray-500 truncate">{node.url}</div>
            <div className="text-xs text-gray-400 mt-1">
              Depth: {node.depth} • Children: {node.children.length}
            </div>
          </div>

          {/* Expand/Collapse */}
          {node.children.length > 0 && (
            <button className="p-1 hover:bg-gray-200 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Children */}
        {node.children.length > 0 && (
          <div className="mt-1">
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
        <h2 className="text-xl font-bold">Exploration Progress</h2>
        <p className="text-sm text-blue-100 mt-1">Real-time exploration tracking</p>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 bg-gray-50 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-bold text-blue-600">{progressPercentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          >
            {progressPercentage > 0 && (
              <div className="h-full w-full flex items-center justify-end pr-2">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b bg-gray-50">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{progressStats.exploredPages}</div>
          <div className="text-xs text-gray-600 mt-1">Explored</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{progressStats.pendingPages}</div>
          <div className="text-xs text-gray-600 mt-1">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{progressStats.errorPages}</div>
          <div className="text-xs text-gray-600 mt-1">Errors</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 py-3 border-b bg-gray-50">
        <div className="text-center">
          <div className="text-lg font-semibold text-purple-600">{progressStats.generatedSections}</div>
          <div className="text-xs text-gray-600">Sections Generated</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-orange-600">{progressStats.estimatedTimeRemaining}</div>
          <div className="text-xs text-gray-600">Time Remaining</div>
        </div>
      </div>

      {/* Exploration State Badge */}
      <div className="px-6 py-3 border-b">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Status:</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              explorationState === 'running'
                ? 'bg-green-100 text-green-800'
                : explorationState === 'paused'
                ? 'bg-yellow-100 text-yellow-800'
                : explorationState === 'completed'
                ? 'bg-blue-100 text-blue-800'
                : explorationState === 'error'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {explorationState.charAt(0).toUpperCase() + explorationState.slice(1)}
          </span>
        </div>
      </div>

      {/* Exploration Tree */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          Exploration Tree
        </h3>

        {explorationTree ? (
          <div className="space-y-1">{renderTreeNode(explorationTree)}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm font-medium">No exploration data</p>
            <p className="text-xs mt-1">Start exploration to see the tree</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 py-3 bg-gray-50 border-t text-xs">
        <div className="flex items-center justify-between text-gray-600">
          <span className="flex items-center"><span className="mr-1">✅</span> Completed</span>
          <span className="flex items-center"><span className="mr-1">🔄</span> In Progress</span>
          <span className="flex items-center"><span className="mr-1">⏳</span> Pending</span>
          <span className="flex items-center"><span className="mr-1">❌</span> Error</span>
        </div>
      </div>
    </div>
  );
};
