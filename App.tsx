
import React, { useState } from 'react';
import { AppStatus, ArticleData, GenerationOptions, SearchEngine } from './types';
import { fetchGlobalContext, generateArticle } from './services/gemini';
import ArticleDisplay from './components/ArticleDisplay';
import ChatBot from './components/ChatBot';

const AUDIENCE_PRESETS = [
  { label: '泛科技读者 (一般)', value: '泛科技读者, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气自然, 行话密度中' },
  { label: '专业工程师 (深度)', value: '资深工程师, 背景知识专业, 关注点优先级: 技术特性 > 如何实现, 语气冷静客观, 行话密度高' },
  { label: '小学老师 (入门)', value: '小学老师, 背景知识入门, 关注点优先级: 行业应用 > 技术特性, 语气亲切自然, 行话密度低' },
  { label: '初中老师 (一般)', value: '初中老师, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气专业冷静, 行话密度中' },
  { label: '高中老师 (专业)', value: '高中老师, 背景知识专业, 关注点优先级: 行业应用 > 技术特性, 语气专业冷静, 行话密度中' },
  { label: '产品经理 (商业)', value: '产品经理, 背景知识一般, 关注点优先级: 市场与生态 > 行业应用, 语气专业冷静, 行话密度中' },
  { label: '券商分析师 (严谨)', value: '券商分析师, 背景知识专业, 关注点优先级: 市场与生态 > 合规与风险, 语气专业冷静, 行话密度中' },
];

const STYLE_PRESETS = [
  { label: '科普 + 故事开场 (默认)', value: '科普+故事开场' },
  { label: '新闻快讯', value: '新闻快讯' },
  { label: '深度解析', value: '深度解析' },
  { label: '案例研究', value: '案例研究' },
  { label: '数据观察', value: '数据观察' },
  { label: '访谈纪要', value: '访谈纪要' },
  { label: '时间线', value: '时间线' },
  { label: '事实核查', value: '事实核查' },
  { label: '行业简报', value: '行业简报' },
  { label: '产品测评', value: '产品测评' },
  { label: '半佛体 (Banfo)', value: '半佛体（Banfo）' },
];

const LENGTH_PRESETS = [
  { label: '500-800 字 (默认)', value: '500-800' },
  { label: '≤ 500 字 (精简)', value: '≤500' },
  { label: '800-1200 字 (深度)', value: '800-1200' },
];

const ENGINE_PRESETS: { label: string; value: SearchEngine }[] = [
  { label: 'Tavily (推荐)', value: 'Tavily' },
  { label: 'Exa (神经搜索)', value: 'Exa' },
];

