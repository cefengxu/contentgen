import { GoogleGenAI } from '@google/genai';
import type { GenerationOptions } from '../types';
import { buildArticleSystemInstruction, getArticleMaxOutputTokens } from './articleSystemInstruction';
import { buildTranslateSystemInstruction } from './translateSystemInstruction';

/**
 * 按照官方示例：const ai = new GoogleGenAI({});
 * 但浏览器环境需要显式传入 apiKey,因为无法访问 process.env
 */
const getGeminiConfig = () => {
  const apiKey = process.env.GOOGLE_API_KEY || '';
  const model = process.env.GOOGLE_MODEL || 'gemini-1.5-flash';
  
  if (!apiKey) {
    throw new Error('请在 .env.local 或环境变量中配置 GOOGLE_API_KEY');
  }
  
  if (process.env.GEMINI_DEBUG === '1') {
    console.log('[Gemini Debug] 配置信息:', {
      model,
      apiKey: apiKey.slice(0, 10) + '...',
    });
  }
  
  return { apiKey, model };
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
  const { apiKey, model } = getGeminiConfig();
  const ai = new GoogleGenAI({ apiKey });

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
  const { apiKey, model } = getGeminiConfig();
  const ai = new GoogleGenAI({ apiKey });

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
export const chatCompletions = async (
  messages: ChatMessage[],
  generation?: { maxOutputTokens?: number }
): Promise<string> => {
  const { apiKey, model } = getGeminiConfig();
  const ai = new GoogleGenAI({ apiKey });

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

  const config: { systemInstruction?: string; maxOutputTokens?: number } = {};
  if (systemParts.length > 0) {
    config.systemInstruction = systemParts.join('\n\n');
  }
  if (generation?.maxOutputTokens != null) {
    config.maxOutputTokens = generation.maxOutputTokens;
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
  const userContent = `话题关键词:${keyword}。请严格按风格 {{文章风格}} 和读者人群 {{读者人群}} 生成 Markdown 正文;**汉字总字数(含标点)须符合系统指令中的 {{文章长度}}**,长稿档位不得写成短文。`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userContent },
  ];
  return chatCompletions(messages, { maxOutputTokens: getArticleMaxOutputTokens(options.length) });
};

/**
 * 翻译原文并生成文章(Gemini 非流式),风格固定为农夫山泉,无读者/长度/风格参数
 */
export const translateArticle = async (
  rawData: string,
): Promise<string> => {
  const systemInstruction = buildTranslateSystemInstruction(rawData);
  const userContent = '请严格按上述风格要求,将抓取内容翻译并整理为 Markdown 正文。';

  const messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userContent },
  ];
  return chatCompletions(messages);
};

/**
 * 标题及关键字元信息
 */
export interface GeneratedTitleMeta {
  title: string;
  keywords: string[];
}

/**
 * 根据已生成的文章正文,生成一个适合微信公众号的标题 + 3-5 个文章关键字。
 * 返回结构化结果,方便上层分别使用标题与关键字。
 */
export const generateTitleAndKeywords = async (articleContent: string): Promise<GeneratedTitleMeta> => {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是一位深谙爆款逻辑的微信公众号主编兼选题编辑。' +
        '请根据文章正文,同时生成一个“标题党”标题和 3-5 个概括文章核心内容的中文关键字。\n\n' +
        '返回格式必须是严格的 JSON,对象结构为：' +
        '{"title": "标题文本", "keywords": ["关键字1","关键字2","关键字3"]}。\n\n' +
        '【标题要求】\n' +
        '- 字数严格控制在 10-20 字之间；\n' +
        '- 不使用引号、书名号或任何成对的标点符号包裹标题；\n' +
        '- 只输出标题文本,不要任何解释；\n' +
        '- 风格抓人眼球、直击人性,兼顾信息密度。\n\n' +
        '【关键字要求】\n' +
        '- keywords 必须是一个数组；\n' +
        '- 每个元素是简短的中文词语或短语（2-8 个字）,用于描述主题、技术、场景或人群；\n' +
        '- 不要带 #、不带书名号/引号；\n' +
        '- 建议 3-5 个；\n' +
        '- 只在 JSON 的 keywords 字段中给出,不要在 JSON 外重复输出。',
    },
    {
      role: 'user',
      content: `请根据以下文章正文生成标题和关键字（仅按上面要求返回 JSON）：\n\n${articleContent.slice(0, 1500)}`,
    },
  ];

  const raw = await chatCompletions(messages);

  try {
    const data = JSON.parse(raw) as { title?: string; keywords?: unknown };
    const title = (data.title ?? '').toString().trim();
    const kwRaw = Array.isArray(data.keywords) ? data.keywords : [];
    const keywords = kwRaw
      .map((k) => (k ?? '').toString().trim())
      .filter((k) => k.length > 0);

    if (!title) {
      throw new Error('empty title from JSON');
    }

    return { title, keywords };
  } catch {
    // 解析失败时退化为仅生成标题,不影响现有逻辑
    const fallbackTitle = await generateTitle(articleContent);
    return { title: fallbackTitle, keywords: [] };
  }
};

/**
 * 兼容旧接口：只返回标题文本
 */
export const generateTitle = async (articleContent: string): Promise<string> => {
  const meta = await generateTitleAndKeywords(articleContent);
  return meta.title;
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
