/**
 * Interaction Panel Component
 * Task 6.4: AI-Human interaction interface
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { marked } from 'marked';

export const InteractionPanel: React.FC = () => {
  const {
    currentAIQuestion,
    setCurrentAIQuestion,
    messages,
    addMessage,
    explorationState,
  } = useAppStore();

  const [humanInput, setHumanInput] = useState('');
  const [aiQuestionAnswer, setAIQuestionAnswer] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle AI question response
  const handleAIQuestionSubmit = (action: 'answer' | 'skip' | 'demonstrate') => {
    if (action === 'answer' && !aiQuestionAnswer.trim()) return;

    addMessage({
      type: 'human',
      content: action === 'answer' ? aiQuestionAnswer : `[${action.toUpperCase()}]`,
    });

    // TODO: Send to backend via WebSocket
    setCurrentAIQuestion(null);
    setAIQuestionAnswer('');
  };

  // Handle human question
  const handleHumanQuestionSubmit = () => {
    if (!humanInput.trim()) return;

    addMessage({
      type: 'human',
      content: humanInput,
    });

    // TODO: Send to backend via WebSocket
    setHumanInput('');
  };

  // Render message with markdown support
  const renderMessage = (content: string, isMarkdown: boolean = false) => {
    if (isMarkdown) {
      return <div dangerouslySetInnerHTML={{ __html: marked(content) }} />;
    }
    return <div>{content}</div>;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4">
        <h2 className="text-xl font-bold">Interaction Panel</h2>
        <p className="text-sm text-purple-100 mt-1">AI ↔ Human Collaboration</p>
      </div>

      {/* AI Question Section */}
      {currentAIQuestion && (
        <div className="p-4 bg-blue-50 border-b border-blue-200">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              AI
            </div>
            <div className="flex-1">
              <div className="font-semibold text-blue-900 mb-2">{currentAIQuestion.question}</div>

              {/* Screenshot if available */}
              {currentAIQuestion.screenshot && (
                <img
                  src={`data:image/png;base64,${currentAIQuestion.screenshot}`}
                  alt="Context"
                  className="rounded border mb-3 max-w-sm"
                />
              )}

              {/* Choice options */}
              {currentAIQuestion.type === 'choice' && currentAIQuestion.options && (
                <div className="space-y-2 mb-3">
                  {currentAIQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => setAIQuestionAnswer(option)}
                      className={`block w-full text-left px-4 py-2 rounded border transition-colors ${
                        aiQuestionAnswer === option
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white hover:bg-blue-50 border-gray-300'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {/* Text input */}
              {currentAIQuestion.type === 'fill_in' && (
                <input
                  type="text"
                  value={aiQuestionAnswer}
                  onChange={(e) => setAIQuestionAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full px-4 py-2 border rounded mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}

              {/* Action buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={() => handleAIQuestionSubmit('answer')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Submit Answer
                </button>
                {currentAIQuestion.type === 'demonstration' && (
                  <button
                    onClick={() => handleAIQuestionSubmit('demonstrate')}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    Start Demonstration
                  </button>
                )}
                <button
                  onClick={() => handleAIQuestionSubmit('skip')}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Start a conversation with the AI</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'human' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-lg ${
                    message.type === 'human'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-900'
                  }`}
                >
                  {renderMessage(message.content, message.isMarkdown)}
                  <div className={`text-xs mt-1 ${message.type === 'human' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Human Input Section */}
      <div className="p-4 bg-gray-50 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={humanInput}
            onChange={(e) => setHumanInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleHumanQuestionSubmit()}
            placeholder="Ask a question or provide instructions..."
            className="flex-1 px-4 py-2 border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            disabled={explorationState !== 'running' && explorationState !== 'paused'}
          />
          <button
            onClick={handleHumanQuestionSubmit}
            disabled={!humanInput.trim() || (explorationState !== 'running' && explorationState !== 'paused')}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Press Enter to send • Markdown supported
        </div>
      </div>
    </div>
  );
};
