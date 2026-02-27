<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1U5-RO_6hWdSZfcTVjNZ_u9pLjtS3XLIw

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. 在项目根目录创建 [.env.local](.env.local),配置兼容 OpenAI 的大模型服务:
   - `OPENAI_API_URL`:API 完整地址(含 `/v1/chat/completions`,如 `https://api.openai.com/v1/chat/completions` 或第三方兼容地址)
   - `OPENAI_API_KEY`:API Key
   - (可选)`OPENAI_MODEL`:模型名,默认 `gpt-3.5-turbo`
3. Run the app:
   `npm run dev`

## 对外服务接口：一键执行生文并发布

系统提供 **POST `/api/run-pipeline`** 接口，可传入参数执行与前端一致的完整流程：**设置模型/读者/风格/长度 → 检索或原文本 → 生成文章 → 保存 Markdown → 可选发布到微信**。

### 请求

- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body 参数（均为可选，未传则用默认）：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `provider` | string | 模型，见下「provider 可选值」 |
| `audience` | string | 读者人群，见下「audience 可选值」 |
| `style` | string | 文章风格，见下「style 可选值」 |
| `length` | string | 目标长度，见下「length 可选值」 |
| `engine` | string | 网络搜索引擎，见下「engine 可选值」 |
| `keyword` | string | **与 rawText 二选一**。网络搜索时的话题关键词 |
| `rawText` | string | **与 keyword 二选一**。原文本内容，直接作为抓取内容生成文章 |
| `wechatAppId` | string | 公众号 AppID，与 wechatAppSecret 同时传入则执行发布到微信 |
| `wechatAppSecret` | string | 公众号 AppSecret |

**provider 可选值（传 value）：**

| label | value |
|-------|-------|
| OpenAI | `OpenAI` |
| Gemini | `Gemini` |

**audience 可选值（传 value）：**

| label | value |
|-------|-------|
| 泛科技读者 (一般) | `泛科技读者, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气自然, 行话密度中` |
| 专业工程师 (深度) | `资深工程师, 背景知识专业, 关注点优先级: 技术特性 > 如何实现, 语气冷静客观, 行话密度高` |
| K12 教师 | `K12教师(小学/初中/高中), 背景知识可覆盖入门到专业, 关注点优先级: 行业应用 > 技术特性, 语气亲切到专业均可, 行话密度低到中` |
| 产品经理 (商业) | `产品经理, 背景知识一般, 关注点优先级: 市场与生态 > 行业应用, 语气专业冷静, 行话密度中` |
| 券商分析师 (严谨) | `券商分析师, 背景知识专业, 关注点优先级: 市场与生态 > 合规与风险, 语气专业冷静, 行话密度中` |

**style 可选值（传 value）：**

| label | value |
|-------|-------|
| 科普 + 故事开场 (默认) | `科普+故事开场` |
| 深度解析 | `深度解析` |
| 案例研究 | `案例研究` |
| 反转体(The Truth-Slapper) | `反转体(The Truth-Slapper)` |
| 拆解体(The Dissector) | `拆解体(The Dissector)` |
| 破壳体(Shell-Breaker) | `破壳体(Shell-Breaker)` |
| 半佛体 (Banfo) | `半佛体(Banfo)` |

**length 可选值（传 value）：**

| label | value |
|-------|-------|
| 500-800 字 (默认) | `500-800` |
| ≤ 500 字 (精简) | `≤500` |
| 800-1200 字 (深度) | `800-1200` |
| 1600-2200 字 (深度) | `1600-2200` |

**engine 可选值（传 value）：**

| label | value |
|-------|-------|
| Tavily (推荐) | `Tavily` |
| Exa (神经搜索) | `Exa` |

### 响应

- **200 / 400：** `{ success: boolean, message: string, filename?: string, title?: string, publishResult?: { success, message, stdout?, stderr? } }`
- **500：** 服务器错误，同上结构，`success: false`。

### 示例

```bash
# 网络搜索 + 生成文章（不发布）
curl -X POST http://localhost:3000/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"keyword":"AI 大模型趋势","provider":"Gemini","engine":"Tavily"}'

# 原文本生成文章并发布到微信
curl -X POST http://localhost:3000/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"rawText":"这里是原始素材内容...","wechatAppId":"wx...","wechatAppSecret":"..."}'

# 翻译原文（风格固定为农夫山泉，忽略 audience/style/length）
curl -X POST http://localhost:3000/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "Here is the original English article...",
    "translate": true,
    "provider": "Gemini",
    "wechatAppId": "wx_your_appid",
    "wechatAppSecret": "your_app_secret"
  }'

curl -X POST http://localhost:3000/api/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Gemini",
    "audience": "泛科技读者, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气自然, 行话密度中",
    "style": "科普+故事开场",
    "length": "500-800",
    "engine": "Tavily",
    "keyword": "AI 大模型趋势",
    "rawText": null,
    "wechatAppId": "wx_your_appid",
    "wechatAppSecret": "your_app_secret"
  }'

```
