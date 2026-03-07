import fs from 'fs';
import path from 'path';

const NOTION_API_BASE = 'https://api.notion.com/v1';
// 跟随 Notion 官方最新稳定版 API；如需固定旧版本可在此调整
const NOTION_VERSION = '2025-09-03';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

/** 可重试的网络错误码 */
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function isRetryableNetworkError(err: unknown): boolean {
  const code =
    (err as NodeJS.ErrnoException)?.code ??
    ((err as Error)?.cause && ((err as Error).cause as NodeJS.ErrnoException)?.code);
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

/**
 * 带超时与重试的 fetch：网络瞬时错误（如 ECONNRESET）时自动重试,便于在代理/防火墙不稳定时仍能访问 Notion API。
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retriesLeft = MAX_RETRIES,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = controller.signal;

  try {
    const resp = await fetch(url, { ...init, signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isRetryable = isRetryableNetworkError(err) || (err as Error)?.name === 'AbortError';
    if (isRetryable && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return fetchWithRetry(url, init, retriesLeft - 1);
    }
    const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? (err.cause as NodeJS.ErrnoException) : null;
  const code = (cause?.code ?? (err as NodeJS.ErrnoException)?.code) as string | undefined;
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || msg.includes('fetch failed')) {
      throw new Error(
        `无法连接 Notion API（${code ?? '网络错误'}）。请检查：1) 本机网络或代理/VPN 是否可访问 api.notion.com；2) 防火墙是否拦截；3) 稍后重试。`,
        { cause: err },
      );
    }
    throw err;
  }
}

export interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

export interface NotionInsertResult {
  success: boolean;
  message: string;
  pageId?: string;
  url?: string;
}

interface NotionDatabaseProperty {
  type: string;
}

interface NotionDatabase {
  properties: Record<string, NotionDatabaseProperty>;
}

function buildHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function fetchDatabaseMeta(config: NotionConfig): Promise<NotionDatabase> {
  const resp = await fetchWithRetry(`${NOTION_API_BASE}/databases/${config.databaseId}`, {
    method: 'GET',
    headers: buildHeaders(config.apiKey),
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const data = await resp.json() as any;
      detail = data?.message || data?.code || '';
    } catch {
      // ignore
    }
    const msg = detail || resp.statusText;
    if (resp.status === 404 || (typeof msg === 'string' && (msg.includes('Could not find') || msg.includes('object_not_found')))) {
      throw new Error(
        `未找到该 ID 对应的数据库。请确认填写的是「数据库」的 ID（而非包含该数据库的页面 ID）。在 Notion 中打开数据库 → 右上角「⋯」→「复制链接」,链接中的 UUID 即为数据库 ID,例如：2feb6327-d4f6-800f-9d49-e68a6280a44c。原始错误：${msg}`,
      );
    }
    throw new Error(`获取 Notion 数据库结构失败(${resp.status}): ${msg}`);
  }

  const data = await resp.json() as NotionDatabase;
  return data;
}

function pickTitleProperty(db: NotionDatabase): string {
  const props = db.properties ?? {};
  const keys = Object.keys(props);

  // 1) 若数据库中有 TITLE 字段则优先使用（与当前目标库结构一致,避免 API 返回 type 格式不同导致误用 Name）
  if (keys.includes('TITLE')) return 'TITLE';

  // 2) 按 Notion 返回的 type 识别 title（兼容大小写及字符串格式）
  for (const [name, prop] of Object.entries(props)) {
    const t = (prop as { type?: string })?.type;
    if (typeof t === 'string' && t.toLowerCase() === 'title') return name;
  }

  // 3) 其他常见名称兜底
  if (keys.includes('Title')) return 'Title';
  if (keys.includes('Name')) return 'Name';

  // 4) 取第一个属性名,避免使用不存在的字段名
  return keys[0] ?? 'Name';
}

/** 今日日期 YYYY-MM-DD,用于 Created 等日期字段 */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 为 Status/Select 型属性设置选项值（Notion 新 Status 用 status,旧 Select 用 select） */
function setSelectOrStatus(prop: NotionDatabaseProperty | undefined, optionName: string): any {
  if (!prop) return undefined;
  if (prop.type === 'status') return { status: { name: optionName } };
  if (prop.type === 'select') return { select: { name: optionName } };
  return undefined;
}

/**
 * 在已设置的 title 基础上,按数据库结构补充默认属性：STATUS / WECHAT / WWW 为默认选项,Created 为今日。
 * 仅当数据库中存在对应字段时才添加,避免与不同结构的数据库不兼容。
 */
function applyDefaultProperties(
  db: NotionDatabase,
  base: Record<string, any>,
): Record<string, any> {
  const props = db.properties ?? {};
  const out = { ...base };

  const statusVal = setSelectOrStatus(props.STATUS, '未开始');
  if (statusVal) out.STATUS = statusVal;
  const wechatVal = setSelectOrStatus(props.WECHAT, 'PED');
  if (wechatVal) out.WECHAT = wechatVal;
  const wwwVal = setSelectOrStatus(props.WWW, 'PED');
  if (wwwVal) out.WWW = wwwVal;
  if (props.Created?.type === 'date') {
    out.Created = { date: { start: todayISO() } };
  }

  return out;
}

function extractTitleAndBody(raw: string, filename: string): { title: string; body: string } {
  let title = filename.replace(/\.md$/i, '');
  let body = raw;

  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const frontMatter = raw.slice(3, end).trim();
      const m = /^title:\s*(.+)$/m.exec(frontMatter);
      if (m && m[1].trim()) {
        title = m[1].trim();
      }
      body = raw.slice(end + '\n---'.length);
      if (body.startsWith('\n')) body = body.slice(1);
    }
  }

  return { title: title || filename, body: body.trim() };
}

