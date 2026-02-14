import { GenerationOptions } from '../types';

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

/** 与原文一致的 system 指令模板 */
function buildArticleSystemInstruction(rawData: string, options: GenerationOptions): string {
  return `## 系统指令
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
2) 核心内容：将6个子话题归并为2-3个主题块。按 {{读者人群}} 调整深度。
3) 总结：信息收束，不升华、不预测、不号召。

## 风格映射约束
- 科普+故事开场：故事开场 → 2–3 主题块合并 → 收束；口语化。
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
    - 句子：全稿 **≥80% 句子 ≤30 字**；**90 分位 ≤20 字**。
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
1. 仅输出一篇完整的 Markdown 正文内容，不要输出任何 YAML Front-matter（即不要输出以 --- 包裹的配置块）。
2. 如需标题，请使用 Markdown 标题语法（例如以「# 标题」或「## 标题」开头），而不是 YAML 的 title 字段。
3. 不要在开头或结尾附加额外的说明文字、提示语或元信息，只保留文章本身。

## 抓取内容：
${rawData}`;
}

/**
 * 根据检索结果生成文章（OpenAI Chat Completions 兼容）
 */
export const generateArticle = async (
  keyword: string,
  rawData: string,
  options: GenerationOptions
): Promise<string> => {
  const systemInstruction = buildArticleSystemInstruction(rawData, options);
  const userContent = `话题关键词：${keyword}。请严格按风格 {{文章风格}} 和读者人群 {{读者人群}} 生成 Markdown 正文。`;

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
 * 创建基于上下文的对话会话（OpenAI 兼容，维护历史消息）
 */
export const createChatSession = (keyword: string, context: string): ChatSession => {
  const systemContent = `你是“${keyword}”话题的专业助手。你只能基于以下背景信息回答问题：\n${context}\n严禁引入外部知识。回答需简洁。如果信息中未提及，请如实告知。`;
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
