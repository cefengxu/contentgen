import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Content, GenerateContentConfig } from '@google/genai';
import type { GenerationOptions } from '../types';
import { buildArticleSystemInstruction } from './articleSystemInstruction';

/** 请求超时时间（毫秒），因反馈较慢设为 120 秒 */
const REQUEST_TIMEOUT_MS = 120 * 1000;

/** 开启后会在终端打印每次 Gemini 的请求信息，便于调试。设置 GEMINI_DEBUG=1 或 true */
const GEMINI_DEBUG = process.env.GEMINI_DEBUG === '1' || process.env.GEMINI_DEBUG === 'true';

/** 从环境变量读取的 Gemini 配置 */
const getGeminiConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
  const apiUrl = (process.env.GEMINI_API_URL || '').replace(/\/$/, '') || 'https://generativelanguage.googleapis.com/v1beta';
  if (!apiKey) {
    throw new Error('请在 .env 或环境变量中配置 GEMINI_API_KEY');
  }
  return { apiKey, model, apiUrl };
};

/** 创建 GoogleGenAI 客户端（使用环境变量中的 apiKey、可选 baseURL 与 timeout） */
function getClient(): GoogleGenAI {
  const { apiKey, apiUrl } = getGeminiConfig();
  const opts: { apiKey: string; baseURL?: string; timeout?: number } = {
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
  };
  const defaultBase = 'https://generativelanguage.googleapis.com';
  if (apiUrl && apiUrl !== defaultBase && !apiUrl.startsWith(defaultBase + '/')) {
    try {
      const u = new URL(apiUrl);
      opts.baseURL = u.origin;
    } catch {
      // 忽略无效 URL
    }
  }
  return new GoogleGenAI(opts);
}

/** 通用 generateContent 配置：Gemini 3 使用 thinkingLevel low 降低延迟，并把 HTTP 超时统一设为 120 秒 */
const defaultGenerateConfig: GenerateContentConfig = {
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  httpOptions: { timeout: REQUEST_TIMEOUT_MS },
};

/**
 * 使用 @google/genai SDK 调用 Gemini generateContent
 */
async function geminiGenerateContent(params: {
  model: string;
  contents: string | Content[];
  config?: GenerateContentConfig;
}): Promise<string> {
  const { model, apiUrl } = getGeminiConfig();
  const ai = getClient();

  if (GEMINI_DEBUG) {
    console.log('\n[Gemini 已调用] SDK generateContent');
    console.log('[Gemini]', `${apiUrl}/models/${model}:generateContent`);
    const contentsPreview = typeof params.contents === 'string'
      ? params.contents
      : JSON.stringify(params.contents.map((c) => ({ role: c.role, parts: c.parts?.length })));
    console.log('[Gemini contents]', contentsPreview.slice(0, 200) + (contentsPreview.length > 200 ? '...' : ''));
  }

  const config: GenerateContentConfig = {
    ...defaultGenerateConfig,
    ...params.config,
  };

  const response = await ai.models.generateContent({
    model,
    contents: params.contents,
    config,
  });

  return response.text ?? '';
}

/** 与 llm_openai.ts 一致的对话消息格式(用于 chatCompletions) */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 单轮文本生成(非流式、低思考等级)
 */
export const generateContent = async (contents: string): Promise<string> => {
  const { model } = getGeminiConfig();
  return geminiGenerateContent({ model, contents });
};

/**
 * 文档解析:根据 PDF 下载链接与用户 prompt,使用 Gemini 解析 PDF 并返回文本结果。
 * 仅 Gemini 支持;OpenAI 不支持。
 */
export const parseDocument = async (pdfUrl: string, prompt: string): Promise<string> => {
  const pdfResp = await fetch(pdfUrl).then((r) => r.arrayBuffer());
  const dataBase64 = Buffer.from(pdfResp).toString('base64');
  const { model } = getGeminiConfig();
  const ai = getClient();

  if (GEMINI_DEBUG) {
    const { apiUrl } = getGeminiConfig();
    console.log('\n[Gemini 已调用] parseDocument');
    console.log('[Gemini]', `${apiUrl}/models/${model}:generateContent`);
    console.log('[Gemini Body]', { prompt, inlineData: '<base64...>' });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'application/pdf', data: dataBase64 } },
        ],
      },
    ],
    config: defaultGenerateConfig,
  });

  return response.text ?? '';
};

/**
 * 多轮对话补全(非流式、低思考等级)
 * 使用 SDK：systemInstruction + contents
 */
export const chatCompletions = async (messages: ChatMessage[]): Promise<string> => {
  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }

  const { model } = getGeminiConfig();
  const config: GenerateContentConfig = {
    ...defaultGenerateConfig,
    ...(systemParts.length > 0 && { systemInstruction: systemParts.join('\n\n') }),
  };

  const effectiveContents = contents.length > 0 ? contents : [{ role: 'user' as const, parts: [{ text: '' }] }];
  return geminiGenerateContent({ model, contents: effectiveContents, config });
};

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
