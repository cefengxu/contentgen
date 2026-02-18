import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const hasLlm = !!(env.LLM_API_BASE_URL && env.LLM_API_KEY);
    const port = parseInt(env.PORT || '3000', 10);
    return {
      server: {
        port,
        host: '0.0.0.0',
        // 避免保存生成的文章到 medias/docs 时触发文件监听,导致页面自动刷新
        watch: {
          ignored: ['**/medias/**'],
        },
      },
      plugins: [
        react(),
        {
          name: 'log-env',
          configureServer() {
            // 把 .env / .env.local 等已加载的变量同步到 process.env,供服务端中间件和 API 使用
            for (const [k, v] of Object.entries(env)) {
              if (v != null && v !== '' && (process.env[k] == null || process.env[k] === '')) {
                process.env[k] = v;
              }
            }
            console.log('\n[contentgen] 开发服务器环境:');
            console.log('  LLM_API_BASE_URL:', env.LLM_API_BASE_URL ? `${env.LLM_API_BASE_URL.slice(0, 30)}...` : '(未设置)');
            console.log('  LLM_API_KEY:', env.LLM_API_KEY ? '已设置' : '(未设置)');
            console.log('  LLM_MODEL:', env.LLM_MODEL || 'gpt-3.5-turbo');
            console.log('  GEMINI_API_KEY:', env.GEMINI_API_KEY ? '已设置' : '(未设置)');
            console.log('  GEMINI_MODEL:', env.GEMINI_MODEL || 'gemini-2.0-flash');
            console.log('  LLM_GEMINI_API_BASE_URL:', env.LLM_GEMINI_API_BASE_URL || '(未设置,使用官方)');
            console.log('  配置有效:', hasLlm ? '是' : '否(请检查 .env.local)');
            console.log('  端口:', port);
            console.log('');
          },
        },
        {
          name: 'save-markdown-middleware',
          configureServer(server) {
            const outputDir = path.resolve(__dirname, 'medias/docs');

            // GET 微信配置(用于前端展示默认值,可按需脱敏)
            server.middlewares.use('/api/wechat-config', (req, res, next) => {
              if (req.method !== 'GET') return next();
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                WECHAT_APP_ID: process.env.WECHAT_APP_ID ?? '',
                WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET ?? '',
              }));
            });

            // POST 使用指定微信参数执行 wenyan 发布,并返回执行结果
            server.middlewares.use('/api/publish', (req, res, next) => {
              if (req.method !== 'POST') return next();

              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsed = JSON.parse(body || '{}') as { filename?: string; WECHAT_APP_ID?: string; WECHAT_APP_SECRET?: string };
                  const filename = parsed.filename?.trim();
                  if (!filename) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: false, message: '缺少 filename' }));
                    return;
                  }
                  const filePath = path.join(outputDir, filename);
                  if (!fs.existsSync(filePath)) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: false, message: '文件不存在: ' + filename }));
                    return;
                  }
                  const env = { ...process.env };
                  if (parsed.WECHAT_APP_ID != null) env.WECHAT_APP_ID = String(parsed.WECHAT_APP_ID);
                  if (parsed.WECHAT_APP_SECRET != null) env.WECHAT_APP_SECRET = String(parsed.WECHAT_APP_SECRET);

                  const cmd = `npx -y @wenyan-md/cli publish -f "${filePath}"`;
                  console.log('[publish] 执行命令:', cmd);

                  // 启动子进程但不等待结果,后台执行
                  exec(cmd, {
                    env,
                    cwd: __dirname,
                    timeout: 120000,
                    maxBuffer: 10 * 1024 * 1024,
                  }, (error, stdout, stderr) => {
                    // 这个回调在后台执行,仅用于日志记录
                    if (error) {
                      console.error('[publish] wenyan-cli 执行失败:', error.message);
                      if (stdout) console.log('[publish] stdout:', stdout);
                      if (stderr) console.error('[publish] stderr:', stderr);
                    } else {
                      console.log('[publish] wenyan-cli 执行完成');
                      if (stdout) console.log('[publish] stdout:', stdout);
                      if (stderr) console.log('[publish] stderr:', stderr);
                    }
                  });

                  // 立即返回成功响应,不等待命令执行完成
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    message: '文章已发送,预计 5 分钟后可在后台查看。',
                  }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, message: err?.message || '发布请求处理失败' }));
                }
              });
            });

            // POST 文档解析(仅 Gemini):pdfUrl + prompt,返回解析结果
            server.middlewares.use('/api/parse-document', (req, res, next) => {
              if (req.method !== 'POST') return next();
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                const send = (status: number, payload: { success: boolean; text?: string; message?: string }) => {
                  res.statusCode = status;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(payload));
                };
                (async () => {
                  try {
                    const parsed = JSON.parse(body || '{}') as { pdfUrl?: string; prompt?: string };
                    const pdfUrl = parsed.pdfUrl?.trim();
                    const prompt = parsed.prompt?.trim();
                    if (!pdfUrl || !prompt) {
                      send(400, { success: false, message: '请提供 pdfUrl 和 prompt' });
                      return;
                    }
                    const { parseDocument } = await import('./services/llm_gemini');
                    const text = await parseDocument(pdfUrl, prompt);
                    send(200, { success: true, text: text ?? '' });
                  } catch (err: any) {
                    console.error('[parse-document]', err);
                    send(500, { success: false, message: err?.message || '文档解析失败' });
                  }
                })().catch((err: any) => {
                  console.error('[parse-document] unhandled', err);
                  send(500, { success: false, message: err?.message || '文档解析失败' });
                });
              });
            });

            server.middlewares.use('/api/save-markdown', (req, res, next) => {
              if (req.method !== 'POST') {
                return next();
              }

              console.log('[save-markdown-middleware] 收到 POST /api/save-markdown 请求');

              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });

              req.on('end', () => {
                try {
                  const parsed = JSON.parse(body || '{}') as { content?: string };
                  const content = parsed.content ?? '';

                  if (!content.trim()) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'content 不能为空' }));
                    return;
                  }

                  // 生成 10 位 [A-Za-z0-9] 随机文件名
                  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                  let name = '';
                  for (let i = 0; i < 10; i++) {
                    name += chars.charAt(Math.floor(Math.random() * chars.length));
                  }

                  fs.mkdirSync(outputDir, { recursive: true });
                  const filePath = path.join(outputDir, `${name}.md`);

                  fs.writeFileSync(filePath, content, 'utf8');
                  console.log('[save-markdown-middleware] 已保存文件:', filePath);

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ filename: `${name}.md`, path: filePath }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err?.message || '保存 Markdown 文件失败' }));
                }
              });
            });
          },
        },
      ],
      define: {
        'process.env.LLM_API_BASE_URL': JSON.stringify(env.LLM_API_BASE_URL ?? ''),
        'process.env.LLM_API_KEY': JSON.stringify(env.LLM_API_KEY ?? ''),
        'process.env.LLM_MODEL': JSON.stringify(env.LLM_MODEL ?? 'gpt-3.5-turbo'),
        'process.env.TAVILY_API_KEY': JSON.stringify(env.TAVILY_API_KEY ?? ''),
        'process.env.EXA_API_KEY': JSON.stringify(env.EXA_API_KEY ?? ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
        'process.env.GEMINI_MODEL': JSON.stringify(env.GEMINI_MODEL ?? 'gemini-2.0-flash'),
        'process.env.LLM_GEMINI_API_BASE_URL': JSON.stringify(env.LLM_GEMINI_API_BASE_URL ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
