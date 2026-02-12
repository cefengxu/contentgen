
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { SearchResult, GenerationOptions, SearchEngine } from "../types";

const MODEL_NAME = 'gemini-3-pro-preview';
const TAVILY_API_KEY = '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';
const EXA_API_KEY = 'b630ec0a-b78b-4981-b7ad-88550268a133';

/**
 * Initializes the Gemini API client.
 */
const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Performs search using Tavily API.
 */
async function fetchFromTavily(query: string): Promise<{ text: string; sources: SearchResult[] }> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: `${query} global impact events history facts specific data 5 regions`,
      search_depth: "advanced",
      max_results: 15,
      include_images: false,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily Error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('Tavily No Results');
  }

  const sources: SearchResult[] = data.results.map((r: any) => ({
    title: r.title || '无标题',
    uri: r.url || ''
  }));

  const textContent = data.results
    .map((r: any, idx: number) => `[Source ${idx + 1}]\nTitle: ${r.title}\nContent: ${r.content}\nURL: ${r.url}`)
    .join('\n\n');

  return { text: textContent, sources };
}

/**
 * Performs search using Exa API.
 */
async function fetchFromExa(query: string): Promise<{ text: string; sources: SearchResult[] }> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query: `${query} detailed analysis specific data facts 5 regions`,
      numResults: 15,
      useAutoprompt: true,
      type: 'neural'
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa Error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('Exa No Results');
  }

  const sources: SearchResult[] = data.results.map((r: any) => ({
    title: r.title || '无标题',
    uri: r.url || ''
  }));

  const textContent = data.results
    .map((r: any, idx: number) => `[Source ${idx + 1}]\nTitle: ${r.title}\nContent: ${r.snippet || 'No snippet'}\nURL: ${r.url}`)
    .join('\n\n');

  return { text: textContent, sources };
}

/**
 * Performs a broad search with automatic retry/switching logic.
 */
export const fetchGlobalContext = async (keyword: string, engine: SearchEngine): Promise<{ text: string; sources: SearchResult[] }> => {
  const primary = engine;
  const secondary = engine === 'Tavily' ? 'Exa' : 'Tavily';

  const performFetch = (eng: SearchEngine) => eng === 'Tavily' ? fetchFromTavily(keyword) : fetchFromExa(keyword);

  try {
    return await performFetch(primary);
  } catch (err) {
    console.warn(`Primary search engine (${primary}) failed, retrying with ${secondary}...`, err);
    try {
      return await performFetch(secondary);
    } catch (err2) {
      throw new Error(`检索失败：${primary} 及备用 ${secondary} 均不可用。`);
    }
  }
};

/**
 * Generates the article based on search results following the updated strict guidelines.
 */
export const generateArticle = async (keyword: string, rawData: string, options: GenerationOptions): Promise<string> => {
  const ai = getAiClient();
  
  const systemInstruction = `## 系统指令
你是严格执行指令的自动化内容整合代理。
不闲聊、不生成未请求内容；所有写作仅基于抓取到的公开信息，不扩写、不幻想、不进行常识性补充。

## 可控变量
- {{读者人群}}：${options.audience}
- {{文章长度}}：${options.length}
- {{文章风格}}：${options.style}
- {{搜索引擎}}：${options.engine}

## 文章风格（默认）
**科普 + 故事开场**（需同时满足），根据 {{读者人群}} 自动调整术语密度、解释深度、例子选择与语气。

## 信息获取限制
仅使用抓取内容中的可核实事实；不做任何超出处信息的推断、判断或预测。缺失宁缺毋滥。参数附单位/范围；对比点明基准。严禁在输出中展示任何 API Key。

## 结构与写作
1) 开场：若风格=科普+故事开场，选1个真实事件（时间/地点/主体/细节），40-80字。其他风格按映射执行。
2) 核心内容：将10个子话题归并为3-4个主题块。按 {{读者人群}} 调整深度。
3) 总结：信息收束，不升华、不预测、不号召。

## 风格映射约束
- 科普+故事开场：故事开场 → 3–4 主题块合并 → 收束；口语化。
- 新闻快讯：事实要点 → 关键参数/时间 → 来源；短句、数字优先。
- 深度解析：背景 → 机制/数据 → 对比与边界 → 限制；概念首现有限释义。
- 案例研究：背景 → 目标 → 方案 → 结果与复盘 → 可迁移要点。
- 数据观察：数据来源 → 关键指标 → 对比区间 → 限制；数字比例为主。
- 访谈纪要：背景 → 主题 Q&A 要点 → 关键原话 → 来源。
- 时间线：按时间顺序列节点（时间/动作/参数/状态）。
- 事实核查：问题陈述 → 证据来源 → 核查结论 → 边界。
- 行业简报：分主题归类；动作与参数；注明主体与时间。
- 产品测评：场景方法 → 指标结果 → 优缺点 → 适用人群。
- 半佛体（Banfo）：
  - **节奏硬指标**
    - 句子：全稿 **≥50% 句子 ≤20 字**；**90 分位 ≤20 字**。
    - 段落：**4–6 段**；每段 **≤80 字**；允许并列三连句（例：A。B。C。）。
    - 标点节拍：每段可用 **1 次破折号（——）** 或 **1 处括号补刀（（））**，不同时使用；全文反问句 **≤2 处**。
  - **事实密度**
    - 只写可核实的 **商业数据 / 行业规则 / 技术规格**；**零抒情**。
    - 参数带 **单位/范围**；对比需点明 **基准对象与时间**；无则不写。
    - **数字密度目标**：**≥1 处/段**（若抓取缺失则跳过，不补常识）。
  - **动词驱动**
    - 优先动词（示例库）：收割、对齐、压缩、替代、爆破、放大、降维、封顶、挤水、抬价、盘活、兜底、卡位、围猎、提速、砍掉、拉通、清盘、对冲、锁死。
    - **动词占比目标**：**≥8 个强动词/百句**；避免“很/非常/极其”等空洞副词。
  - **吐槽边界**
    - 仅对 **现象/行为/机制**吐槽；**禁**指向个体或群体属性；**禁**贬损词。
    - 吐槽句后 **紧跟事实或参数**（如“——成交额 X、成本 Y、失败率 Z%”）。
  - **读者适配**
    - 入门：行话密度低；术语首现 **1 句抓取来源的释义**。
    - 一般：增加 **对比基准/参数/时间点**；不解释常识，不作推断。
  - **结构建议（可选）**
    - 起手亮观点（短句）→ 三个主题块（技术/应用/合规或市场，择其三）→ 收束 1–2 句（不升华、不预测）。
  - **禁用清单（样例）**
    - 空洞词：颠覆、震撼、王炸、史诗级、降维打击（无证据时）、全民、吊打。
    - 情绪化：嘲讽人身、贴标签、上价值判断。

## 输出要求
---
title: 基于内容生成的标题（不夸张）
cover: /home/ubuntu/docs_notion/assets/greencover.jpg
---
[正文内容]

## 抓取内容：
${rawData}`;

  const prompt = `话题关键词：${keyword}。请严格按风格 {{文章风格}} 和读者人群 {{读者人群}} 生成 Markdown 正文。`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text || '';
};

/**
 * Chatbot interface for answering user questions about the topic.
 */
export const createChatSession = (keyword: string, context: string) => {
  const ai = getAiClient();
  return ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: `你是“${keyword}”话题的专业助手。你只能基于以下背景信息回答问题：\n${context}\n严禁引入外部知识。回答需简洁。如果信息中未提及，请如实告知。`,
    },
  });
};
