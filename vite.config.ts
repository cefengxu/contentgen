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
      },
      plugins: [
        react(),
        {
          name: 'log-env',
          configureServer() {
            console.log('\n[contentgen] 开发服务器环境:');
            console.log('  LLM_API_BASE_URL:', env.LLM_API_BASE_URL ? `${env.LLM_API_BASE_URL.slice(0, 30)}...` : '(未设置)');
            console.log('  LLM_API_KEY:', env.LLM_API_KEY ? '已设置' : '(未设置)');
            console.log('  LLM_MODEL:', env.LLM_MODEL || 'gpt-3.5-turbo');
            console.log('  配置有效:', hasLlm ? '是' : '否（请检查 .env.local）');
            console.log('  端口:', port);
            console.log('');
          },
        },
        {
          name: 'save-markdown-middleware',
          configureServer(server) {
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

                  const outputDir = path.resolve(__dirname, 'medias/docs');
                  fs.mkdirSync(outputDir, { recursive: true });
                  const filePath = path.join(outputDir, `${name}.md`);

                  fs.writeFileSync(filePath, content, 'utf8');
                  console.log('[save-markdown-middleware] 已保存文件:', filePath);

                  // 生成后自动执行发布命令：wenyan publish -f /absolute/path/to/the/generated_xxx.md
                  const cmd = `wenyan publish -f "${filePath}"`;
                  const hasWechatId = !!process.env.WECHAT_APP_ID;
                  const hasWechatSecret = !!process.env.WECHAT_APP_SECRET;
                  console.log('[save-markdown-middleware] 执行 wenyan 命令:', cmd);
                  console.log('[save-markdown-middleware] 环境变量 WECHAT_APP_ID:', hasWechatId ? '已设置' : '未设置');
                  console.log('[save-markdown-middleware] 环境变量 WECHAT_APP_SECRET:', hasWechatSecret ? '已设置' : '未设置');

                  exec(cmd, { env: process.env }, (error, stdout, stderr) => {
                    if (error) {
                      console.error('[save-markdown-middleware] wenyan 命令执行失败:', error.message);
                      console.error('[save-markdown-middleware] 退出码:', error.code ?? '(无)');
                      if (stdout) console.log('[save-markdown-middleware] wenyan stdout:', stdout);
                      if (stderr) console.error('[save-markdown-middleware] wenyan stderr:', stderr);
                      return;
                    }
                    if (stdout) console.log('[save-markdown-middleware] wenyan stdout:', stdout);
                    if (stderr) console.error('[save-markdown-middleware] wenyan stderr:', stderr);
                    console.log('[save-markdown-middleware] wenyan 执行完成 (退出码 0)');
                  });

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
        'process.env.LLM_MODEL': JSON.stringify(env.LLM_MODEL ?? 'gpt-3.5-turbo')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
