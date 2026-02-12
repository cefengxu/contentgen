import path from 'path';
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
