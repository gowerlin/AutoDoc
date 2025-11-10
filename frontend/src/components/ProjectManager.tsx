/**
 * Project Manager Component
 * Task 8.7: 專案快照管理介面
 */

import React, { useState, useEffect } from 'react';

interface Snapshot {
  id: string;
  name: string;
  version: string;
  createdAt: Date;
  size: number;
  tags: string[];
}

interface ComparisonResult {
  snapshot1: string;
  snapshot2: string;
  totalChanges: number;
  severity: {
    critical: number;
    major: number;
    minor: number;
  };
  recommendedStrategy: string;
}

export const ProjectManager: React.FC = () => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedSnapshots, setSelectedSnapshots] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'compare' | 'report'>('list');

  // Mock data for demonstration
  useEffect(() => {
    // TODO: Fetch snapshots from backend
    setSnapshots([
      {
        id: 'snap-1',
        name: 'Baseline Version',
        version: '1.0.0',
        createdAt: new Date('2025-01-01'),
        size: 45600000,
        tags: ['baseline', 'production'],
      },
      {
        id: 'snap-2',
        name: 'Feature Update',
        version: '1.1.0',
        createdAt: new Date('2025-02-01'),
        size: 48200000,
        tags: ['feature', 'staging'],
      },
      {
        id: 'snap-3',
        name: 'Latest',
        version: '1.2.0',
        createdAt: new Date('2025-03-01'),
        size: 50100000,
        tags: ['latest'],
      },
    ]);
  }, []);

  const handleSelectSnapshot = (id: string) => {
    if (selectedSnapshots.includes(id)) {
      setSelectedSnapshots(selectedSnapshots.filter((s) => s !== id));
    } else if (selectedSnapshots.length < 2) {
      setSelectedSnapshots([...selectedSnapshots, id]);
    }
  };

  const handleCompare = async () => {
    if (selectedSnapshots.length !== 2) {
      alert('Please select exactly 2 snapshots to compare');
      return;
    }

    setLoading(true);
    setActiveTab('compare');

    // TODO: Call backend API
    setTimeout(() => {
      setComparisonResult({
        snapshot1: selectedSnapshots[0],
        snapshot2: selectedSnapshots[1],
        totalChanges: 142,
        severity: {
          critical: 5,
          major: 23,
          minor: 114,
        },
        recommendedStrategy: 'Incremental Update',
      });
      setLoading(false);
    }, 1500);
  };

  const handleCreateSnapshot = () => {
    // TODO: Trigger snapshot creation
    alert('Create snapshot functionality will be integrated with backend');
  };

  const handleDeleteSnapshot = (id: string) => {
    if (confirm('Are you sure you want to delete this snapshot?')) {
      setSnapshots(snapshots.filter((s) => s.id !== id));
    }
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4">
        <h2 className="text-xl font-bold">Project Snapshots</h2>
        <p className="text-sm text-indigo-100 mt-1">Manage and compare project snapshots</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'list'
              ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Snapshots
        </button>
        <button
          onClick={() => setActiveTab('compare')}
          disabled={selectedSnapshots.length !== 2}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'compare'
              ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
              : selectedSnapshots.length === 2
              ? 'text-gray-600 hover:bg-gray-50'
              : 'text-gray-400 cursor-not-allowed'
          }`}
        >
          Compare {selectedSnapshots.length === 2 && '(2)'}
        </button>
        <button
          onClick={() => setActiveTab('report')}
          disabled={!comparisonResult}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'report'
              ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
              : comparisonResult
              ? 'text-gray-600 hover:bg-gray-50'
              : 'text-gray-400 cursor-not-allowed'
          }`}
        >
          Report
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Snapshot List Tab */}
        {activeTab === 'list' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-600">
                {selectedSnapshots.length > 0 && (
                  <span>{selectedSnapshots.length} selected</span>
                )}
              </div>
              <button
                onClick={handleCreateSnapshot}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                + Create Snapshot
              </button>
            </div>

            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedSnapshots.includes(snapshot.id)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                  onClick={() => handleSelectSnapshot(snapshot.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-semibold text-gray-900">{snapshot.name}</h3>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          v{snapshot.version}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                        <span>📅 {snapshot.createdAt.toLocaleDateString()}</span>
                        <span>💾 {formatBytes(snapshot.size)}</span>
                      </div>

                      {snapshot.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {snapshot.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      {selectedSnapshots.includes(snapshot.id) && (
                        <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSnapshot(snapshot.id);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedSnapshots.length === 2 && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleCompare}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  🔍 Compare Selected Snapshots
                </button>
              </div>
            )}
          </div>
        )}

        {/* Comparison Tab */}
        {activeTab === 'compare' && (
          <div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-gray-600">Comparing snapshots...</p>
              </div>
            ) : comparisonResult ? (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-blue-900 mb-4">Comparison Summary</h3>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Baseline</div>
                      <div className="font-medium text-blue-900">
                        {snapshots.find((s) => s.id === comparisonResult.snapshot1)?.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-blue-700 mb-1">Current</div>
                      <div className="font-medium text-blue-900">
                        {snapshots.find((s) => s.id === comparisonResult.snapshot2)?.name}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-sm text-blue-700 mb-2">Total Changes</div>
                    <div className="text-3xl font-bold text-blue-900">{comparisonResult.totalChanges}</div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Severity Breakdown</h3>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded">
                      <span className="font-medium text-red-900">Critical</span>
                      <span className="text-2xl font-bold text-red-700">{comparisonResult.severity.critical}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <span className="font-medium text-yellow-900">Major</span>
                      <span className="text-2xl font-bold text-yellow-700">{comparisonResult.severity.major}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded">
                      <span className="font-medium text-green-900">Minor</span>
                      <span className="text-2xl font-bold text-green-700">{comparisonResult.severity.minor}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-indigo-900 mb-2">Recommended Strategy</h3>
                  <p className="text-xl font-medium text-indigo-700">{comparisonResult.recommendedStrategy}</p>

                  <button
                    onClick={() => setActiveTab('report')}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm"
                  >
                    View Full Report →
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <p>Select 2 snapshots to compare</p>
              </div>
            )}
          </div>
        )}

        {/* Report Tab */}
        {activeTab === 'report' && comparisonResult && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Comparison Report</h3>

              <div className="prose max-w-none">
                <h4 className="text-md font-semibold text-gray-800 mt-4">Executive Summary</h4>
                <p className="text-sm text-gray-600">
                  This report details the differences between two project snapshots. A total of{' '}
                  <strong>{comparisonResult.totalChanges}</strong> changes were detected, including{' '}
                  <strong className="text-red-600">{comparisonResult.severity.critical} critical</strong>,{' '}
                  <strong className="text-yellow-600">{comparisonResult.severity.major} major</strong>, and{' '}
                  <strong className="text-green-600">{comparisonResult.severity.minor} minor</strong> changes.
                </p>

                <h4 className="text-md font-semibold text-gray-800 mt-6">Recommended Action</h4>
                <p className="text-sm text-gray-600">
                  Based on the analysis, the recommended update strategy is:{' '}
                  <strong>{comparisonResult.recommendedStrategy}</strong>
                </p>
              </div>

              <div className="mt-6 flex space-x-3">
                <button className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm">
                  📄 Export as Markdown
                </button>
                <button className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm">
                  🌐 Export as HTML
                </button>
                <button className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm">
                  📊 Export as JSON
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
