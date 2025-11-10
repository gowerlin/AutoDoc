/**
 * Browser Preview Component
 * Task 6.2: Real-time browser screenshot display
 */

import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

export const BrowserPreview: React.FC = () => {
  const {
    currentScreenshot,
    currentUrl,
    currentTitle,
    highlightedElement,
    isFullscreen,
    setIsFullscreen,
    zoom,
    setZoom,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle zoom
  const handleZoomIn = () => setZoom(Math.min(zoom + 0.1, 2));
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.1, 0.5));
  const handleZoomReset = () => setZoom(1);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [setIsFullscreen]);

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-lg shadow-lg overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      }`}
    >
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{currentTitle || 'No page loaded'}</div>
            <div className="text-xs text-gray-400 truncate">{currentUrl || ''}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2 ml-4">
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Zoom Out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-sm px-2">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Zoom In"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={handleZoomReset}
            className="p-2 hover:bg-gray-700 rounded transition-colors text-xs"
            title="Reset Zoom"
          >
            100%
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-gray-700 rounded transition-colors ml-2"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Screenshot Display */}
      <div className="relative bg-gray-900 overflow-auto" style={{ height: isFullscreen ? 'calc(100vh - 60px)' : '600px' }}>
        {currentScreenshot ? (
          <div className="relative inline-block min-w-full">
            <img
              src={`data:image/png;base64,${currentScreenshot}`}
              alt="Browser Screenshot"
              className="block"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            />

            {/* Highlighted Element Overlay */}
            {highlightedElement && (
              <div
                className="absolute border-4 border-red-500 bg-red-500 bg-opacity-10 pointer-events-none"
                style={{
                  left: `${highlightedElement.x * zoom}px`,
                  top: `${highlightedElement.y * zoom}px`,
                  width: `${highlightedElement.width * zoom}px`,
                  height: `${highlightedElement.height * zoom}px`,
                }}
              >
                <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Current Element
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <svg
                className="w-24 h-24 mx-auto mb-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <p className="text-lg font-medium">No screenshot available</p>
              <p className="text-sm mt-2">Start exploration to see browser preview</p>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-gray-100 px-4 py-2 text-xs text-gray-600 flex items-center justify-between border-t">
        <div className="flex items-center space-x-4">
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          {currentScreenshot && (
            <span className="text-green-600 flex items-center">
              <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
              Live
            </span>
          )}
        </div>
        <div className="text-gray-500">
          Press F11 for fullscreen • Scroll to pan
        </div>
      </div>
    </div>
  );
};
