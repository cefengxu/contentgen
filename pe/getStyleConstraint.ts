/**
 * 从 pe/style-mapping.md 按「当前风格」检索约束内容，仅注入选中风格以节约 token。
 */

import styleMappingRaw from './style-mapping.md?raw';

const DEFAULT_STYLE = '科普+故事开场';

let cache: Record<string, string> | null = null;

function parseStyleMapping(): Record<string, string> {
  if (cache) return cache;
  const sections = styleMappingRaw.split(/\n(?=## )/);
  const map: Record<string, string> = {};
  for (const block of sections) {
    const firstLine = block.indexOf('\n');
    if (firstLine === -1) continue;
    const title = block.slice(0, firstLine).replace(/^##\s*/, '').trim();
    const content = block.slice(firstLine + 1).replace(/^---\s*$/gm, '').trim();
    if (title && content) map[title] = content;
  }
  cache = map;
  return map;
}

/**
 * 根据用户选择的风格返回对应的风格映射约束文本。
 * 若风格不在列表中则降级为「科普+故事开场」。
 */
export function getStyleConstraint(style: string): string {
  const map = parseStyleMapping();
  const key = style?.trim() || DEFAULT_STYLE;
  return map[key] ?? map[DEFAULT_STYLE] ?? '';
}
