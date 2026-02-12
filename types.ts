
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

export interface GenerationOptions {
  audience: string;
  length: string;
  style: string;
  engine: SearchEngine;
}
