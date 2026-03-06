import path from 'path';
import fs from 'fs/promises';
// duck-duck-scrape 当前没有官方类型声明，先用 require + any 方式接入
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { imageSearch } = require('duck-duck-scrape') as { imageSearch: (query: string, opts: any) => Promise<any[]> };

export interface ImageDownloadOptions {
  outputDir?: string;
  num?: number;
}

/**
 * DuckDuckGo 图片搜索 + 下载
 * 通用工具函数，可在任意 Node 环境下复用
 */
export async function searchAndDownloadImages(
  query: string,
  options: ImageDownloadOptions = {},
): Promise<string[]> {
  const outputDir = options.outputDir ?? 'images';
  const num = options.num ?? 5;

  // 1. 调用 DuckDuckGo 图片搜索
  const results = await imageSearch(query, {
    safeSearch: 'moderate',
    maxResults: num,
  });

  // 2. 确保输出目录存在
  await fs.mkdir(outputDir, { recursive: true });

  const downloaded: string[] = [];

  // 3. 下载每一张图片
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const imgUrl = item.image;

    if (!imgUrl) continue;

    try {
      const res = await fetch(imgUrl);
      if (!res.ok) {
        console.warn(`Image download failed: HTTP ${res.status} - ${imgUrl}`);
        continue;
      }

      const arrayBuffer = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);

      const urlPath = new URL(imgUrl).pathname;
      const rawExt = urlPath.split('.').pop() || 'jpg';
      const ext = rawExt.slice(0, 4);
      const safeQuery = query.replace(/\s+/g, '_');

      const filename = `${safeQuery}_${i}.${ext}`;
      const filepath = path.join(outputDir, filename);

      await fs.writeFile(filepath, buf);
      downloaded.push(filepath);
    } catch (err) {
      console.error(`Image download error: ${imgUrl}`, err);
    }
  }

  return downloaded;
}

