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
