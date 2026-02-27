import { GenerationOptions } from '../types';
import { buildArticleSystemInstruction } from './articleSystemInstruction';
import { buildTranslateSystemInstruction } from './translateSystemInstruction';

/** 从环境变量读取的 OpenAI 兼容 API 配置（OPENAI_API_URL 为完整地址，无需拼接路径） */
const getApiConfig = () => {
  const apiUrl = (process.env.OPENAI_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY || '';
  const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
  if (!apiUrl || !apiKey) {
    throw new Error('请在 .env 或环境变量中配置 OPENAI_API_URL 和 OPENAI_API_KEY');
  }
  return { apiUrl, apiKey, model };
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
  const { apiUrl, apiKey, model } = getApiConfig();
  const body: ChatCompletionRequest = { model, messages, stream };

  const res = await fetch(apiUrl, {
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

/**
 * 翻译原文并生成文章(OpenAI 兼容)，风格固定为农夫山泉，无读者/长度/风格参数
 */
export const translateArticle = async (
  rawData: string,
): Promise<string> => {
  const systemInstruction = buildTranslateSystemInstruction(rawData);
  const userContent = '请严格按上述风格要求，将抓取内容翻译并整理为 Markdown 正文。';

  const messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userContent },
  ];
  return chatCompletions(messages);
};

/**
 * 根据已生成的文章正文，生成一个适合微信公众号的标题（单行纯文本，不含引号）
 */
export const generateTitle = async (articleContent: string): Promise<string> => {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一位深谙爆款逻辑的微信公众号主编。请根据文章正文，创作一个极其抓人眼球、直击人性、让人忍不住想点击的“标题党”标题。\n\n策略指南:- 制造反差:利用认知偏差或冲突，打破读者的思维惯性;- 利益钩子:明确展示读者能获得的价值、干货或避坑指南;- 情绪共鸣:精准戳中焦虑、好奇、愤怒或温情等情绪点;- 设置悬念:话留一半，或利用“为什么”、“竟然”引导探索欲;\n\n硬性约束:- 字数严格控制在 10-20 字之间;- 不使用引号、书名号或任何成对的标点符号包裹标题;- 严禁输出任何解释、分析或前缀，只输出标题文本;',    },
    {
      role: 'user',
      content: `请根据以下文章正文生成标题：\n\n${articleContent.slice(0, 1500)}`,
    },
  ];
  const raw = await chatCompletions(messages);
  return raw.trim().replace(/^["'「『【]|["'」』】]$/g, '');
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
