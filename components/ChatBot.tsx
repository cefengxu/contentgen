
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, LLMProvider } from '../types';
import { createChatSession } from '../services/llm';
import { createChatSession as createChatSessionGemini } from '../services/llm_gemini';

interface ChatBotProps {
  keyword: string;
  context: string;
  provider?: LLMProvider;
}

const ChatBot: React.FC<ChatBotProps> = ({ keyword, context, provider = 'OpenAI' }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (context && keyword) {
      chatRef.current = provider === 'Gemini'
        ? createChatSessionGemini(keyword, context)
        : createChatSession(keyword, context);
    }
  }, [context, keyword, provider]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || !chatRef.current) return;

    const userMsg = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const result = await chatRef.current.sendMessage({ message: userMsg });
      setMessages(prev => [...prev, { role: 'model', text: result.text || '无法回答此问题。' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: '抱歉,连接出现了一点问题。' }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!context) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 md:w-96 h-[500px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
            <h3 className="font-semibold">关于 {keyword} 的探讨</h3>
            <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 rounded p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm mt-10 px-4">
                您可以针对文章中提到的全球事实向我提问。
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-400 p-3 rounded-2xl border border-gray-200 text-xs animate-pulse">
                  正在思考...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-200 flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="问问更多细节..."
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <button
              onClick={handleSend}
              className="bg-blue-600 text-white rounded-full p-2 hover:bg-blue-700 disabled:opacity-50"
              disabled={isTyping || !inputValue.trim()}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white rounded-full p-4 shadow-xl hover:bg-blue-700 transition-all transform hover:scale-105 active:scale-95"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ChatBot;
