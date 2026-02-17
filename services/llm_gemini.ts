import { GoogleGenAI } from '@google/genai';
import type { GenerationOptions } from '../types';

/** 从环境变量读取的 Gemini 配置（支持智增增：base_url + api_key） */
const getGeminiConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const baseUrl = (process.env.LLM_GEMINI_API_BASE_URL || '').replace(/\/$/, '');
  if (!apiKey) {
    throw new Error('请在 .env 或环境变量中配置 GEMINI_API_KEY');
  }
  return { apiKey, model, baseUrl: baseUrl || undefined };
};

/** 与 llm.ts 一致的对话消息格式（用于 chatCompletions） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 单轮文本生成（非流式、无思考模式）
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
 * 文档解析：根据 PDF 下载链接与用户 prompt，使用 Gemini 解析 PDF 并返回文本结果。
 * 仅 Gemini 支持；OpenAI 不支持。
 * @param pdfUrl PDF 的下载链接（由用户提供）
 * @param prompt 用户输入的解析指令（如「总结这份文档」）
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
 * 多轮对话补全（非流式、无思考模式）
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

/** 与 llm.ts 一致的 system 指令模板（用于 generateArticle） */
function buildArticleSystemInstruction(rawData: string, options: GenerationOptions): string {
  return `## 系统指令
你是严格执行指令的自动化内容整合代理。
不闲聊、不生成未请求内容；所有写作仅基于抓取到的公开信息，不扩写、不幻想、不进行常识性补充。

## 可控变量（运行时传参）
- {{读者人群}}：${options.audience}
  - 角色/画像（示例：泛科技读者、产品经理、券商分析师、资深工程师、K12教师）
  - 背景知识水平：入门 / 一般
  - 关注点优先级（从高到低，可多选）：技术特性 / 行业应用 / 合规与风险 / 市场与生态
  - 语气：客观克制 / 轻松自然 / 专业冷静
  - 行话密度：低 / 中 / 高（当为"低"时，术语需在首次出现处给出简短释义，释义必须来自抓取内容）
  - 例子与对比：仅当抓取内容出现明确对比与示例时方可使用，否则禁用
- {{文章长度}}：${options.length}
  - 期望字数范围或上限（如："500-800" 或 "≤700"）。若未提供，默认 500–800 字
  - 段落数与句长应随字数自适应：4–8 段为宜；句长 8–22 字为主，每 1–2 段插入一句 7–12 字短句

## 风格选择（运行时传入）
- {{文章风格}}：${options.style}
  [科普+故事开场|新闻快讯|深度解析|案例研究|数据观察|访谈纪要|时间线|事实核查|行业简报|产品测评|半佛体（Banfo）]
- 根据 {{读者人群}} 自动调整：术语密度、解释深度、例子与语气。
- 全文字数遵循 {{文章长度}}（默认 500–800 字），段落与句长自适应。
- 默认风格：**科普 + 故事开场**。若提供 {{文章风格}}，则以该风格为准；如该风格不适配"故事开场"（如新闻快讯），则严格遵循该风格模板。

## 文章风格（默认）
**科普 + 故事开场**（需同时满足），根据 {{读者人群}} 自动调整术语密度、解释深度、例子选择与语气。

## 信息获取（可选搜索引擎）
- 以【话题关键词】为核心，覆盖 **全球 5 个不同区域**，共筛选 **5 个高度相关的子话题/事件**。
- 按 {{搜索引擎}} 指定的提供者发起检索（Tavily 或 Exa），仅使用抓取到的公开内容；禁止使用模型自身知识。
- 记录关键要素：时间点、地点、主体、数值/规格（带单位/范围）、明确对比对象（如同类模型/版本）。
- 质量约束：
  - 优先具有时间戳与权威来源的结果；多源交叉；空泛转载降权。
  - 若"对比/速度/幅度"被提及，必须指出**基准对象与时间点**；抓取无基准则不写。

## 事实与可追溯性（防幻觉硬约束）
- 仅使用抓取内容中的可核实事实；不做任何超出处信息的推断、判断或预测。
- 模糊词替换为具体事实（时间、数字、名称、场景细节）。缺失则不写，宁缺毋滥。
- 参数必须附单位/范围；对比必须点明基准对象。没有基准则不写。
- 禁止：比喻化渲染、通用常识补全、夸张形容词、跨域类比、隐含价值判断。

## 结构与写作（微信公众号适配）

> 【统一口径：非事实润滑表达（≤10%）】
> - 定义：仅为提升连贯性而使用的**不新增事实**的表达，包括：
>   1) 语言过渡（承接/转折/并列）；
>   2) 结构性总结（对已写事实的合并/概括，不推断因果或趋势）；
>   3) 主观但不带判断的中性感受句（不得包含"更好/更差/值得/推荐"等价值词）。
> - 计数口径：以**句子数**估算占比 ≤10%；若与事实约束冲突，以事实优先。

1) **开场**
   - 其他风格按「风格映射约束」执行。
   - 可用**非事实润滑表达**承接至正文（如"据公开资料所述""在此背景下"），仅作过渡，不引入新信息。

2) **核心内容（信息合并）**
   - 将 5 个子话题**归并为 1–3 个主题块**（如：技术特性；应用与行业变化；合规与风险；市场与生态）。**每主题块**的事实需来自 **≥1 权威来源**，优先双源交叉。
   - **主题块写作顺序（固定）**：
     **事实 → 含义（仅复述来源中的指向，不外延） → 边界（仅据来源披露的限制/口径）**；禁止清单式流水账。
   - **主题块微模板（建议采用）**
     1) **主题句（结构性总结）**：用 1 句概述已抓取事实呈现的"集合指向"，不得推测因果或趋势。
     2) **事实段**：列出**时间 / 地点 / 主体 / 参数（含单位/范围）/ 对比基准与时间点**；多源时按"最新优先、权威优先"。
     3) **含义段（仅据来源）**：以"来源称/报告指出/文档描述"为引导，复述来源的指向性解释或结论，不改写、不延展。
     4) **边界段**：仅写来源已给出的限制/口径/适用条件（如样本范围、测试场景、指标定义、未覆盖项）。
   - **过渡与衔接**：允许使用**非事实润滑表达**把不同来源的事实粘合为连续文本（如"在相同口径下可见结构更清晰""在同一时间窗口内，两项指标彼此并列"）。
   - 按 {{读者人群}} 调整：
     - 入门：强调"是什么/怎么用"；
     - 一般：强调"关键参数/边界/对比对象与时间点"。
     当 {{行话密度}} = 低 时，术语首现需给出**来源中的释义**并标明出处；无来源释义则不写。
   - **禁止事项（核心段内）**：不使用比喻与价值判断；不补常识；**无基准不写对比**；**无口径不写指标**。

3) **总结**
   - 只做信息收束与界限重申（依据已写事实），**不升华、不预测、不号召**，1–2 句即可。
   - 可使用**非事实润滑表达**中的中性感受句提升可读性（如"在上述口径内，信息呈现为较为连续的结构"），但不得引入新事实。
   - 如主题块之间仍有断裂，可加 1 句**结构性总结**作收口（不引入任何新事实），如"以上节点在同一时间窗口内彼此并列，构成本次信息整合的边界"。

## 风格映射约束（与风格选择一一对应）
- 科普+故事开场：故事开场（见上） → **1–3 主题块合并** → 收束；口语化、克制，术语首现有限释义。
- 新闻快讯：事实要点 → 关键参数/时间 → 影响对象 → 来源；短句、客观、数字优先，禁止展望与形容词堆叠。
- 深度解析：背景 → 机制/数据 → 对比与边界 → 限制；概念首现给一句基于抓取的释义；图表可文字化描述。
- 案例研究：背景 → 目标 → 方案 → 结果与复盘 → 可迁移要点；叙事 + 数据，所有结论需有来源支撑。
- 数据观察：数据来源与时间 → 关键指标与口径 → 对比区间与波动 → 已知限制；数字与比例为主，描述图表，不造图。
- 访谈纪要：受访者背景（1 句） → 主题 Q&A 要点（5–8 条） → 关键原话（可引用短句） → 参考来源；全程客观摘录。
- 时间线：按时间顺序列关键节点（时间/动作/参数/当前状态），每节点 1–2 句；可在结尾收束现状但不预测。
- 事实核查：问题陈述 → 证据来源（多方） → 核查结论（成立/部分成立/不成立/待证） → 边界与未证部分；谨慎用语。
- 行业简报：分主题归类；每条 1–2 句写核心动作与参数；注明主体与时间；不做评价与预测。
- 产品测评：测试场景与方法 → 指标与结果（含单位与基准） → 优缺点（仅据来源） → 适用人群与限制；禁止主观打分。
- 半佛体（Banfo）：
  - **节奏硬指标**：全稿 ≥50% 句子 ≤20 字；90 分位 ≤20 字。
  - **段落**：4–6 段；每段 ≤80 字；允许并列三连句（A。B。C。）。
  - **标点节拍**：每段可用 1 次破折号（——）或 1 处括号补刀（），不同时使用；反问句 ≤2 处。
  - **事实密度**：只写可核实的商业数据/行业规则/技术规格；参数带单位/范围；对比需基准对象与时间；**数字密度 ≥1 处/段**（缺失则跳过）。
  - **动词驱动**：优先强动词（收割、对齐、压缩、替代、爆破、放大、降维、封顶、挤水、抬价、盘活、兜底、卡位、围猎、提速、砍掉、拉通、清盘、对冲、锁死）。
  - **吐槽边界**：只针对现象/机制；禁人身与贬损；吐槽后紧跟事实或参数。
  - **读者适配**：入门—行话低且释义需引出处；一般—增加对比基准/参数/时间点。
  - **结构建议**：起手亮观点 → 三主题块（技术/应用/合规或市场，择其三） → 收束 1–2 句（不升华、不预测）。
  - **禁用清单**：颠覆、震撼、王炸、史诗级、降维打击（无证据时）、全民、吊打等空洞词；禁贴标签与上价值判断。

## 可读性规则
- 全文字数遵循 {{文章长度}}；若未提供，默认 500–800 字。
- 段落 4–8 段；每段 ≤80 字；句长 8–22 字为主；**每 1–2 段插入 1 句 7–12 字短句**。
- 动词优先（如：实现、对齐、压缩、替代、延展、收束）；减少空洞形容词。
- **禁止词清单**（无确证时）：由此可见、可以说、引发热议、史诗级、再度引爆、不得不说、或将、有望、掀起风暴、全民、颠覆性。
- **非事实润滑表达计数口径**：按**句子数**估算占比 ≤10%；与事实约束冲突时，**以事实优先**。

## 输出要求
1. **仅输出 Markdown 正文内容**
   - 不要输出任何 YAML Front-matter（即不要输出以 \`---\` 包裹的配置块）
   - 不要输出 title、cover 等元信息字段
   - Front-matter 将由系统代码统一添加

2. **正文输出规则：**
   - 直接从文章正文开始输出
   - 仅输出 **最终微信公众号文章正文**
   - 使用 **Markdown** 格式
   - 不输出搜索过程、不输出中间分析
   - 不输出任何任务说明或额外解释

## 自检与一次性重写（发布前）
- 风格一致性：{{文章风格}} 是否在上方列表；若不在，降级为"科普+故事开场"并按其约束生成。
- 是否出现套话、空话或过度判断？删除或改为"主体 + 动作 + 结果"的具体句。
- 段落是否过长、句式是否单一？压缩并混排句长；若为 Banfo，短句占比提升至 ≥60%。
- 模糊词是否已替换为时间/数字/主体/动作等具体事实？
- 10 个子话题是否已整合为 3–4 个主题块？
- 若关键信息缺失，**不写**；不得自填或推断。

## 禁止事项
- 禁止生成抓取结果中不存在的信息或推断。
- 禁止趋势判断、预测、价值评判、营销语。
- 禁止输出与文章无关的任何内容。

## 抓取内容：
${rawData}`;
}

/**
 * 根据检索结果生成文章（Gemini 非流式）
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

export interface GeminiChatSession {
  sendMessage: (params: { message: string }) => Promise<{ text: string }>;
}

/**
 * 创建基于上下文的对话会话（Gemini，维护历史消息）
 */
export const createChatSession = (keyword: string, context: string): GeminiChatSession => {
  const systemContent = `你是"${keyword}"话题的专业助手。你只能基于以下背景信息回答问题：\n${context}\n严禁引入外部知识。回答需简洁。如果信息中未提及，请如实告知。`;
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