function markdownToParagraphBlocks(markdown: string): any[] {
  const blocks: any[] = [];
  const paragraphs = markdown.split(/\n{2,}/);
  const maxLen = 1800;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    let start = 0;
    while (start < trimmed.length) {
      const chunk = trimmed.slice(start, start + maxLen);
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: chunk },
            },
          ],
        },
      });
      start += maxLen;
    }
  }

  if (blocks.length === 0) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: '' },
          },
        ],
      },
    });
  }

  return blocks;
}

/**
 * 使用指定的 Markdown 文件内容在 Notion 数据库中创建一条新记录。
 * - 会先获取数据库结构,自动识别 title 属性名称；
 * - 设置 TITLE（来自 front-matter 或文件名）,并按数据库结构补充默认属性：STATUS=未开始,WECHAT/WWW=PED,Created=今日；
 * - 将 Markdown 正文按段落拆分为 paragraph blocks 写入页面内容。
 */
export async function createPageFromMarkdown(
  filePath: string,
  config: NotionConfig,
): Promise<NotionInsertResult> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    return {
      success: false,
      message: `Markdown 文件不存在: ${absPath}`,
    };
  }

  const filename = path.basename(absPath);
  const raw = fs.readFileSync(absPath, 'utf8');
  const { title, body } = extractTitleAndBody(raw, filename);

  // 使用与你提供的数据库结构完全一致的字段名:
  // TITLE / STATUS / WECHAT / WWW / Created
  const db = await fetchDatabaseMeta(config);

  const baseProperties: Record<string, any> = {
    TITLE: {
      title: [
        {
          type: 'text',
          text: { content: title },
        },
      ],
    },
  };
  const properties = applyDefaultProperties(db, baseProperties);

  const children = markdownToParagraphBlocks(body || raw);

  const payload = {
    parent: { database_id: config.databaseId },
    properties,
    children,
  };

  const resp = await fetchWithRetry(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const data = await resp.json() as any;
      detail = data?.message || JSON.stringify(data);
    } catch {
      // ignore
    }
    return {
      success: false,
      message: `创建 Notion 页面失败(${resp.status}): ${detail || resp.statusText}`,
    };
  }

  const data = await resp.json() as any;
  return {
    success: true,
    message: '已成功在 Notion 数据库中创建记录。',
    pageId: data?.id,
    url: data?.url,
  };
}

