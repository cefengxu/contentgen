import path from 'path';
import fs from 'fs';
import type { LLMProvider, SearchEngine, GenerationOptions } from '../types';
import { fetchGlobalContext } from './search';
import { generateArticle as generateArticleOpenAI, translateArticle as translateArticleOpenAI, generateTitle as generateTitleOpenAI } from './llm_openai';
import { generateArticle as generateArticleGemini, translateArticle as translateArticleGemini, generateTitle as generateTitleGemini } from './llm_gemini';
import { publishWenyanBackground, type PublishResult } from '../server/publishWenyan';
import { createPageFromMarkdown, type NotionInsertResult } from '../server/notion';

/** 与 App.tsx 一致的读者人群预设 value */
const AUDIENCE_VALUES = [
  '泛科技读者, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气自然, 行话密度中',
  '资深工程师, 背景知识专业, 关注点优先级: 技术特性 > 如何实现, 语气冷静客观, 行话密度高',
  'K12教师(小学/初中/高中), 背景知识可覆盖入门到专业, 关注点优先级: 行业应用 > 技术特性, 语气亲切到专业均可, 行话密度低到中',
  '产品经理, 背景知识一般, 关注点优先级: 市场与生态 > 行业应用, 语气专业冷静, 行话密度中',
  '券商分析师, 背景知识专业, 关注点优先级: 市场与生态 > 合规与风险, 语气专业冷静, 行话密度中',
];
const STYLE_VALUES = ['科普+故事开场', '深度解析', '案例研究', '反转体(The Truth-Slapper)', '拆解体(The Dissector)', '破壳体(Shell-Breaker)', '半佛体(Banfo)'];
const LENGTH_VALUES = ['500-800', '≤500', '800-1200', '1600-2200'];

function getTimestamp(): string {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
}

