import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cpu,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  ExternalLink,
  Flame,
  Moon,
  Shield,
  Layers,
  Sparkles,
  Zap,
  Lock,
  Globe,
  Award,
  Smartphone,
  Check,
  Users,
  Copy,
  Square,
  MessageSquare,
  RotateCcw,
  Bot,
} from 'lucide-react';
import { PaperDigest, UserTrialProfile, TelegramDispatchRecord } from '../types/research';

export const ResearchPaperEngineView: React.FC = () => {
  const [digest, setDigest] = useState<PaperDigest | null>(null);
  const [userProfile, setUserProfile] = useState<UserTrialProfile | null>(null);
  const [candidateCount, setCandidateCount] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Real-time AI Streaming State (ChatGPT-style progressive streaming)
  const [streamPrompt, setStreamPrompt] = useState<string>('');
  const [streamedAnalysis, setStreamedAnalysis] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [activeStreamQuestion, setActiveStreamQuestion] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamOutputRef = useRef<HTMLDivElement | null>(null);

  // Telegram status telemetry
  const [telegramStatus, setTelegramStatus] = useState<{
    enabled: boolean;
    botUsername: string;
    botFirstName: string;
    chatIdMasked: string;
    tokenMasked: string;
    history: TelegramDispatchRecord[];
  } | null>(null);

  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // 1. Fetch today's 4D recommended research paper and digest
      const paperRes = await fetch(`/api/research/today${forceRefresh ? '?refresh=true' : ''}`);
      if (paperRes.ok) {
        const json = await paperRes.json();
        setDigest(json.digest);
        setUserProfile(json.user);
        setCandidateCount(json.candidatePapersCount || 10);
      }

      // 2. Fetch Telegram status & audit trail
      const tgRes = await fetch('/api/research/telegram-status');
      if (tgRes.ok) {
        const tgJson = await tgRes.json();
        setTelegramStatus(tgJson);
      }

      // 3. Fetch dynamically registered users list
      const usersRes = await fetch('/api/research/users');
      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        setRegisteredUsers(usersJson.users || []);
      }
    } catch (err: any) {
      console.error('Failed to load research data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSendToTelegram = async () => {
    setIsSendingTelegram(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/research/send-telegram', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        const hasPdf = data.dispatchRecord?.pdfDocumentDelivered;
        setActionNotice({
          text: `সফলভাবে টেলিগ্রামে পাঠানো হয়েছে! [📝 টেক্সট সারাংশ (ID: #${data.dispatchRecord?.telegramMessageId || 'OK'}) ${hasPdf ? '+ 📄 অ্যাটাচড A4 PDF ফাইল (Doc ID: #' + data.dispatchRecord?.pdfDocumentMessageId + ')' : ''}]`,
          type: 'success',
        });
        if (data.user) {
          setUserProfile(data.user);
        }
        // Refresh telegram status to show new dispatch log
        const tgRes = await fetch('/api/research/telegram-status');
        if (tgRes.ok) setTelegramStatus(await tgRes.json());
      } else {
        setActionNotice({
          text: data.message || 'টেলিগ্রামে বার্তা পাঠাতে সমস্যা হয়েছে।',
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionNotice({
        text: `Error sending to Telegram: ${err.message}`,
        type: 'error',
      });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const handleRatePaper = async (rating: 'HELPFUL' | 'NOT_HELPFUL') => {
    if (!digest) return;
    try {
      const res = await fetch('/api/research/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperId: digest.paper.arxivId,
          paperTitle: digest.paper.title,
          rating,
          topicTags: digest.scores.matchedThemes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
        setActionNotice({
          text: rating === 'HELPFUL' ? '🔥 রেটিং সেভ হয়েছে (ভেক্টর আপডেট হয়েছে)!' : '💤 স্কিপ নোটেড (ভেক্টর পেনাল্টি যুক্ত হয়েছে)!',
          type: 'success',
        });
      }
    } catch (err: any) {
      console.error('Rating failed:', err);
    }
  };

  const handleUpdateLanguage = async (newLang: 'bn' | 'en') => {
    if (!userProfile) return;
    setIsUpdatingUser(true);
    try {
      const res = await fetch('/api/research/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_language: newLang,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
        // Re-generate digest in chosen language
        await fetchData(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleSetTrialDay = async (day: number) => {
    if (!userProfile) return;
    setIsUpdatingUser(true);
    try {
      const res = await fetch('/api/research/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_day_count: day,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
        setActionNotice({
          text: `ট্রায়াল স্টেজ পরিবর্তন করা হয়েছে: দিন ${day}`,
          type: 'success',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleTogglePaidStatus = async () => {
    if (!userProfile) return;
    const newStatus = userProfile.status === 'paid_subscriber' ? 'active_trial' : 'paid_subscriber';
    setIsUpdatingUser(true);
    try {
      const res = await fetch('/api/research/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleResetTrial = async () => {
    setIsUpdatingUser(true);
    try {
      const res = await fetch('/api/research/user/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
        setActionNotice({
          text: '৭ দিনের ট্রায়াল সফলভাবে দিন ১ এ রিসেট হয়েছে।',
          type: 'success',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleToggleTelegramAuto = async () => {
    try {
      const res = await fetch('/api/research/telegram-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !telegramStatus?.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setTelegramStatus((prev) => (prev ? { ...prev, enabled: data.enabled } : null));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Real-time AI Streaming Handlers
  const handleStartStream = async (customPrompt?: string) => {
    if (!digest) return;
    const query = (customPrompt || streamPrompt).trim();
    if (!query) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setStreamError(null);
    setStreamedAnalysis('');
    setActiveStreamQuestion(query);

    const lang = userProfile?.preferred_language || 'bn';

    try {
      const response = await fetch('/api/research/stream-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          paperTitle: digest.paper.title,
          paperAbstract: digest.paper.summary,
          language: lang,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to initiate streaming`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response body is unavailable');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';
      let rafId: number | null = null;

      const scheduleFlush = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            setStreamedAnalysis(accumulated);
            rafId = null;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          const trimmed = block.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'chunk' && data.text) {
              accumulated += data.text;
              scheduleFlush();
            } else if (data.type === 'done') {
              if (data.fullText && !accumulated) {
                accumulated = data.fullText;
              }
            } else if (data.type === 'error') {
              throw new Error(data.message || 'Stream error occurred');
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('Unexpected end of JSON')) {
              console.warn('[Stream Parse Warning]:', e.message);
            }
          }
        }
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      setStreamedAnalysis(accumulated);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[ResearchPaperEngine] Streaming stopped by user.');
      } else {
        console.error('[ResearchPaperEngine] Stream generation failure:', err);
        setStreamError(err?.message || 'Error occurred during streaming generation');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleCopyStream = async () => {
    if (!streamedAnalysis) return;
    try {
      await navigator.clipboard.writeText(streamedAnalysis);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const handleClearStream = () => {
    if (isStreaming) handleStopStream();
    setStreamedAnalysis('');
    setActiveStreamQuestion('');
    setStreamError(null);
  };

  const renderFormattedInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 text-[11px] font-mono border border-slate-800">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const renderStreamedMarkdown = (text: string) => {
    if (!text) return null;
    const paragraphs = text.split('\n\n');
    return paragraphs.map((para, pIdx) => {
      const lines = para.split('\n');
      const isBulletList = lines.every((l) => l.trim().startsWith('* ') || l.trim().startsWith('- ') || l.trim() === '');
      if (isBulletList) {
        return (
          <ul key={pIdx} className="space-y-1.5 my-2 pl-4 list-disc list-outside text-slate-200">
            {lines.filter((l) => l.trim().length > 0).map((line, lIdx) => {
              const clean = line.trim().replace(/^[\*\-]\s+/, '');
              return (
                <li key={lIdx} className="leading-relaxed">
                  {renderFormattedInline(clean)}
                </li>
              );
            })}
          </ul>
        );
      }

      const isNumberedList = lines.every((l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === '');
      if (isNumberedList) {
        return (
          <ol key={pIdx} className="space-y-1.5 my-2 pl-5 list-decimal list-outside text-slate-200">
            {lines.filter((l) => l.trim().length > 0).map((line, lIdx) => {
              const clean = line.trim().replace(/^\d+\.\s+/, '');
              return (
                <li key={lIdx} className="leading-relaxed">
                  {renderFormattedInline(clean)}
                </li>
              );
            })}
          </ol>
        );
      }

      if (para.startsWith('### ')) {
        return (
          <h4 key={pIdx} className="text-sm font-bold font-mono text-cyan-300 mt-3 mb-1.5">
            {renderFormattedInline(para.slice(4))}
          </h4>
        );
      }
      if (para.startsWith('## ')) {
        return (
          <h3 key={pIdx} className="text-base font-bold font-mono text-white mt-4 mb-2">
            {renderFormattedInline(para.slice(3))}
          </h3>
        );
      }

      return (
        <p key={pIdx} className="leading-relaxed text-slate-200 my-1.5">
          {renderFormattedInline(para)}
        </p>
      );
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Architecture Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 p-5 sm:p-6 shadow-2xl shadow-indigo-950/20">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-mono font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Google Cloud Serverless Architecture
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-mono font-bold">
                9:30 AM IST Daily Auto-Dispatch
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-mono font-bold flex items-center gap-1">
                <FileText className="w-3 h-3" /> Text Format + PDF Document
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white uppercase">
              Automated 9:30 AM Daily News &amp; Research Delivery (Text + PDF)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Google Cloud সার্ভারলেস ব্যাকএন্ডে প্রতিদিন ঠিক <strong>সকাল ৯:৩০ IST</strong>-এ স্বয়ংক্রিয়ভাবে কার্যকর হয়।
              ম্যাকবুক বন্ধ থাকলেও ক্লাউড শিডিউলার শীর্ষ ২৪ ঘণ্টার যাচাইকৃত টেক নিউজ ও #১ ব্রেকথ্রু গবেষণা পেপার সংগ্রহ করে
              একসাথে <strong>টেক্সট সারাংশ ফরম্যাট</strong> এবং <strong>অফিশিয়াল A4 PDF ডকুমেন্ট ফাইল</strong> আকারে টেলিগ্রাম ও ইমেইলে পাঠিয়ে দেয়।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <button
              onClick={handleSendToTelegram}
              disabled={isSendingTelegram || isLoading}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-sky-950/50 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${isSendingTelegram ? 'animate-spin' : ''}`} />
              <span>{isSendingTelegram ? 'টেলিগ্রামে পাঠানো হচ্ছে...' : 'Send Live to Telegram'}</span>
            </button>

            <button
              onClick={() => fetchData(true)}
              disabled={isLoading}
              className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="নতুন পেপার ও ৪D ভেক্টর রিফ্রেশ করুন"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 5 Core Cloud Modules Visual Pipeline */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-3">
            ৫টি মূল সার্ভারলেস মডিউল (Google Cloud Zero-Cost Blueprint):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> মডিউল ১: Cloud Scheduler
              </span>
              <p className="text-[11px] text-slate-400 font-sans">
                ক্রন: <code>30 9 * * *</code> (Asia/Kolkata). ঠিক সকাল ৯:৩০-এ অটোমেটিক ক্লাউড ট্রিগার।
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> মডিউল ২: Cloud Run Backend
              </span>
              <p className="text-[11px] text-slate-400 font-sans">
                সার্ভারলেস কন্টেইনার। কাজ শেষে স্লিপ মোড (০ খরচ)। ২০ লাখ রিকোয়েস্ট ফ্রি।
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> মডিউল ৩: Firestore DB
              </span>
              <p className="text-[11px] text-slate-400 font-sans">
                ৭-দিনের ট্রায়াল ট্র্যাকার, ভেক্টর প্রোফাইল ও ইউজার ফিডব্যাক পারসিস্টেন্স।
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> মডিউল ৪: 4D Time Engine
              </span>
              <p className="text-[11px] text-slate-400 font-sans">
                arXiv থেকে খাঁটি পেপার + A·B ডট প্রোডাক্ট + জেমিনাই ৩.৮ ফ্ল্যাশ ৩-পয়েন্ট ডাইজেস্ট।
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-rose-400 font-bold flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> মডিউল ৫: Telegram Bot
              </span>
              <p className="text-[11px] text-slate-400 font-sans">
                দিন অনুযায়ী সাইকোলজিক্যাল মেসেজ: দিন ১-৫ সারাংশ, দিন ৬ প্রি-লস, দিন ৭ পেওয়াল।
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Action Notification */}
      {actionNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs font-mono flex items-center justify-between gap-3 border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800 text-rose-300'
          }`}
        >
          <span className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            {actionNotice.text}
          </span>
          <button
            onClick={() => setActionNotice(null)}
            className="underline text-slate-400 hover:text-white cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Left Column (Trial Tracker & 4D Paper) / Right Column (Telegram Simulator & Security) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Modules 3 & 4 */}
        <div className="lg:col-span-7 space-y-6">

          {/* Module 3: 7-Day Trial Tracker Interactive Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    মডিউল ৩: ৭-দিনের ট্রায়াল ট্র্যাকার (Firestore NoSQL)
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">
                    User ID: <code className="text-cyan-400 font-bold">{telegramStatus?.chatIdMasked || '8204••••27'}</code>
                  </span>
                </div>
              </div>

              {/* Language Switcher */}
              <div className="flex items-center p-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
                <button
                  onClick={() => handleUpdateLanguage('bn')}
                  disabled={isUpdatingUser}
                  className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                    userProfile?.preferred_language === 'bn'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇮🇳 বাংলা (ভারত)
                </button>
                <button
                  onClick={() => handleUpdateLanguage('en')}
                  disabled={isUpdatingUser}
                  className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                    userProfile?.preferred_language === 'en'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇺🇸 English
                </button>
              </div>
            </div>

            {/* Trial Stage Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">
                  {userProfile?.status === 'paid_subscriber' ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <Award className="w-4 h-4" /> পেইড সাবস্ক্রাইবার (আনলিমিটেড অ্যাক্সেস)
                    </span>
                  ) : (
                    <span>বর্তমান ট্রায়াল স্টেজ: দিন {userProfile?.trial_day_count || 1} / ৭</span>
                  )}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    userProfile?.status === 'paid_subscriber'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : userProfile?.trial_day_count === 6
                      ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                      : userProfile?.trial_day_count && userProfile.trial_day_count >= 7
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  }`}
                >
                  {userProfile?.status === 'paid_subscriber'
                    ? 'PAID SUBSCRIBER'
                    : userProfile?.trial_day_count === 6
                    ? 'DAY 6: PRE-LOSS WARNING'
                    : userProfile?.trial_day_count && userProfile.trial_day_count >= 7
                    ? 'DAY 7: THE CUT-OFF (PAYWALL)'
                    : `DAY ${userProfile?.trial_day_count || 1}: ACTIVE TRIAL`}
                </span>
              </div>

              {/* 7-Segment Progress Track */}
              <div className="grid grid-cols-7 gap-1.5 h-3">
                {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
                  const currentDay = userProfile?.trial_day_count || 1;
                  const isCurrent = currentDay === dayNum;
                  const isPassed = currentDay > dayNum;
                  const isWarning = dayNum === 6;
                  const isCutoff = dayNum === 7;

                  return (
                    <div
                      key={dayNum}
                      onClick={() => handleSetTrialDay(dayNum)}
                      title={`ক্লিক করে দিন ${dayNum}-এ সুইচ করুন`}
                      className={`h-full rounded cursor-pointer transition-all ${
                        userProfile?.status === 'paid_subscriber'
                          ? 'bg-emerald-500'
                          : isCurrent
                          ? isCutoff
                            ? 'bg-rose-500 ring-2 ring-rose-400'
                            : isWarning
                            ? 'bg-amber-400 ring-2 ring-amber-300'
                            : 'bg-cyan-400 ring-2 ring-cyan-300'
                          : isPassed
                          ? 'bg-indigo-600/70'
                          : 'bg-slate-800 hover:bg-slate-700'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-0.5">
                <span>দিন ১ (শুরু)</span>
                <span>দিন ৫ (ফ্রি)</span>
                <span className="text-amber-400">দিন ৬ (২৪ঘণ্টা বাকি)</span>
                <span className="text-rose-400">দিন ৭ (সমাপ্তি/পেওয়াল)</span>
              </div>
            </div>

            {/* Quick Testing Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs font-mono">
              <span className="text-slate-400 text-[11px]">টেস্টিং সিমুলেশন:</span>
              <button
                onClick={() => handleSetTrialDay(1)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                দিন ১
              </button>
              <button
                onClick={() => handleSetTrialDay(6)}
                className="px-2.5 py-1 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 cursor-pointer"
                title="দিন ৬ প্রি-লস সাইকোলজিক্যাল নোটিশ পরীক্ষা"
              >
                দিন ৬ (Pre-loss)
              </button>
              <button
                onClick={() => handleSetTrialDay(7)}
                className="px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 cursor-pointer"
                title="দিন ৭ কাট-অফ পেওয়াল পরীক্ষা"
              >
                দিন ৭ (Cut-off)
              </button>
              <button
                onClick={handleTogglePaidStatus}
                className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 cursor-pointer"
              >
                {userProfile?.status === 'paid_subscriber' ? 'Set as Trial' : 'Set as Paid'}
              </button>
              <button
                onClick={handleResetTrial}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white ml-auto cursor-pointer"
              >
                Reset Trial
              </button>
            </div>
          </div>

          {/* Module 4: Today's #1 Breakthrough arXiv Paper & 4D Model Selection */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-950 border border-amber-800 text-amber-400">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    মডিউল ৪: ৪D টাইম ও রিয়েল-টাইম কনটেন্ট ইঞ্জিন
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">
                    arXiv লাইভ পুল ({candidateCount} টি পরীক্ষিত পেপারের মধ্যে নির্বাচিত #১ সেরা)
                  </span>
                </div>
              </div>

              {digest?.scores && (
                <div className="px-3 py-1 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs font-mono font-bold self-start sm:self-auto">
                  ৪D স্কোর: {digest.scores.composite4DScore} / ১০০
                </div>
              )}
            </div>

            {/* Paper Header */}
            {digest?.paper ? (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-mono font-bold">
                      arXiv:{digest.paper.arxivId}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono">
                      {digest.paper.primaryCategory}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(digest.paper.publishedDate).toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold font-mono text-white leading-snug">
                    {digest.paper.title}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    Authors: {digest.paper.authors.join(', ')}
                  </p>
                </div>

                {/* 4D Vector Breakdown Badges */}
                {digest.scores && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">১. A·B ডট প্রোডাক্ট</span>
                      <span className="text-sm font-bold text-cyan-400">{digest.scores.semanticRelevance}%</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">২. ২৪ঘণ্টা রিকেন্সি</span>
                      <span className="text-sm font-bold text-emerald-400">{digest.scores.timeRecency}%</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">৩. সকাল ৯:৩০ উইন্ডো</span>
                      <span className="text-sm font-bold text-indigo-400">{digest.scores.morningCognitiveFit}%</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">৪. ইউজার ভেক্টর ম্যাচ</span>
                      <span className="text-sm font-bold text-amber-400">{digest.scores.feedbackVelocity}%</span>
                    </div>
                  </div>
                )}

                {/* Gemini 3.8 Flash 3-Point Digest Card */}
                <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-mono font-bold text-indigo-300 uppercase tracking-wider">
                      জেমিনাই ৩.৮ ফ্ল্যাশ ৩-পয়েন্ট গবেষণা সারাংশ ({digest.language === 'bn' ? 'বাংলা' : 'English'})
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-200 font-sans leading-relaxed">
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="font-semibold text-cyan-300 mb-0.5">🔍 আবিষ্কার (Key Discovery):</p>
                      <p>{digest.discoveryBullet.replace(/^🔍\s*\*\*আবিष्कार:\*\*\s*/i, '').replace(/^🔍\s*\*\*Key Discovery:\*\*\s*/i, '')}</p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="font-semibold text-emerald-300 mb-0.5">⚙️ মেথডোলজি (Methodology):</p>
                      <p>{digest.methodologyBullet.replace(/^⚙️\s*\*\*মেথডোলজি:\*\*\s*/i, '').replace(/^⚙️\s*\*\*Methodology:\*\*\s*/i, '')}</p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="font-semibold text-amber-300 mb-0.5">🚀 বাস্তব প্রয়োগ (Real-World Applications):</p>
                      <p>{digest.applicationBullet.replace(/^🚀\s*\*\*বাস্তব প্রয়োগ:\*\*\s*/i, '').replace(/^🚀\s*\*\*Real-World Application:\*\*\s*/i, '')}</p>
                    </div>
                  </div>

                  {/* Actions & Rating Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px]">রেটিং দিন:</span>
                      <button
                        onClick={() => handleRatePaper('HELPFUL')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 cursor-pointer transition-colors"
                      >
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span>🔥 দরকারী</span>
                      </button>
                      <button
                        onClick={() => handleRatePaper('NOT_HELPFUL')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>💤 ভালো লাগেনি</span>
                      </button>
                    </div>

                    <a
                      href={digest.paper.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>অফিসিয়াল PDF ডাউনলোড</span>
                      <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                    </a>
                  </div>

                  {/* Interactive AI Research Assistant (Real-Time ChatGPT-Style Streaming) */}
                  <div className="mt-4 p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 space-y-3.5 shadow-xl shadow-cyan-950/10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            {userProfile?.preferred_language === 'en'
                              ? 'Interactive AI Research Assistant (Live Streaming)'
                              : 'ইন্টারেক্টিভ এআই গবেষণা সহকারী (রিয়েল-টাইম লাইভ স্ট্রিমিং)'}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {userProfile?.preferred_language === 'en'
                              ? 'Ask in-depth technical questions with progressive token delivery'
                              : 'প্রোগ্রেসিভ টোকেন স্ট্রিমিংয়ের মাধ্যমে যেকোনো গভীর প্রযুক্তিগত প্রশ্ন করুন'}
                          </span>
                        </div>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1.5 self-start sm:self-auto">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        ChatGPT-Style Stream
                      </span>
                    </div>

                    {/* Quick Preset Query Chips */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                        {userProfile?.preferred_language === 'en' ? 'Quick Research Prompts:' : 'দ্রুত প্রশ্ন সাজেশন:'}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        {(userProfile?.preferred_language === 'en'
                          ? [
                              {
                                label: '🧠 Neural Architecture & Math Core',
                                query: 'Explain the core neural network architecture, mathematical principles, and theoretical novelty of this paper.',
                              },
                              {
                                label: '🚀 Industry Applications & Impact',
                                query: 'What are the commercial applications, enterprise implications, and practical takeaways of this research?',
                              },
                              {
                                label: '⚠️ Limitations & Edge Cases',
                                query: 'Analyze the key limitations, computational overhead, and future research directions for this paper.',
                              },
                              {
                                label: '📑 Executive Technical Synthesis',
                                query: 'Provide a structured executive synthesis suitable for CTOs, technical directors, and engineering leaders.',
                              },
                            ]
                          : [
                              {
                                label: '🧠 মডেল আর্কিটেকচার ও গাণিতিক ভিত্তি',
                                query: 'এই পেপারের মডেল আর্কিটেকচার, নিউরাল লেয়ার ও গাণিতিক ভিত্তি বাংলায় বিশদভাবে ব্যাখ্যা করুন।',
                              },
                              {
                                label: '🚀 ইন্ডাস্ট্রি প্রয়োগ ও বাণিজ্যিক প্রভাব',
                                query: 'বাস্তব সফটওয়্যার ও বাণিজ্যিক এআই সিস্টেমে এই গবেষণার বাস্তব প্রয়োগ ও অর্থনৈতিক প্রভাব কী?',
                              },
                              {
                                label: '⚠️ সীমাবদ্ধতা ও ভবিষ্যতের সুযোগ',
                                query: 'এই গবেষণার মূল সীমাবদ্ধতা, কম্পিউটেশনাল কস্ট এবং ভবিষ্যৎ চ্যালেঞ্জগুলো বিশ্লেষণ করুন।',
                              },
                              {
                                label: '📑 এক্সিকিউটিভ লিডারশিপ সামারি',
                                query: 'প্রযুক্তি প্রধান ও ইঞ্জিনিয়ারিং লিডারদের জন্য একটি সংক্ষিপ্ত উচ্চস্তরের এক্সিকিউটিভ টেক সামারি দিন।',
                              },
                            ]
                        ).map((preset, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleStartStream(preset.query)}
                            disabled={isStreaming}
                            className="p-2 text-left rounded-lg bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 transition-all text-[11px] cursor-pointer disabled:opacity-50 active:scale-[0.99] flex items-center justify-between group"
                          >
                            <span>{preset.label}</span>
                            <Send className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-1" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Input & Action Controls */}
                    <div className="space-y-2 pt-1">
                      <div className="relative">
                        <textarea
                          value={streamPrompt}
                          onChange={(e) => setStreamPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (!isStreaming) handleStartStream();
                            }
                          }}
                          placeholder={
                            userProfile?.preferred_language === 'en'
                              ? 'Ask any technical question about this breakthrough research paper (Press Enter to stream)...'
                              : 'আজকের পেপার নিয়ে যেকোনো প্রশ্ন লিখুন (যেমন: মডেলের ট্রেনিং মেথডোলজি কীভাবে কাজ করে? Enter চাপুন)...'
                          }
                          rows={2}
                          className="w-full rounded-xl bg-slate-900/90 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 p-3 text-xs text-white placeholder-slate-500 resize-none font-sans outline-none transition-colors"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <span className="text-[10px] font-mono text-slate-500">
                          {userProfile?.preferred_language === 'en'
                            ? '💡 Powered by Google GenAI Streaming API'
                            : '💡 গুগল জেনএআই অফিসিয়াল স্ট্রিমিং এপিআই দ্বারা পরিচালিত'}
                        </span>

                        <div className="flex items-center gap-2">
                          {isStreaming ? (
                            <button
                              onClick={handleStopStream}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-950/40 cursor-pointer active:scale-95"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              <span>{userProfile?.preferred_language === 'en' ? 'Stop Stream' : 'স্ট্রিম থামান'}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartStream()}
                              disabled={!streamPrompt.trim() || isStreaming}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-cyan-950/40 cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {userProfile?.preferred_language === 'en'
                                  ? 'Stream Live Analysis'
                                  : 'লাইভ স্ট্রিম বিশ্লেষণ'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stream Output Card (ChatGPT-Style Progressive Delivery) */}
                    {(isStreaming || streamedAnalysis || streamError) && (
                      <div
                        ref={streamOutputRef}
                        className="rounded-xl border border-cyan-500/40 bg-slate-950/95 p-4 space-y-3 shadow-2xl shadow-cyan-950/30 transition-all animate-in fade-in duration-300"
                      >
                        {/* Stream Header & Telemetry */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            {isStreaming ? (
                              <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                <span className="animate-pulse">
                                  {userProfile?.preferred_language === 'en'
                                    ? 'Streaming real-time analysis...'
                                    : 'এআই রিয়েল-টাইমে বিশ্লেষণ স্ট্রিম করছে...'}
                                </span>
                              </span>
                            ) : streamError ? (
                              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {userProfile?.preferred_language === 'en' ? 'Stream Interrupted' : 'স্ট্রিমে সমস্যা হয়েছে'}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {userProfile?.preferred_language === 'en' ? 'Analysis Complete' : 'বিশ্লেষণ সম্পন্ন'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {streamedAnalysis && (
                              <button
                                onClick={handleCopyStream}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px]"
                                title="কপি করুন"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">কপি হয়েছে!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>কপি</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              onClick={handleClearStream}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-[11px]"
                              title="ক্লিয়ার করুন"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>ক্লিয়ার</span>
                            </button>
                          </div>
                        </div>

                        {/* Prompt context banner */}
                        {activeStreamQuestion && (
                          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] font-mono text-cyan-300/90 flex items-start gap-2">
                            <Bot className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                            <span className="leading-relaxed">
                              <strong>প্রশ্ন:</strong> {activeStreamQuestion}
                            </span>
                          </div>
                        )}

                        {/* Rendered Progressive Markdown Stream with typing cursor */}
                        {streamedAnalysis && (
                          <div className="text-xs text-slate-100 font-sans leading-relaxed tracking-normal select-text">
                            {renderStreamedMarkdown(streamedAnalysis)}
                            {isStreaming && (
                              <span className="inline-block w-2 h-4.5 bg-cyan-400 animate-pulse ml-1 align-middle rounded-xs" />
                            )}
                          </div>
                        )}

                        {/* Error Notice */}
                        {streamError && (
                          <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono flex items-center justify-between gap-2">
                            <span>{streamError}</span>
                            <button
                              onClick={() => handleStartStream(activeStreamQuestion)}
                              className="px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 text-white text-[10px] uppercase font-bold cursor-pointer"
                            >
                              পুনরায় চেষ্টা করুন
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs font-mono">
                গবেষণা পেপার লোড হচ্ছে...
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Module 5 & Security Credentials */}
        <div className="lg:col-span-5 space-y-6">

          {/* Module 5: Psychological Delivery Live Simulator (Telegram Mobile Mockup) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    মডিউল ৫: টেলিগ্রাম সাইকোলজিক্যাল ডেলিভারি
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">
                    সকাল ৯:৩০ IST ডেলিভারি প্রিভিউ
                  </span>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE PREVIEW
              </span>
            </div>

            {/* Telegram Simulated Mobile Card */}
            <div className="rounded-xl border border-sky-900/40 bg-[#17212b] p-4 text-slate-200 font-sans text-xs space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-[#242f3d] pb-2 text-[11px] text-sky-300 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <strong>@{telegramStatus?.botUsername || 'SubhadipMorningBot'}</strong>
                </span>
                <span className="text-slate-400">9:30 AM</span>
              </div>

              {/* Message Header based on Day */}
              {userProfile?.status === 'paid_subscriber' ? (
                <div className="text-amber-400 font-bold font-mono text-xs">
                  🌟 [প্রিমিয়াম ডেইলি রিসার্চ ডাইজেস্ট]
                </div>
              ) : userProfile?.trial_day_count === 6 ? (
                <div className="text-amber-400 font-bold font-mono text-xs">
                  ⚠️ [জরুরি নোটিশ: ট্রায়াল শেষ হওয়ার পূর্বপ্রস্তুতি • দিন ৬/৭]
                </div>
              ) : userProfile?.trial_day_count && userProfile.trial_day_count >= 7 ? (
                <div className="text-rose-400 font-bold font-mono text-xs">
                  🔒 [৭ দিনের ট্রায়াল সমাপ্তি • ফাইনাল ফ্রি ডাইজেস্ট]
                </div>
              ) : (
                <div className="text-cyan-400 font-bold font-mono text-xs">
                  🔬 [সকালের এআই গবেষণা ডাইজেস্ট • দিন {userProfile?.trial_day_count || 1}/৭]
                </div>
              )}

              <p className="text-[11px] text-slate-400 font-mono">
                🕒 <i>৯:৩০ AM IST ক্লাউড ডেলিভারি</i>
              </p>

              {digest?.paper && (
                <div className="space-y-2 text-xs leading-relaxed text-slate-100">
                  <p>
                    📄 <b>শিরোনাম:</b> {digest.paper.title}
                  </p>
                  <p className="text-slate-300">
                    👥 <b>গবেষক:</b> {digest.paper.authors.slice(0, 3).join(', ')}
                  </p>
                  <p className="text-slate-400 font-mono text-[11px]">
                    🏷️ <b>ক্যাটাগরি:</b> <code>{digest.paper.primaryCategory}</code>
                  </p>
                  <div className="border-t border-[#242f3d] my-1" />
                  <p>{digest.discoveryBullet}</p>
                  <p>{digest.methodologyBullet}</p>
                  <p>{digest.applicationBullet}</p>
                  <div className="border-t border-[#242f3d] my-1" />

                  {/* Psychological Notice */}
                  {userProfile?.trial_day_count === 6 && userProfile.status !== 'paid_subscriber' && (
                    <div className="p-2 rounded bg-amber-950/60 border border-amber-800/80 text-amber-200 text-[11px] leading-tight">
                      🚨 <b>মনোযোগ দিন:</b> আপনার ফ্রি ট্রায়ালের আর মাত্র <b>২৪ ঘণ্টা</b> বাকি। আপনার কাস্টম এআই ভেক্টর প্রোফাইল কাল ফ্রিজ হয়ে যাবে।
                    </div>
                  )}

                  {userProfile?.trial_day_count && userProfile.trial_day_count >= 7 && userProfile.status !== 'paid_subscriber' && (
                    <div className="p-2 rounded bg-rose-950/60 border border-rose-800/80 text-rose-200 text-[11px] leading-tight">
                      ⛔ <b>৭ দিনের ট্রায়াল সমাপ্ত:</b> প্রতিদিন সকালের এই রিসার্চ সামারি এবং আপনার সেভ করা ভেক্টর প্রোফাইল চালু রাখতে সাবস্ক্রিপশন নিশ্চিত করুন।
                    </div>
                  )}

                  <p className="pt-1 text-[11px] text-sky-400 font-mono">
                    🔗 <u>[অফিসিয়াল PDF ডাউনলোড করুন]</u> • <u>[arXiv অ্যাবস্ট্রাক্ট]</u>
                  </p>
                </div>
              )}

              {/* Simulated Inline Keyboard Buttons */}
              <div className="space-y-1.5 pt-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="py-1.5 text-center rounded bg-[#242f3d] hover:bg-[#2e3b4d] text-sky-300 font-mono text-[11px] font-semibold">
                    🔥 দরকারী
                  </div>
                  <div className="py-1.5 text-center rounded bg-[#242f3d] hover:bg-[#2e3b4d] text-slate-300 font-mono text-[11px]">
                    💤 ভালো লাগেনি
                  </div>
                </div>

                <div className="py-1.5 text-center rounded bg-[#242f3d] text-sky-300 font-mono text-[11px] font-semibold">
                  📄 অফিসিয়াল PDF পড়ুন
                </div>

                {(userProfile?.trial_day_count && userProfile.trial_day_count >= 6 && userProfile.status !== 'paid_subscriber') && (
                  <div className="py-1.5 text-center rounded bg-gradient-to-r from-emerald-600 to-indigo-600 text-white font-mono text-[11px] font-bold shadow-md">
                    💳 সাবস্ক্রিপশন নিশ্চিত করুন
                  </div>
                )}
              </div>
            </div>

            {/* Direct Trigger Action */}
            <button
              onClick={handleSendToTelegram}
              disabled={isSendingTelegram || isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-sky-950/40 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${isSendingTelegram ? 'animate-spin' : ''}`} />
              <span>{isSendingTelegram ? 'টেলিগ্রামে পাঠানো হচ্ছে...' : 'এখনই টেলিগ্রামে এই বার্তাটি পাঠান'}</span>
            </button>
          </div>

          {/* Security & Credentials Card (Masked & Safe) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  সিকিউর ক্লাউড ক্রেডেনশিয়ালস
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                PROVABLY SECURE
              </span>
            </div>

            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              আপনার অনুরোধ অনুযায়ী টেলিগ্রাম টোকেন এবং চ্যাট আইডি ব্যাকএন্ডে সুরক্ষিত রয়েছে। কোনো পাবলিক লগ বা ফ্রন্টএন্ডে র-টোকেন প্রদর্শিত হয় না।
            </p>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Telegram Bot:</span>
                <span className="text-sky-400 font-bold">@{telegramStatus?.botUsername || 'SubhadipMorningBot'}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Target Chat ID:</span>
                <span className="text-slate-200 font-bold">{telegramStatus?.chatIdMasked || '8204••••27'}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Bot Token (Masked):</span>
                <span className="text-slate-400">{telegramStatus?.tokenMasked || '8730••••••••••••Pk4VR8'}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">৯:৩০ AM অটোমেটিক ডিসপ্যাচ:</span>
                <button
                  onClick={handleToggleTelegramAuto}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    telegramStatus?.enabled
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {telegramStatus?.enabled ? 'ACTIVE (সক্রিয়)' : 'PAUSED (বন্ধ)'}
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Registered Telegram Users Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  নিবন্ধিত টেলিগ্রাম ইউজার ({registeredUsers.length} জন)
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                DYNAMIC RECIPIENTS
              </span>
            </div>

            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              যে কোনো ইউজার বটে <code>/start</code> পাঠালে তার চ্যাট আইডি স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়। সকাল ০৯:৩০-এ উৎপাদিত সংবাদপত্রটি সকল সক্রিয় ইউজারের কাছে স্বাধীনভাবে পৌঁছে যায়।
            </p>

            {registeredUsers.length === 0 ? (
              <div className="p-3 text-center rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs font-mono">
                কোনো ইউজার এখনও নিবন্ধিত হয়নি। টেলিগ্রাম বটে /start পাঠিয়ে নিবন্ধন করুন।
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {registeredUsers.map((u, idx) => (
                  <div
                    key={u.chat_id || idx}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-slate-200">
                        <span className="text-cyan-400">{u.username || 'Telegram User'}</span>
                        <span className="text-[10px] text-slate-500 font-normal">({u.user_id_masked || u.chat_id_masked || u.chat_id})</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>দিন {u.trial_day_count}/৭</span>
                        <span>•</span>
                        <span>ভাষা: {u.preferred_language === 'bn' ? 'বাংলা' : 'English'}</span>
                        {u.last_delivery_status && (
                          <>
                            <span>•</span>
                            <span className={u.last_delivery_status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}>
                              {u.last_delivery_status}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      u.status === 'paid_subscriber'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                    }`}>
                      {u.status === 'paid_subscriber' ? 'PAID' : 'TRIAL'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Telegram Dispatch Audit Trail */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-cyan-400" /> টেলিগ্রাম ডেলিভারি অডিট ট্রেইল
              </h3>
              <span className="text-[10px] font-mono text-slate-500">Last 50 Dispatches</span>
            </div>

            {(!telegramStatus?.history || telegramStatus.history.length === 0) ? (
              <div className="p-4 text-center rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs font-mono">
                এখনও কোনো টেলিগ্রাম বার্তা পাঠানো হয়নি। উপরের বাটনে ক্লিক করে প্রথম ডাইজেস্টটি পরীক্ষা করুন।
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto text-xs font-mono">
                {telegramStatus.history.map((record) => (
                  <div
                    key={record.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            record.success ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-white font-bold">{record.stageLabel}</span>
                        {record.telegramMessageId && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">
                            Text #{record.telegramMessageId}
                          </span>
                        )}
                        {record.pdfDocumentDelivered && record.pdfDocumentMessageId && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5" /> PDF Doc #{record.pdfDocumentMessageId}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                        {record.paperTitle}
                      </p>
                    </div>

                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(record.dispatchedAt).toISOString().slice(11, 16)} UTC
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
