
import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, ArticleData, GenerationOptions, LLMProvider, SearchEngine } from './types';
import { fetchGlobalContext } from './services/search';
import { generateArticle } from './services/llm';
import { generateArticle as generateArticleGemini } from './services/llm_gemini';
import ArticleDisplay from './components/ArticleDisplay';
import ChatBot from './components/ChatBot';

const AUDIENCE_PRESETS = [
  { label: '泛科技读者 (一般)', value: '泛科技读者, 背景知识一般, 关注点优先级: 行业应用 > 技术特性, 语气自然, 行话密度中' },
  { label: '专业工程师 (深度)', value: '资深工程师, 背景知识专业, 关注点优先级: 技术特性 > 如何实现, 语气冷静客观, 行话密度高' },
  { label: 'K12 教师', value: 'K12教师（小学/初中/高中）, 背景知识可覆盖入门到专业, 关注点优先级: 行业应用 > 技术特性, 语气亲切到专业均可, 行话密度低到中' },
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

const LLM_PROVIDER_PRESETS: { label: string; value: LLMProvider }[] = [
  { label: 'OpenAI', value: 'OpenAI' },
  { label: 'Gemini', value: 'Gemini' },
];

// 文档结构化默认解析指令（用户可自由修改）
const DEFAULT_DOC_PROMPT = `你是一名文档结构化解析专家。

请从用户提供的文档中提取“完整的结构结构化信息”。请严格遵循以下要求：

【解析要求】
1. 识别文档的全部结构，包括但不限于：
   - 一级标题
   - 二级/三级标题
   - 段落
   - 列表（有序/无序）
   - 表格（以结构描述方式提取）
   - 图表（提供说明文字）
2. 保证章节的“层级关系“准确无误。

【抽取内容要求】
对于每一个结构单元，请输出以下字段：
- type（如：title / section / paragraph / list / table 等）
- level（如 1、2、3 级标题）
- title（若有）
- content（原文或部分摘要）
- children（如包含子结构） 

【鲁棒性要求】
- 文档可能格式混乱、换行不规范、层级缺失；请自动纠正并构建最佳结构化输出。
- 不要遗漏任何信息。
- 不要进行主观扩写，只提取实际内容。

你的目标是： **生成一份准确、完整、可用于程序处理的文档结构化结果。**`;

const App: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [audience, setAudience] = useState(AUDIENCE_PRESETS[0].value);
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [length, setLength] = useState(LENGTH_PRESETS[0].value);
  const [engine, setEngine] = useState<SearchEngine>('Tavily');
  const [provider, setProvider] = useState<LLMProvider>('OpenAI');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFilename, setSavedFilename] = useState<string | null>(null);
  const [wechatAppId, setWechatAppId] = useState('');
  const [wechatAppSecret, setWechatAppSecret] = useState('');
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string; stdout?: string; stderr?: string } | null>(null);
  // 文档解析（仅 Gemini）
  const [docPdfUrl, setDocPdfUrl] = useState('');
  const [docPrompt, setDocPrompt] = useState(DEFAULT_DOC_PROMPT);
  const [docParseStatus, setDocParseStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [docParseError, setDocParseError] = useState<string | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  /** 弹窗内模态：PDF 文档解析 | 原文本生成文章 */
  const [docModalMode, setDocModalMode] = useState<'pdf' | 'rawText'>('pdf');
  /** 原文本生成文章时的原始文本输入 */
  const [docRawText, setDocRawText] = useState('');

  const handleStartProcess = async () => {
    if (!keyword.trim()) return;

    setStatus(AppStatus.SEARCHING);
    setError(null);
    setArticle(null);
    setSavedFilename(null);
    setPublishResult(null);

    try {
      const { text: rawData, sources } = await fetchGlobalContext(keyword, engine);
      
      if (!rawData) {
        throw new Error('未能获取到任何有效信息，请检查关键词或 API 额度。');
      }

      setStatus(AppStatus.GENERATING);
      const options: GenerationOptions = { audience, length, style, engine, provider };
      const generatedContent = provider === 'Gemini'
        ? await generateArticleGemini(keyword, rawData, options)
        : await generateArticle(keyword, rawData, options);

      // 为生成的文章增加 Front-matter，并随机选择封面
      const coverCandidates = ['greencover.jpg', 'yellowcover.jpg', 'bluecover.jpg'];
      const randomCover = coverCandidates[Math.floor(Math.random() * coverCandidates.length)];
      const frontMatterLines = [
        '---',
        `title: ${keyword}`,
        'cover: /home/ubuntu/contentgen/medias/assets/' + randomCover,
        '---',
        '',
      ];
      const frontMatter = frontMatterLines.join('\n');
      const finalContent = frontMatter + generatedContent.trimStart();

      // 将带有 Front-matter 的内容保存为本地 Markdown 文件
      const saveResp = await fetch('/api/save-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent }),
      });

      if (!saveResp.ok) {
        const msg = await saveResp.text();
        throw new Error(msg || '保存 Markdown 文件失败，请稍后重试。');
      }
      const saveData = await saveResp.json() as { filename?: string };
      if (saveData.filename) setSavedFilename(saveData.filename);

      setArticle({
        title: keyword,
        content: finalContent,
        sources
      });
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      console.error('Process Error:', err);
      setError(err.message || '发生未知错误，请重试。');
      setStatus(AppStatus.ERROR);
    }
  };

  const handleParseDocument = async () => {
    if (!docPdfUrl.trim() || !docPrompt.trim()) return;

    // 文档解析采用与「立即整合」相同的生成与保存流程，只是数据来源改为 PDF
    setStatus(AppStatus.GENERATING);
    setError(null);
    setArticle(null);
    setSavedFilename(null);
    setPublishResult(null);
    setDocParseStatus('loading');
    setDocParseError(null);

    try {
      // 第一步：调用后端 API，用 Gemini 解析 PDF，获得原始文本/摘要
      const resp = await fetch('/api/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl: docPdfUrl.trim(), prompt: docPrompt.trim() }),
      });
      const rawText = await resp.text();
      if (!rawText?.trim()) {
        throw new Error(resp.ok ? '服务器返回空响应，请重试。' : `请求失败 (${resp.status})，请检查网络或稍后重试。`);
      }
      let data: { success: boolean; text?: string; message?: string };
      try {
        data = JSON.parse(rawText) as { success: boolean; text?: string; message?: string };
      } catch {
        throw new Error(resp.ok ? '服务器返回格式异常，请重试。' : `请求失败 (${resp.status})：${rawText.slice(0, 100)}`);
      }
      if (!data.success || !data.text) {
        throw new Error(data.message || '文档解析失败');
      }

      const rawDataFromPdf = data.text;

      // 第二步：沿用 llm_gemini.ts 中的系统提示与生成逻辑，直接用 Gemini 写文章
      const options: GenerationOptions = { audience, length, style, engine, provider };
      const usedKeyword = keyword.trim() || 'PDF 文档';
      const generatedContent = await generateArticleGemini(usedKeyword, rawDataFromPdf, options);

      // 与「立即整合」一致的 Front-matter + 随机封面 + 本地保存逻辑
      const coverCandidates = ['greencover.jpg', 'yellowcover.jpg', 'bluecover.jpg'];
      const randomCover = coverCandidates[Math.floor(Math.random() * coverCandidates.length)];
      const frontMatterLines = [
        '---',
        `title: ${usedKeyword}`,
        'cover: /home/ubuntu/contentgen/medias/assets/' + randomCover,
        '---',
        '',
      ];
      const frontMatter = frontMatterLines.join('\n');
      const finalContent = frontMatter + generatedContent.trimStart();

      const saveResp = await fetch('/api/save-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent }),
      });

      if (!saveResp.ok) {
        const msg = await saveResp.text();
        throw new Error(msg || '保存 Markdown 文件失败，请稍后重试。');
      }
      const saveData = await saveResp.json() as { filename?: string };
      if (saveData.filename) setSavedFilename(saveData.filename);

      const sources = docPdfUrl.trim()
        ? [{ title: usedKeyword, uri: docPdfUrl.trim() }]
        : [];

      setArticle({
        title: usedKeyword,
        content: finalContent,
        sources,
      });

      setStatus(AppStatus.COMPLETED);
      setIsDocModalOpen(false);
      setDocParseStatus('idle');
    } catch (e: any) {
      console.error('Doc Parse Error:', e);
      const msg = e?.message || '文档解析或写作失败，请重试。';
      setError(msg);
      setDocParseError(msg);
      setStatus(AppStatus.ERROR);
      setDocParseStatus('error');
    }
  };

  /** 原文本生成文章：用户输入的文本直接作为 rawData 传入生成逻辑 */
  const handleGenerateFromRawText = async () => {
    if (!docRawText.trim()) return;

    setStatus(AppStatus.GENERATING);
    setError(null);
    setArticle(null);
    setSavedFilename(null);
    setPublishResult(null);
    setDocParseStatus('loading');
    setDocParseError(null);

    try {
      const options: GenerationOptions = { audience, length, style, engine, provider };
      const usedKeyword = keyword.trim() || '原文本文章';
      const generatedContent = await generateArticleGemini(usedKeyword, docRawText.trim(), options);

      const coverCandidates = ['greencover.jpg', 'yellowcover.jpg', 'bluecover.jpg'];
      const randomCover = coverCandidates[Math.floor(Math.random() * coverCandidates.length)];
      const frontMatterLines = [
        '---',
        `title: ${usedKeyword}`,
        'cover: /home/ubuntu/contentgen/medias/assets/' + randomCover,
        '---',
        '',
      ];
      const frontMatter = frontMatterLines.join('\n');
      const finalContent = frontMatter + generatedContent.trimStart();

      const saveResp = await fetch('/api/save-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent }),
      });

      if (!saveResp.ok) {
        const msg = await saveResp.text();
        throw new Error(msg || '保存 Markdown 文件失败，请稍后重试。');
      }
      const saveData = await saveResp.json() as { filename?: string };
      if (saveData.filename) setSavedFilename(saveData.filename);

      setArticle({
        title: usedKeyword,
        content: finalContent,
        sources: [],
      });

      setStatus(AppStatus.COMPLETED);
      setIsDocModalOpen(false);
      setDocParseStatus('idle');
    } catch (e: any) {
      console.error('Raw Text Generate Error:', e);
      const msg = e?.message || '文章生成失败，请重试。';
      setError(msg);
      setDocParseError(msg);
      setStatus(AppStatus.ERROR);
      setDocParseStatus('error');
    }
  };

  const handlePublish = async () => {
    if (!wechatAppId.trim() || !wechatAppSecret.trim()) {
      setPublishResult({ success: false, message: '请填写 WECHAT_APP_ID 和 WECHAT_APP_SECRET' });
      return;
    }
    let filename = savedFilename;
    if (!filename && article?.content) {
      const saveResp = await fetch('/api/save-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article.content }),
      });
      if (!saveResp.ok) {
        setPublishResult({ success: false, message: '保存失败，无法发布' });
        return;
      }
      const saveData = await saveResp.json() as { filename?: string };
      filename = saveData.filename ?? null;
      if (filename) setSavedFilename(filename);
    }
    if (!filename) {
      setPublishResult({ success: false, message: '无可发布文件，请先生成文章' });
      return;
    }
    
    // 清空之前的结果
    setPublishResult(null);
    
    try {
      const resp = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, WECHAT_APP_ID: wechatAppId.trim(), WECHAT_APP_SECRET: wechatAppSecret.trim() }),
      });
      
      const text = await resp.text();
      let data: { success: boolean; message: string; stdout?: string; stderr?: string };
      try {
        data = text ? (JSON.parse(text) as { success: boolean; message: string; stdout?: string; stderr?: string }) : { success: false, message: '服务器未返回有效数据' };
      } catch {
        data = { success: false, message: resp.ok ? '响应格式异常' : `请求失败: ${resp.status} ${text || resp.statusText}` };
      }
      setPublishResult(data);
    } catch (e: any) {
      setPublishResult({
        success: false,
        message: e?.message || '网络请求失败',
      });
    }
  };


  useEffect(() => {
    if (status !== AppStatus.COMPLETED) return;
    fetch('/api/wechat-config')
      .then((r) => r.json())
      .then((data: { WECHAT_APP_ID?: string; WECHAT_APP_SECRET?: string }) => {
        if (data.WECHAT_APP_ID != null) setWechatAppId(String(data.WECHAT_APP_ID));
        if (data.WECHAT_APP_SECRET != null) setWechatAppSecret(String(data.WECHAT_APP_SECRET));
      })
      .catch(() => {});
  }, [status]);

  return (
    <div className="min-h-screen pb-20 font-sans bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 py-4 px-4 sticky top-0 z-40 backdrop-blur-md bg-white/80">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-start gap-4 md:gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l5 5v11a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Info.X</h1>
          </div>

          <div className="flex flex-col w-full md:w-auto gap-3">
            {/* 第一行：模型 / 搜索引擎 / 读者 / 风格 / 长度 + 两个按钮 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex flex-col gap-1 shrink-0">
                <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">模型</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as LLMProvider)}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                  disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
                >
                  {LLM_PROVIDER_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
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
              {provider === 'Gemini' && (
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(true)}
                  disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
                  className="bg-indigo-50 text-indigo-700 font-semibold py-2 px-4 rounded-lg text-xs hover:bg-indigo-100 disabled:opacity-50 disabled:pointer-events-none mt-auto sm:mt-5 whitespace-nowrap"
                >
                  多模态解析
                </button>
              )}
            </div>

            {/* 第二行：话题关键词 + 较长输入框 */}
            <div className="flex flex-col gap-1 pt-3 border-t border-gray-100">
              <span className="text-[10px] uppercase font-bold text-gray-400 ml-1">话题关键词</span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartProcess()}
                placeholder="输入话题..."
                className="border border-gray-200 rounded-lg px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all bg-white w-full max-w-xl min-w-[16rem]"
                disabled={status === AppStatus.SEARCHING || status === AppStatus.GENERATING}
              />
            </div>
          </div>
        </div>
      </header>

      {/* PDF 文档解析 / 原文本生成文章 弹窗（仅 Gemini） */}
      {provider === 'Gemini' && isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-3xl mx-4">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-900">文档解析与写作（Gemini）</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {docModalMode === 'pdf'
                    ? '输入 PDF 链接并调整解析指令，解析结果将按当前读者与风格生成文章。'
                    : '粘贴或输入原始文本，将直接作为素材按当前读者与风格生成文章。'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => docParseStatus !== 'loading' && setIsDocModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 rounded-full p-1.5 hover:bg-gray-100"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* 模态切换：PDF 文档解析 | 原文本生成文章 */}
              <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setDocModalMode('pdf')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors ${
                    docModalMode === 'pdf'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  PDF 文档解析
                </button>
                <button
                  type="button"
                  onClick={() => setDocModalMode('rawText')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors ${
                    docModalMode === 'rawText'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  原文本生成文章
                </button>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <span className="text-[10px] uppercase font-bold text-gray-400 mb-2 block">当前将用于生成文章的设置</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-700">
                  <div>
                    <span className="text-gray-400">读者人群：</span>
                    <span className="font-medium">{AUDIENCE_PRESETS.find(p => p.value === audience)?.label ?? audience}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">文章风格：</span>
                    <span className="font-medium">{STYLE_PRESETS.find(p => p.value === style)?.label ?? style}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">目标长度：</span>
                    <span className="font-medium">{LENGTH_PRESETS.find(p => p.value === length)?.label ?? length}</span>
                  </div>
                </div>
              </div>

              {docModalMode === 'pdf' ? (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700 mb-1.5 block">PDF 下载链接</span>
                    <input
                      type="url"
                      value={docPdfUrl}
                      onChange={(e) => setDocPdfUrl(e.target.value)}
                      placeholder="https://example.com/document.pdf"
                      className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      disabled={docParseStatus === 'loading' || status === AppStatus.GENERATING || status === AppStatus.SEARCHING}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700 mb-1.5 block">解析指令（可直接编辑）</span>
                    <textarea
                      value={docPrompt}
                      onChange={(e) => setDocPrompt(e.target.value)}
                      rows={10}
                      className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-xs leading-relaxed focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y min-h-[10rem]"
                      disabled={docParseStatus === 'loading' || status === AppStatus.GENERATING || status === AppStatus.SEARCHING}
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      默认提示词已针对「文档结构化解析」优化，你也可以根据具体文档类型微调要求。
                    </p>
                  </label>
                </>
              ) : (
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">原始文本（将作为抓取内容传入生成）</span>
                  <textarea
                    value={docRawText}
                    onChange={(e) => setDocRawText(e.target.value)}
                    rows={12}
                    placeholder="在此粘贴或输入原始文本，内容将直接作为「抓取内容」传入模型生成文章…"
                    className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-xs leading-relaxed focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y min-h-[12rem]"
                    disabled={docParseStatus === 'loading' || status === AppStatus.GENERATING || status === AppStatus.SEARCHING}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    此处内容会原样填入系统提示中的「抓取内容」并用于生成最终文章，无需先解析 PDF。
                  </p>
                </label>
              )}

              {docParseStatus === 'error' && docParseError && (
                <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  {docParseError}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => docParseStatus !== 'loading' && setIsDocModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-100"
                disabled={docParseStatus === 'loading'}
              >
                取消
              </button>
              {docModalMode === 'pdf' ? (
                <button
                  type="button"
                  onClick={handleParseDocument}
                  disabled={
                    !docPdfUrl.trim() ||
                    !docPrompt.trim() ||
                    docParseStatus === 'loading' ||
                    status === AppStatus.GENERATING ||
                    status === AppStatus.SEARCHING
                  }
                  className="bg-indigo-600 text-white text-xs font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                >
                  {docParseStatus === 'loading' ? (
                    <>
                      <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      解析并生成文章
                    </>
                  ) : (
                    '解析并生成文章'
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateFromRawText}
                  disabled={
                    !docRawText.trim() ||
                    docParseStatus === 'loading' ||
                    status === AppStatus.GENERATING ||
                    status === AppStatus.SEARCHING
                  }
                  className="bg-indigo-600 text-white text-xs font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                >
                  {docParseStatus === 'loading' ? (
                    <>
                      <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      生成文章
                    </>
                  ) : (
                    '生成文章'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 mt-12">
        {status === AppStatus.IDLE && !article && (
          <div className="text-center py-24 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="inline-block p-5 bg-indigo-50 rounded-3xl mb-8 text-indigo-600 shadow-inner">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-6 tracking-tight">多风格全球事实整合</h2>
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
                {status === AppStatus.SEARCHING ? `正在使用 ${engine} 检索事实数据...` : `正在使用 ${provider} 进行多风格整合写作...`}
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-10 max-w-4xl mx-auto mt-8 transition-all">
              <h3 className="text-xl font-bold text-gray-900 mb-3 border-b border-gray-50 pb-4">发布到微信公众号</h3>
              <p className="text-sm text-gray-500 mb-6">填写公众号配置后点击「确认发布到微信」，文章将上传至该公众号草稿箱。</p>
              <div className="space-y-4 mb-6">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700 mb-1.5 block">WECHAT_APP_ID</span>
                  <input
                    type="text"
                    value={wechatAppId}
                    onChange={(e) => setWechatAppId(e.target.value)}
                    placeholder="公众号 AppID"
                    className="block w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700 mb-1.5 block">WECHAT_APP_SECRET</span>
                  <input
                    type="password"
                    value={wechatAppSecret}
                    onChange={(e) => setWechatAppSecret(e.target.value)}
                    placeholder="公众号 AppSecret"
                    className="block w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handlePublish}
                  className="bg-indigo-600 text-white font-semibold py-2.5 px-6 rounded-lg text-sm hover:bg-indigo-700 active:scale-95 transition-all shadow-sm hover:shadow"
                >
                  确认发布到微信
                </button>
              </div>
              {publishResult && (
                <div className={`mt-6 p-4 rounded-xl text-sm border ${publishResult.success ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                  <p className="font-semibold">{publishResult.message}</p>
                  {publishResult.stdout && <pre className="mt-3 whitespace-pre-wrap opacity-75 text-xs">{publishResult.stdout}</pre>}
                  {publishResult.stderr && <pre className="mt-3 whitespace-pre-wrap text-red-600 text-xs">{publishResult.stderr}</pre>}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Persistent ChatBot */}
      {article && <ChatBot keyword={article.title} context={article.content} provider={provider} />}
      
      <footer className="mt-20 py-12 border-t border-gray-100 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <div className="flex items-center gap-6 opacity-40 grayscale hover:grayscale-0 transition-all">
            <span className="font-bold text-gray-500 text-sm">Dual Search: Tavily & Exa</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} v.20260218</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