function randomFilename(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0; i < 10; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${name}.md`;
}

export interface RunPipelineParams {
  /** 模型: OpenAI | Gemini，默认 Gemini */
  provider?: LLMProvider;
  /** 读者人群，需为预设 value 之一，不传则用默认 */
  audience?: string;
  /** 文章风格，需为预设 value 之一，不传则用默认 */
  style?: string;
  /** 目标长度，需为预设 value 之一，不传则用默认 */
  length?: string;
  /** 搜索引擎：网络搜索时使用，Tavily | Exa，默认 Tavily */
  engine?: SearchEngine;
  /** 话题关键词：与 rawText 二选一，网络搜索时必填 */
  keyword?: string;
  /** 原始文本：与 keyword 二选一，直接作为抓取内容生成文章 */
  rawText?: string;
  /** 翻译模式：传 true 且提供 rawText 时，使用固定农夫山泉风格翻译，忽略 audience/style/length */
  translate?: boolean;
  /** 发布到微信：可选，不传则不执行发布 */
  wechatAppId?: string;
  wechatAppSecret?: string;
  /** 推送到 Notion：可选，不传或缺任何一项则不执行推送 */
  notionApiKey?: string;
  notionDatabaseId?: string;
}

export interface RunPipelineResult {
  success: boolean;
  message: string;
  filename?: string;
  title?: string;
  publishResult?: PublishResult;
  notionResult?: NotionInsertResult;
}

/**
 * 执行完整流程：按参数获取内容 → 生成文章 → 保存 Markdown → 可选发布到微信。
 * 与前端「生文」弹窗中「开始检索并生成」+「确认发布到微信」行为一致。
 */
export async function runPipeline(params: RunPipelineParams): Promise<RunPipelineResult> {
  const provider = params.provider ?? 'Gemini';
  const audience = params.audience?.trim() && AUDIENCE_VALUES.includes(params.audience.trim())
    ? params.audience.trim()
    : AUDIENCE_VALUES[0];
  const style = params.style?.trim() && STYLE_VALUES.includes(params.style.trim())
    ? params.style.trim()
    : STYLE_VALUES[0];
  const length = params.length?.trim() && LENGTH_VALUES.includes(params.length.trim())
    ? params.length.trim()
    : LENGTH_VALUES[0];
  const engine = params.engine ?? 'Tavily';

  const rawTextInput = params.rawText?.trim();
  const keywordInput = params.keyword?.trim();

  if (rawTextInput && params.translate) {
    // 翻译模式：固定农夫山泉风格，忽略 audience/style/length
    return runTranslatePipeline({
      provider,
      rawText: rawTextInput,
      wechatAppId: params.wechatAppId,
      wechatAppSecret: params.wechatAppSecret,
      notionApiKey: params.notionApiKey,
      notionDatabaseId: params.notionDatabaseId,
    });
  }
  if (rawTextInput) {
    // 原文本生成文章
    return runRawTextPipeline({
      provider,
      audience,
      style,
      length,
      rawText: rawTextInput,
      wechatAppId: params.wechatAppId,
      wechatAppSecret: params.wechatAppSecret,
      notionApiKey: params.notionApiKey,
      notionDatabaseId: params.notionDatabaseId,
    });
  }
  if (keywordInput) {
    // 网络检索并生成
    return runSearchPipeline({
      provider,
      audience,
      style,
      length,
      engine,
      keyword: keywordInput,
      wechatAppId: params.wechatAppId,
      wechatAppSecret: params.wechatAppSecret,
      notionApiKey: params.notionApiKey,
      notionDatabaseId: params.notionDatabaseId,
    });
  }
  return {
    success: false,
    message: '请提供 keyword（网络搜索）或 rawText（原文本生成）之一',
  };
}

async function runSearchPipeline(opts: {
  provider: LLMProvider;
  audience: string;
  style: string;
  length: string;
  engine: SearchEngine;
  keyword: string;
  wechatAppId?: string;
  wechatAppSecret?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
}): Promise<RunPipelineResult> {
  const options: GenerationOptions = {
    audience: opts.audience,
    length: opts.length,
    style: opts.style,
    engine: opts.engine,
    provider: opts.provider,
  };

  const { text: rawData, sources } = await fetchGlobalContext(opts.keyword, opts.engine);
  if (!rawData?.trim()) {
    return { success: false, message: '未能获取到任何有效信息，请检查关键词或 API 额度。' };
  }

  const generatedContent = opts.provider === 'Gemini'
    ? await generateArticleGemini(opts.keyword, rawData, options)
    : await generateArticleOpenAI(opts.keyword, rawData, options);

  const articleTitle = await (opts.provider === 'Gemini'
    ? generateTitleGemini(generatedContent)
    : generateTitleOpenAI(generatedContent)).catch(() => getTimestamp());
  const coverCandidates = ['greencover.jpg', 'yellowcover.jpg', 'bluecover.jpg'];
  const randomCover = coverCandidates[Math.floor(Math.random() * coverCandidates.length)];
  const frontMatter = [
    '---',
    `title: ${articleTitle}`,
    'cover: /home/ubuntu/contentgen/medias/assets/' + randomCover,
    '---',
    '',
  ].join('\n');
  const finalContent = frontMatter + generatedContent.trimStart();

  const outputDir = path.join(__dirname, '..', 'medias', 'docs');
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = randomFilename();
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, finalContent, 'utf8');

  let publishResult: PublishResult | undefined;
  let notionResult: NotionInsertResult | undefined;
  if (opts.wechatAppId?.trim() && opts.wechatAppSecret?.trim()) {
    publishResult = publishWenyanBackground(filePath, {
      WECHAT_APP_ID: opts.wechatAppId.trim(),
      WECHAT_APP_SECRET: opts.wechatAppSecret.trim(),
    });
  }
  if (opts.notionApiKey?.trim() && opts.notionDatabaseId?.trim()) {
    try {
      notionResult = await createPageFromMarkdown(filePath, {
        apiKey: opts.notionApiKey.trim(),
        databaseId: opts.notionDatabaseId.trim(),
      });
    } catch (err: any) {
      notionResult = {
        success: false,
        message: err?.message || '推送到 Notion 失败',
      };
    }
  }

  return {
    success: true,
    message:
      '文章已生成并保存' +
      (publishResult ? '，已提交发布到微信' : '。未填写微信配置，未执行发布。') +
      (notionResult ? (notionResult.success ? '，已推送到 Notion。' : '，推送到 Notion 失败。') : ''),
    filename,
    title: articleTitle,
    publishResult,
    notionResult,
  };
}

async function runRawTextPipeline(opts: {
  provider: LLMProvider;
  audience: string;
  style: string;
  length: string;
  rawText: string;
  wechatAppId?: string;
  wechatAppSecret?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
}): Promise<RunPipelineResult> {
  const options: GenerationOptions = {
    audience: opts.audience,
    length: opts.length,
    style: opts.style,
    engine: 'Tavily',
    provider: opts.provider,
  };
  const usedKeyword = '原文本文章';

  const generatedContent = opts.provider === 'Gemini'
    ? await generateArticleGemini(usedKeyword, opts.rawText, options)
    : await generateArticleOpenAI(usedKeyword, opts.rawText, options);

  const articleTitle = await (opts.provider === 'Gemini'
    ? generateTitleGemini(generatedContent)
    : generateTitleOpenAI(generatedContent)).catch(() => getTimestamp());
  const coverCandidates = ['greencover.jpg', 'yellowcover.jpg', 'bluecover.jpg'];
  const randomCover = coverCandidates[Math.floor(Math.random() * coverCandidates.length)];
  const frontMatter = [
    '---',
    `title: ${articleTitle}`,
    'cover: /home/ubuntu/contentgen/medias/assets/' + randomCover,
    '---',
    '',
  ].join('\n');
  const finalContent = frontMatter + generatedContent.trimStart();

  const outputDir = path.join(__dirname, '..', 'medias', 'docs');
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = randomFilename();
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, finalContent, 'utf8');

  let publishResult: PublishResult | undefined;
  let notionResult: NotionInsertResult | undefined;
  if (opts.wechatAppId?.trim() && opts.wechatAppSecret?.trim()) {
    publishResult = publishWenyanBackground(filePath, {
      WECHAT_APP_ID: opts.wechatAppId.trim(),
      WECHAT_APP_SECRET: opts.wechatAppSecret.trim(),
    });
  }
  if (opts.notionApiKey?.trim() && opts.notionDatabaseId?.trim()) {
    try {
      notionResult = await createPageFromMarkdown(filePath, {
        apiKey: opts.notionApiKey.trim(),
        databaseId: opts.notionDatabaseId.trim(),
      });
    } catch (err: any) {
      notionResult = {
        success: false,
        message: err?.message || '推送到 Notion 失败',
      };
    }
  }

  return {
    success: true,
    message:
      '文章已生成并保存' +
      (publishResult ? '，已提交发布到微信' : '。未填写微信配置，未执行发布。') +
      (notionResult ? (notionResult.success ? '，已推送到 Notion。' : '，推送到 Notion 失败。') : ''),
    filename,
    title: articleTitle,
    publishResult,
    notionResult,
  };
}

async function runTranslatePipeline(opts: {
  provider: LLMProvider;
  rawText: string;
  wechatAppId?: string;
  wechatAppSecret?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
}): Promise<RunPipelineResult> {
  const usedKeyword = '翻译文章';

  const generatedContent = opts.provider === 'Gemini'
    ? await translateArticleGemini(opts.rawText)
    : await translateArticleOpenAI(opts.rawText);

  const articleTitle = await (opts.provider === 'Gemini'
    ? generateTitleGemini(generatedContent)
    : generateTitleOpenAI(generatedContent)).catch(() => getTimestamp());
  const coverCandidates = ['greencover.jpg', 'yellowcover.jpg', 'bluecover.jpg'];
  const randomCover = coverCandidates[Math.floor(Math.random() * coverCandidates.length)];
  const frontMatter = [
    '---',
    `title: ${articleTitle}`,
    'cover: /home/ubuntu/contentgen/medias/assets/' + randomCover,
    '---',
    '',
  ].join('\n');
  const finalContent = frontMatter + generatedContent.trimStart();

  const outputDir = path.join(__dirname, '..', 'medias', 'docs');
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = randomFilename();
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, finalContent, 'utf8');

  let publishResult: PublishResult | undefined;
  let notionResult: NotionInsertResult | undefined;
  if (opts.wechatAppId?.trim() && opts.wechatAppSecret?.trim()) {
    publishResult = publishWenyanBackground(filePath, {
      WECHAT_APP_ID: opts.wechatAppId.trim(),
      WECHAT_APP_SECRET: opts.wechatAppSecret.trim(),
    });
  }
  if (opts.notionApiKey?.trim() && opts.notionDatabaseId?.trim()) {
    try {
      notionResult = await createPageFromMarkdown(filePath, {
        apiKey: opts.notionApiKey.trim(),
        databaseId: opts.notionDatabaseId.trim(),
      });
    } catch (err: any) {
      notionResult = {
        success: false,
        message: err?.message || '推送到 Notion 失败',
      };
    }
  }

  return {
    success: true,
    message:
      '翻译文章已生成并保存' +
      (publishResult ? '，已提交发布到微信' : '。未填写微信配置，未执行发布。') +
      (notionResult ? (notionResult.success ? '，已推送到 Notion。' : '，推送到 Notion 失败。') : ''),
    filename,
    title: articleTitle,
    publishResult,
    notionResult,
  };
}
