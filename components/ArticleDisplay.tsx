
import React from 'react';
import { SearchResult } from '../types';

interface ArticleDisplayProps {
  content: string;
  sources: SearchResult[];
}

const ArticleDisplay: React.FC<ArticleDisplayProps> = ({ content, sources }) => {
  // Extract content after Front-matter if present
  const renderContent = content.replace(/^---[\s\S]*?---/, '').trim();
  
  // Try to find the title from Front-matter for display
  const titleMatch = content.match(/title:\s*(.*)/);
  const displayTitle = titleMatch ? titleMatch[1].trim() : '';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-10 max-w-4xl mx-auto mt-8 transition-all">
      {displayTitle && (
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 border-b border-gray-50 pb-6">
          {displayTitle}
        </h2>
      )}
      
      <div className="prose prose-indigo max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
        {renderContent}
      </div>

      {sources.length > 0 && (
        <div className="mt-12 pt-8 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">溯源链接</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sources.map((source, index) => (
              <li key={index} className="group">
                <a
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-2"
                >
                  <span className="w-4 h-4 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] group-hover:bg-indigo-100">
                    {index + 1}
                  </span>
                  <span className="truncate">{source.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ArticleDisplay;
