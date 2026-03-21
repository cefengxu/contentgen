import { GenerationOptions } from '../types';
import { buildArticleSystemInstruction, getArticleMaxOutputTokens } from './articleSystemInstruction';
import { buildTranslateSystemInstruction } from './translateSystemInstruction';

/** 从环境变量读取的 OpenAI 兼容 API 配置（OPENAI_API_URL 为完整地址,无需拼接路径） */
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
  max_tokens?: number;
}

/** 非流式响应 */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role: string; content: string };
    delta?: { content?: string };
  }>;
  error?: { message: string; code?: string };
}

const chatCompletions = async (
  messages: ChatMessage[],
  stream = false,
  extra?: { max_tokens?: number }
): Promise<string> => {
  const { apiUrl, apiKey, model } = getApiConfig();
  const body: ChatCompletionRequest = { model, messages, stream, ...extra };

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
  const userContent = `话题关键词:${keyword}。请严格按风格 {{文章风格}} 和读者人群 {{读者人群}} 生成 Markdown 正文;**汉字总字数(含标点)须符合系统指令中的 {{文章长度}}**,长稿档位不得写成短文。`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userContent },
  ];
  return chatCompletions(messages, false, { max_tokens: getArticleMaxOutputTokens(options.length) });
};

/**
 * 翻译原文并生成文章(OpenAI 兼容),风格固定为农夫山泉,无读者/长度/风格参数
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
