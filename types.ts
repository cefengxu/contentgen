
export enum AppStatus {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface SearchResult {
  title: string;
  uri: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ArticleData {
  title: string;
  content: string;
  sources: SearchResult[];
}

export type SearchEngine = 'Tavily' | 'Exa';

/** 可选的大模型提供商（文章生成与对话共用） */
export type LLMProvider = 'OpenAI' | 'Gemini';

export interface GenerationOptions {
  audience: string;
  length: string;
  style: string;
  engine: SearchEngine;
  provider?: LLMProvider;
}
