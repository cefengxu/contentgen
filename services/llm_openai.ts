import { GenerationOptions } from '../types';
import { buildArticleSystemInstruction } from './articleSystemInstruction';

/** 从环境变量读取的 LLM 配置 */
const getApiConfig = () => {
  const baseUrl = (process.env.LLM_API_BASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.LLM_API_KEY || '';
  const model = process.env.LLM_MODEL || 'gpt-3.5-turbo';
  if (!baseUrl || !apiKey) {
    throw new Error('请在 .env 或环境变量中配置 LLM_API_BASE_URL 和 LLM_API_KEY');
  }
  return { baseUrl, apiKey, model };
};

/** OpenAI Chat Completions 请求体 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
}

/** 非流式响应 */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role: string; content: string };
    delta?: { content?: string };
  }>;
  error?: { message: string; code?: string };
}

const chatCompletions = async (messages: ChatMessage[], stream = false): Promise<string> => {
  const { baseUrl, apiKey, model } = getApiConfig();
  const url = `${baseUrl}/v1/chat/completions`;
  const body: ChatCompletionRequest = { model, messages, stream };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as ChatCompletionResponse;
  if (data.error) {
    throw new Error(data.error.message || `API Error: ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  const text = data.choices?.[0]?.message?.content ?? '';
  return text;
};

/**
 * 根据检索结果生成文章(OpenAI Chat Completions 兼容)
 */
export const generateArticle = async (
  keyword: string,
  rawData: string,
  options: GenerationOptions
): Promise<string> => {
  const systemInstruction = buildArticleSystemInstruction(rawData, options);
  const userContent = `话题关键词:${keyword}。请严格按风格 {{文章风格}} 和读者人群 {{读者人群}} 生成 Markdown 正文。`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userContent },
  ];
  return chatCompletions(messages);
};

export interface ChatSession {
  sendMessage: (params: { message: string }) => Promise<{ text: string }>;
}

/**
 * 创建基于上下文的对话会话(OpenAI 兼容,维护历史消息)
 */
export const createChatSession = (keyword: string, context: string): ChatSession => {
  const systemContent = `你是"${keyword}"话题的专业助手。你只能基于以下背景信息回答问题:\n${context}\n严禁引入外部知识。回答需简洁。如果信息中未提及,请如实告知。`;
  const history: ChatMessage[] = [{ role: 'system', content: systemContent }];

  return {
    async sendMessage({ message }: { message: string }): Promise<{ text: string }> {
      history.push({ role: 'user', content: message });
      const text = await chatCompletions(history);
      history.push({ role: 'assistant', content: text });
      return { text };
    },
  };
};
