
## Skill 使用说明(提供给 LLM / Claude)

> 目标:让模型在调用本服务时,能稳定、可预期地完成「抓取→写作→保存/发布」流水线,同时避免破坏现有工程。

### 1. 能力总览

本 Skill 封装了一个「内容生成流水线」,围绕以下 3 个核心 HTTP 接口:

- **POST `/api/run-pipeline`**  
  用于**实际落地写作任务**。执行与前端一致的完整流程:  
  **设置模型/读者/风格/长度 → 使用 keyword 检索 或 使用 rawText → 生成文章 → 保存 Markdown → 可选发布到微信/推送 Notion**。

- **POST `/api/run-pipeline-return-content`**  
  与 `run-pipeline` 参数一致,但**额外在 JSON 中返回 `content`(完整 Markdown 字符串)**,适合后续在外部系统继续处理或二次改写。

- **POST `/api/upload-markdown-to-notion`**  
  输入**已经准备好的 Markdown 原文**,直接推送到指定 Notion 数据库,**不再执行检索/写作**。

> 注意: `/api/run-pipeline-return-markdown` 接口已在工程中屏蔽,**不要再调用**。如需获取正文,统一使用 `/api/run-pipeline-return-content`。

### 2. 通用请求格式

- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body 参数（均为可选,未传则用默认）：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `provider` | string | 模型,见下「provider 可选值」 |
| `audience` | string | 读者人群,见下「audience 可选值」 |
| `style` | string | 文章风格,见下「style 可选值」 |
| `length` | string | 目标长度,见下「length 可选值」 |
| `engine` | string | 网络搜索引擎,见下「engine 可选值」 |
| `keyword` | string | **与 rawText 二选一**。网络搜索时的话题关键词 |
| `rawText` | string | **与 keyword 二选一**。原文本内容,直接作为抓取内容生成文章 |
| `wechatAppId` | string | 公众号 AppID,与 `wechatAppSecret` 同时传入则执行发布到微信 |
| `wechatAppSecret` | string | 公众号 AppSecret |
| `notionApiKey` | string | Notion API Key,与 `notionDatabaseId` 同时传入则执行推送到 Notion |
| `notionDatabaseId` | string | Notion Database ID（数据库 UUID）,与 `notionApiKey` 同时传入则执行推送到 Notion |

**provider 可选值（传 value）：**

| label | value |
|-------|-------|
| OpenAI | `OpenAI` |
| Gemini | `Gemini` |

**audience 可选值（传 value, 推荐使用短 key）：**

> 后端会将短 key 映射为原有的长描述字符串,因此不会改变任何生成逻辑;旧的长字符串写法依然兼容。

| label | 短 key（推荐） | 兼容的原始长 value |
|-------|----------------|----------------------|
| 泛科技读者 (一般) | `general` | `泛科技读者, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气自然, 行话密度中` |
| 专业工程师 (深度) | `engineer` | `资深工程师, 背景知识专业, 关注点优先级: 技术特性 > 如何实现, 语气冷静客观, 行话密度高` |
| K12 教师 | `k12` | `K12教师(小学/初中/高中), 背景知识可覆盖入门到专业, 关注点优先级: 行业应用 > 技术特性, 语气亲切到专业均可, 行话密度低到中` |
| 产品经理 (商业) | `pm` | `产品经理, 背景知识一般, 关注点优先级: 市场与生态 > 行业应用, 语气专业冷静, 行话密度中` |
| 券商分析师 (严谨) | `analyst` | `券商分析师, 背景知识专业, 关注点优先级: 市场与生态 > 合规与风险, 语气专业冷静, 行话密度中` |

**style 可选值（传 value, 推荐使用短 key）：**

| label | 短 key（推荐） | 兼容的原始 value |
|-------|----------------|-------------------|
| 科普 + 故事开场 (默认) | `story` | `科普+故事开场` |
| 深度解析 | `deepdive` | `深度解析` |
| 案例研究 | `case` | `案例研究` |
| 反转体(The Truth-Slapper) | `truth` | `反转体(The Truth-Slapper)` |
| 拆解体(The Dissector) | `dissect` | `拆解体(The Dissector)` |
| 破壳体(Shell-Breaker) | `shell` | `破壳体(Shell-Breaker)` |
| 半佛体 (Banfo) | `banfo` | `半佛体(Banfo)` |

