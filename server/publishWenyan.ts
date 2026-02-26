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

/** 后台执行发布：启动命令后立即返回，不等待 CLI 结束。与前端「确认发布到微信」按钮行为一致，提交即视为成功。 */
export function publishWenyanBackground(
  filePath: string,
  env?: { WECHAT_APP_ID?: string; WECHAT_APP_SECRET?: string }
): PublishResult {
  const runEnv = { ...process.env };
  if (env?.WECHAT_APP_ID != null) runEnv.WECHAT_APP_ID = String(env.WECHAT_APP_ID);
  if (env?.WECHAT_APP_SECRET != null) runEnv.WECHAT_APP_SECRET = String(env.WECHAT_APP_SECRET);

  const cmd = `npx -y @wenyan-md/cli publish -f "${filePath}"`;
  const cwd = path.resolve(__dirname, '..');

  exec(cmd, {
    env: runEnv,
    cwd,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (error) {
      console.error('[publishWenyan] 后台发布 CLI 报错:', error.message);
      if (stdout) console.log('[publishWenyan] stdout:', stdout);
      if (stderr) console.error('[publishWenyan] stderr:', stderr);
    } else {
      console.log('[publishWenyan] 后台发布完成');
      if (stdout) console.log('[publishWenyan] stdout:', stdout);
      if (stderr) console.log('[publishWenyan] stderr:', stderr);
    }
  });

  return {
    success: true,
    message: '已提交发布到微信，请稍后在公众号后台查看。',
  };
}