const App: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [audience, setAudience] = useState(AUDIENCE_PRESETS[0].value);
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [length, setLength] = useState(LENGTH_PRESETS[0].value);
  const [engine, setEngine] = useState<SearchEngine>('Tavily');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartProcess = async () => {
    if (!keyword.trim()) return;

    setStatus(AppStatus.SEARCHING);
    setError(null);
    setArticle(null);

    try {
      const { text: rawData, sources } = await fetchGlobalContext(keyword, engine);
      
      if (!rawData) {
        throw new Error('未能获取到任何有效信息，请检查关键词或 API 额度。');
      }

      setStatus(AppStatus.GENERATING);
      const options: GenerationOptions = { audience, length, style, engine };
      const generatedContent = await generateArticle(keyword, rawData, options);

      setArticle({
        title: keyword,
        content: generatedContent,
        sources
      });
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      console.error('Process Error:', err);
      setError(err.message || '发生未知错误，请重试。');
      setStatus(AppStatus.ERROR);
    }
  };

  return (
    <div className="min-h-screen pb-20 font-sans bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 py-4 px-4 sticky top-0 z-40 backdrop-blur-md bg-white/80">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l5 5v11a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">内容整合代理 v2.5</h1>
          </div>

          <div className="flex flex-col sm:flex-row w-full md:w-auto items-stretch sm:items-center gap-3 overflow-x-auto pb-2 md:pb-0">
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">搜索引擎</span>
              <select 
                value={engine} 
                onChange={(e) => setEngine(e.target.value as SearchEngine)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              >
                {ENGINE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">读者人群</span>
              <select 
                value={audience} 
                onChange={(e) => setAudience(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              >
                {AUDIENCE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">文章风格</span>
              <select 
                value={style} 
                onChange={(e) => setStyle(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              >
                {STYLE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">目标长度</span>
              <select 
                value={length} 
                onChange={(e) => setLength(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              >
                {LENGTH_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 sm:w-48">
              <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">话题关键词</span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartProcess()}
                placeholder="输入话题..."
                className="border border-gray-200 rounded-lg px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all bg-white"
                disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              />
            </div>
            <button
              onClick={handleStartProcess}
              disabled={!keyword.trim() || status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg text-xs hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 shadow-md flex items-center justify-center gap-2 mt-auto sm:mt-5"
            >
              {(status === AppStatus.SEARCHING || status === AppStatus.GENERATING) ? (
                <>
                  <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  处理中
                </>
              ) : '立即整合'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 mt-12">
        {status === AppStatus.IDLE && !article && (
          <div className="text-center py-24 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="inline-block p-5 bg-indigo-50 rounded-3xl mb-8 text-indigo-600 shadow-inner">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-6 tracking-tight">多风格全球事实整合 v2.5</h2>
            <p className="text-gray-500 max-w-xl mx-auto leading-relaxed text-lg">
              集成了 Tavily 与 Exa 双搜索引擎，支持自动容错重试。
              提供 11 种专业文风与多维度的读者人群定制，确保信息硬核、准确且易读。
            </p>
          </div>
        )}

        {(status === AppStatus.SEARCHING || status === AppStatus.GENERATING) && (
          <div className="flex flex-col items-center justify-center py-40 space-y-8 animate-in fade-in duration-300">
            <div className="relative flex items-center justify-center">
              <div className="w-24 h-24 border-8 border-indigo-50 rounded-full"></div>
              <div className="w-24 h-24 border-8 border-t-indigo-600 rounded-full absolute top-0 animate-spin"></div>
              <div className="absolute text-indigo-600 font-bold text-xs">
                {status === AppStatus.SEARCHING ? 'SEARCH' : 'STYLE'}
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {status === AppStatus.SEARCHING ? `正在使用 ${engine} 检索事实数据...` : '正在进行多风格整合写作...'}
              </h3>
              <p className="text-gray-400 max-w-sm mx-auto text-sm leading-relaxed">
                正在执行严格的自检流程：核实数字单位、动词驱动优化、短句混排自适应。
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mt-10 bg-white border border-red-100 p-8 rounded-3xl shadow-xl shadow-red-500/5 animate-in shake duration-500">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-700 mb-2">生成异常</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{error}</p>
                <button 
                  onClick={handleStartProcess}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-2 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all active:scale-95"
                >
                  重试连接
                </button>
              </div>
            </div>
          </div>
        )}

        {article && status === AppStatus.COMPLETED && (
          <div className="animate-in fade-in duration-1000 slide-in-from-top-4">
             <ArticleDisplay content={article.content} sources={article.sources} />
          </div>
        )}
      </main>

      {/* Persistent ChatBot */}
      {article && <ChatBot keyword={article.title} context={article.content} />}
      
      <footer className="mt-20 py-12 border-t border-gray-100 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <div className="flex items-center gap-6 opacity-40 grayscale hover:grayscale-0 transition-all">
            <span className="font-bold text-gray-500 text-sm">Powered by Gemini 3 Pro</span>
            <span className="font-bold text-gray-500 text-sm">Dual Search: Tavily & Exa</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} 全球背景自动化代理 v2.5.0 - 严格班佛体节奏指标</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
