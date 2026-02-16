import { SearchResult, SearchEngine } from '../types';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? '';
const EXA_API_KEY = process.env.EXA_API_KEY ?? '';

/**
 * Performs search using Tavily API.
 */
async function fetchFromTavily(query: string): Promise<{ text: string; sources: SearchResult[] }> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      include_answer: 'basic',
      search_depth: 'basic',
      max_results: 10,
      time_range: 'month',
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily Error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('Tavily No Results');
  }

  const sources: SearchResult[] = data.results.map((r: any) => ({
    title: r.title || '无标题',
    uri: r.url || ''
  }));

  const textContent = data.results
    .map((r: any, idx: number) => `[Source ${idx + 1}]\nTitle: ${r.title}\nContent: ${r.content ?? ''}\nURL: ${r.url}`)
    .join('\n\n');

  return { text: textContent, sources };
}

/**
 * Performs search using Exa API.
 */
async function fetchFromExa(query: string): Promise<{ text: string; sources: SearchResult[] }> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: 10,
      type: 'auto',
      contents: {
        highlights: {
          maxCharacters: 4000,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa Error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('Exa No Results');
  }

  const sources: SearchResult[] = data.results.map((r: any) => ({
    title: r.title || '无标题',
    uri: r.url || ''
  }));

  const textContent = data.results
    .map((r: any, idx: number) => {
      const content = Array.isArray(r.highlights) ? r.highlights.join('\n') : (r.snippet || 'No snippet');
      return `[Source ${idx + 1}]\nTitle: ${r.title}\nContent: ${content}\nURL: ${r.url}`;
    })
    .join('\n\n');

  return { text: textContent, sources };
}

/**
 * Performs a broad search with automatic retry/switching logic.
 */
export const fetchGlobalContext = async (keyword: string, engine: SearchEngine): Promise<{ text: string; sources: SearchResult[] }> => {
  const primary = engine;
  const secondary = engine === 'Tavily' ? 'Exa' : 'Tavily';

  const performFetch = (eng: SearchEngine) => eng === 'Tavily' ? fetchFromTavily(keyword) : fetchFromExa(keyword);

  try {
    return await performFetch(primary);
  } catch (err) {
    console.warn(`Primary search engine (${primary}) failed, retrying with ${secondary}...`, err);
    try {
      return await performFetch(secondary);
    } catch (err2) {
      throw new Error(`检索失败：${primary} 及备用 ${secondary} 均不可用。`);
    }
  }
};
