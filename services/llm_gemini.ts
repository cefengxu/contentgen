import { GoogleGenAI } from '@google/genai';
import type { GenerationOptions } from '../types';
import { buildArticleSystemInstruction } from './articleSystemInstruction';

/** 从环境变量读取的 Gemini 配置(支持智增增:base_url + api_key) */
const getGeminiConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const baseUrl = (process.env.LLM_GEMINI_API_BASE_URL || '').replace(/\/$/, '');
  if (!apiKey) {
    throw new Error('请在 .env 或环境变量中配置 GEMINI_API_KEY');
  }
  return { apiKey, model, baseUrl: baseUrl || undefined };
};

/** 与 llm_openai.ts 一致的对话消息格式(用于 chatCompletions) */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 单轮文本生成(非流式、无思考模式)
 * @param contents 用户输入文本
 * @returns 模型生成的文本
 */
export const generateContent = async (contents: string): Promise<string> => {
  const { apiKey, model, baseUrl } = getGeminiConfig();
  const ai = new GoogleGenAI({
    apiKey,
    ...(baseUrl && { httpOptions: { baseUrl } }),
  });

  const response = await ai.models.generateContent({
    model,
    contents,
  });

  const text = response.text ?? '';
  return text;
};

/**
 * 文档解析:根据 PDF 下载链接与用户 prompt,使用 Gemini 解析 PDF 并返回文本结果。
 * 仅 Gemini 支持;OpenAI 不支持。
 * @param pdfUrl PDF 的下载链接(由用户提供)
 * @param prompt 用户输入的解析指令(如「总结这份文档」)
 */
export const parseDocument = async (pdfUrl: string, prompt: string): Promise<string> => {
  const { apiKey, model, baseUrl } = getGeminiConfig();
  const ai = new GoogleGenAI({
    apiKey,
    ...(baseUrl && { httpOptions: { baseUrl } }),
  });

  const pdfResp = await fetch(pdfUrl).then((r) => r.arrayBuffer());
  const dataBase64 = Buffer.from(pdfResp).toString('base64');

  const contents = [
    { text: prompt },
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: dataBase64,
      },
    },
  ];

  const response = await ai.models.generateContent({
    model,
    contents,
  });

  return response.text ?? '';
};

/**
 * 多轮对话补全(非流式、无思考模式)
 * 将 system/user/assistant 消息转为 Gemini 的 systemInstruction + contents 调用
 */
export const chatCompletions = async (messages: ChatMessage[]): Promise<string> => {
  const { apiKey, model, baseUrl } = getGeminiConfig();
  const ai = new GoogleGenAI({
    apiKey,
    ...(baseUrl && { httpOptions: { baseUrl } }),
  });

  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }

  const config: { systemInstruction?: string } = {};
  if (systemParts.length > 0) {
    config.systemInstruction = systemParts.join('\n\n');
  }

  const response = await ai.models.generateContent({
    model,
    contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: '' }] }],
    config,
  });

  return response.text ?? '';
}

/**
 * 根据检索结果生成文章(Gemini 非流式)
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

export interface GeminiChatSession {
  sendMessage: (params: { message: string }) => Promise<{ text: string }>;
}

/**
 * 创建基于上下文的对话会话(Gemini,维护历史消息)
 */
export const createChatSession = (keyword: string, context: string): GeminiChatSession => {
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