**length 可选值（传 value, 推荐使用短 key）：**

| label | 短 key（推荐） | 兼容的原始 value |
|-------|----------------|-------------------|
| 500-800 字 (默认) | `medium` | `500-800` |
| ≤ 500 字 (精简) | `short` | `≤500` |
| 800-1200 字 (深度) | `long` | `800-1200` |
| 1600-2200 字 (深度) | `xlong` | `1600-2200` |

**engine 可选值（传 value）：**

| label | value |
|-------|-------|
| Tavily (推荐) | `Tavily` |
| Exa (神经搜索) | `Exa` |

### 3. 响应结构约定

- 通用返回结构:
  - **200 / 400:**  
    `{ success: boolean, message: string, filename?: string, title?: string, publishResult?: { success, message, stdout?, stderr? } }`
  - **500:** 服务器错误,同上结构,`success: false`。

- `POST /api/run-pipeline-return-content` 额外约定:
  - 成功时:  
    `{ success: true, message: string, filename?: string, title?: string, content?: string, publishResult?, notionResult? }`
  - 其中 `content` 为完整 Markdown 正文,JSON 中换行以 `\n` 形式出现,需要在调用侧做一次 JSON 解析。

- `POST /api/upload-markdown-to-notion`:
  - Body: `content`(必填,Markdown 字符串)、`notionApiKey`、`notionDatabaseId`(必填)。
  - 返回结构与 Notion 创建页面结果一致:`success`, `message`, `pageId?`, `url?`。

### 4. 推荐调用模式示例(给 LLM 参考)

```bash
# 网络搜索 + 生成文章（不发布）
curl -X POST http://18.222.221.196:3738/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"keyword":"AI 大模型趋势","provider":"Gemini","engine":"Tavily","audience":"general","style":"story","length":"medium"}'

# 原文本生成文章并发布到微信
curl -X POST http://18.222.221.196:3738/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"rawText":"这里是原始素材内容...","wechatAppId":"wx...","wechatAppSecret":"..."}'

# 翻译原文并推送到 Notion（风格固定为农夫山泉,忽略 audience/style/length）
curl -X POST http://18.222.221.196:3738/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "Here is the original English article...",
    "translate": true,
    "provider": "Gemini",
    "notionApiKey": "ntn_xxx",
    "notionDatabaseId": "ntn_database_id"
  }'

curl -X POST http://18.222.221.196:3738/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Gemini",
    "audience": "general",
    "style": "story",
    "length": "medium",
    "engine": "Tavily",
    "keyword": "AI 大模型趋势",
    "rawText": null,
    "wechatAppId": "wx_your_appid",
    "wechatAppSecret": "your_app_secret",
  }'

curl -X POST http://18.222.221.196:3738/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Gemini",
    "audience": "general",
    "style": "story",
    "length": "medium",
    "engine": "Tavily",
    "keyword": "AI 大模型趋势",
    "rawText": null,
    "notionApiKey": "ntn_xxx",
    "notionDatabaseId": "ntn_database_id"
  }'

curl -X POST http://18.222.221.196:3738/api/run-pipeline-return-content \
  -H "Content-Type: application/json" \
  -d '{"keyword":"AI 大模型趋势","provider":"Gemini","engine":"Tavily","audience":"general","style":"story","length":"medium"}'

curl -X POST http://18.222.221.196:3738/api/run-pipeline-return-content \
  -H "Content-Type: application/json" \
  -d '{    
    "rawText": "Here is the original English article...",
    "translate": true,
    "provider": "Gemini"
  }'

# 将原始 Markdown 上传到指定 Notion 数据库
curl -X POST http://18.222.221.196:3738/api/upload-markdown-to-notion \
  -H "Content-Type: application/json" \
  -d '{
    "content": "---\ntitle: 我的文章标题\n---\n\n这里是正文 Markdown...",
    "notionApiKey": "ntn_xxx",
    "notionDatabaseId": "ntn_database_id"
  }'
```
