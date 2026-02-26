import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PublishResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
}

/**
 * 使用 @wenyan-md/cli 将指定 Markdown 文件发布到微信公众号。
 * @param filePath 本地 .md 文件绝对路径
 * @param env 可选覆盖 WECHAT_APP_ID / WECHAT_APP_SECRET
 */
export async function publishWenyan(
  filePath: string,
  env?: { WECHAT_APP_ID?: string; WECHAT_APP_SECRET?: string }
): Promise<PublishResult> {
  const runEnv = { ...process.env };
  if (env?.WECHAT_APP_ID != null) runEnv.WECHAT_APP_ID = String(env.WECHAT_APP_ID);
  if (env?.WECHAT_APP_SECRET != null) runEnv.WECHAT_APP_SECRET = String(env.WECHAT_APP_SECRET);

  const cmd = `npx -y @wenyan-md/cli publish -f "${filePath}"`;
  const cwd = path.resolve(__dirname, '..');

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      env: runEnv,
      cwd,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      success: true,
      message: '文章已发送,预计 5 分钟后可在后台查看。',
      stdout: stdout || undefined,
      stderr: stderr || undefined,
    };
  } catch (err: any) {
    const stdout = err.stdout?.toString?.() || '';
    const stderr = err.stderr?.toString?.() || '';
    return {
      success: false,
      message: err?.message || 'wenyan-cli 执行失败',
      stdout: stdout || undefined,
      stderr: stderr || undefined,
    };
  }
}
