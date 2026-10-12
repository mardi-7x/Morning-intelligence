import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  HelpCircle,
  AlertOctagon,
  XCircle,
  Database,
  Cpu,
  FileDown,
} from 'lucide-react';
import { IntelligenceFeedResponse, TechIntelligenceEvent, EvidenceStatus } from './types/intelligence';
import { Header } from './components/Header';
import { EventCard } from './components/EventCard';
import { UrlInspectorModal } from './components/UrlInspectorModal';
import { SchedulerModal } from './components/SchedulerModal';
import { ResearchPaperEngineView } from './components/ResearchPaperEngineView';
import { generateIntelligencePdfReport } from './utils/generatePdfReport';

type FilterTab = 'ALL' | 'VERIFIED' | 'UNDER_VERIFICATION' | 'CONFLICTING' | 'DEBUNKED';

export default function App() {
  const [activeView, setActiveView] = useState<'RESEARCH_TELEGRAM' | 'INTELLIGENCE'>('RESEARCH_TELEGRAM');
  const [feed, setFeed] = useState<IntelligenceFeedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);

  // Fetch intelligence feed from Express backend
  const fetchFeed = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = forceRefresh ? '/api/intelligence/feed?refresh=true' : '/api/intelligence/feed';
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Failed to fetch intelligence feed: HTTP ${res.status}`);
      }
      const data: IntelligenceFeedResponse = await res.json();
      setFeed(data);
    } catch (err: any) {
      console.error('[Feed Fetch Error]:', err);
      setError(err.message || 'Failed to connect to Intelligence Verification Backend');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  // Handle on-demand re-verification of a specific event
  const handleReverifyEvent = async (event: TechIntelligenceEvent) => {
    try {
      const res = await fetch('/api/intelligence/reverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });

      if (!res.ok) {
        throw new Error(`Re-verification request failed: ${res.status}`);
      }

      const data = await res.json();
      const updatedEvent: TechIntelligenceEvent = data.event;

      // Update feed state in place
      setFeed((prev) => {
        if (!prev) return null;
        const newEvents = prev.events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
        return {
          ...prev,
          events: newEvents,
        };
      });
    } catch (err: any) {
      alert(`Re-verification error: ${err.message}`);
    }
  };

  // Convert currently verified 24-hour intelligence results into an A4 PDF and download automatically
  const handleGeneratePdf = () => {
    if (!feed || feed.events.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      // Use the exact same verified data currently shown in dashboard without regenerating or modifying
      const targetEvents = filteredEvents.length > 0 ? filteredEvents : feed.events;
      let scopeLabel = 'All 24-Hour Verified Intelligence Dispatches';
      if (activeTab === 'VERIFIED') scopeLabel = 'Verified Technological Events (High-Confidence Corroborated)';
      else if (activeTab === 'UNDER_VERIFICATION') scopeLabel = 'Claims Under Active Verification';
      else if (activeTab === 'CONFLICTING') scopeLabel = 'Conflicting Industry Reports';
      else if (activeTab === 'DEBUNKED') scopeLabel = 'Debunked Claims & Refutations';
      
      if (selectedCategory !== 'ALL') {
        scopeLabel += ` • Sector: ${selectedCategory}`;
      }

      generateIntelligencePdfReport({
        events: targetEvents,
        stats: feed.stats,
        reportTitle: '24-Hour Tech World Intelligence Dossier',
        scopeLabel,
      });
    } catch (err: any) {
      console.error('Failed to generate PDF report:', err);
      setError(`PDF Generation note: ${err?.message || 'Error compiling PDF'}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Filter events based on active tab, category, and search query
  const filteredEvents = useMemo(() => {
    if (!feed?.events) return [];

    return feed.events.filter((event) => {
      // Tab filter
      if (activeTab === 'VERIFIED') {
        // STRICT RULE: Do not allow an event into the Verified Events section unless it has sufficient supporting evidence
        if (event.evidenceStatus !== 'VERIFIED') return false;
      } else if (activeTab === 'UNDER_VERIFICATION') {
        // Put uncertain stories into Claims Under Verification
        if (event.evidenceStatus !== 'PARTIALLY_VERIFIED' && event.evidenceStatus !== 'UNVERIFIED') {
          return false;
        }
      } else if (activeTab === 'CONFLICTING') {
        if (event.evidenceStatus !== 'CONFLICTING_REPORTS') return false;
      } else if (activeTab === 'DEBUNKED') {
        if (event.evidenceStatus !== 'FALSE_DEBUNKED') return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && event.category !== selectedCategory) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(q);
        const matchesClaim = event.primaryClaim.toLowerCase().includes(q);
        const matchesPublisher = event.evidenceList.some((e) =>
          e.publisher.toLowerCase().includes(q)
        );
        const issues: string[] = Array.isArray(event.detectedIssues)
          ? event.detectedIssues.map((i) => (typeof i === 'string' ? i : JSON.stringify(i)))
          : typeof event.detectedIssues === 'string'
          ? [event.detectedIssues]
          : [];
        const matchesIssues = issues.some((issue) =>
          typeof issue === 'string' && issue.toLowerCase().includes(q)
        );
        return matchesTitle || matchesClaim || matchesPublisher || matchesIssues;
      }

      return true;
    });
  }, [feed?.events, activeTab, selectedCategory, searchQuery]);

  const categories = [
    'ALL',
    'AI & Frontier Models',
    'Semiconductors & Compute',
    'Cybersecurity & Privacy',
    'Enterprise Cloud & Infra',
    'Big Tech & Regulation',
    'Open Source & Dev Tools',
  ];

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Header */}
      <Header
        stats={feed?.stats || null}
        sourcesHealth={feed?.sourcesHealth || null}
        isLoading={isLoading}
        isGeneratingPdf={isGeneratingPdf}
        onRefresh={() => fetchFeed(true)}
        onOpenInspector={() => setIsInspectorOpen(true)}
        onGeneratePdf={handleGeneratePdf}
        onOpenScheduler={() => setIsSchedulerOpen(true)}
        eventsCount={filteredEvents.length}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeView === 'RESEARCH_TELEGRAM' ? (
          <ResearchPaperEngineView />
        ) : (
          <>
            {/* Verification Guarantee & Policy Banner */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-400 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white uppercase tracking-wider block">
                Forensic Source Policy Active
              </span>
              <p className="text-slate-400 font-sans text-xs mt-0.5 leading-relaxed">
                Source URLs are immutable canonical article addresses direct from the news corpus. AI models are strictly prohibited from generating URLs.
                Every source is verified live; broken 404/410 links are detected and marked as <em>"Source unavailable — not used as verified evidence"</em>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-shrink-0">
            <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              Engines: Gemini 3.8 + Groq Llama-3.3
            </span>
          </div>
        </section>

        {/* Prominent PDF Report Banner & Action Card */}
        <section className="relative overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-r from-slate-950 via-slate-900 to-red-950/40 p-4 sm:p-5 shadow-xl shadow-red-950/20">
          <div className="absolute right-0 top-0 -mt-8 -mr-8 w-44 h-44 rounded-full bg-red-600/10 blur-2xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-lg shadow-red-900/40 flex-shrink-0">
                <FileDown className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-white font-mono tracking-tight uppercase">
                    Official 24-Hour Intelligence Dossier
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-red-950/80 text-rose-300 border border-red-800/80">
                    A4 PDF Format
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Clickable Source URLs
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed max-w-2xl">
                  Convert the currently verified intelligence results into an official forensic report with full source traceability, timestamps, confidence metrics, and active hyperlinks direct to publisher articles.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 self-stretch sm:self-auto flex-shrink-0">
              <button
                onClick={() => setIsSchedulerOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-indigo-300 hover:text-indigo-200 transition-colors cursor-pointer shadow-sm"
                title="Configure daily 9:30 AM IST automated cloud email delivery"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Daily 9:30 AM IST Email</span>
              </button>

              <button
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf || filteredEvents.length === 0}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-lg bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs font-mono uppercase tracking-wider transition-all shadow-lg shadow-red-900/40 border border-red-400/40 disabled:opacity-50 cursor-pointer active:scale-95 group"
              >
                <FileDown className={`w-4 h-4 transition-transform group-hover:-translate-y-0.5 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
                <span>{isGeneratingPdf ? 'Generating PDF Dossier...' : 'Generate PDF Report'}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px] font-mono border border-white/20">
                  {filteredEvents.length} Events
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Filter Bar & Controls */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Primary Status Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-lg border border-slate-800 overflow-x-auto text-xs font-mono">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'ALL'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                All Stories ({feed?.stats?.totalEvents || 0})
              </button>

              <button
                onClick={() => setActiveTab('VERIFIED')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'VERIFIED'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-emerald-400 hover:text-emerald-300 hover:bg-slate-800/50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified Events ({feed?.stats?.verifiedCount || 0})
              </button>

              <button
                onClick={() => setActiveTab('UNDER_VERIFICATION')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'UNDER_VERIFICATION'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800/50'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Claims Under Verification (
                {(feed?.stats?.partiallyVerifiedCount || 0) + (feed?.stats?.unverifiedCount || 0)})
              </button>

              <button
                onClick={() => setActiveTab('CONFLICTING')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'CONFLICTING'
                    ? 'bg-orange-500 text-slate-950 shadow-sm'
                    : 'text-orange-400 hover:text-orange-300 hover:bg-slate-800/50'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                Conflicting Reports ({feed?.stats?.conflictingCount || 0})
              </button>

              <button
                onClick={() => setActiveTab('DEBUNKED')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'DEBUNKED'
                    ? 'bg-rose-500 text-slate-950 shadow-sm'
                    : 'text-rose-400 hover:text-rose-300 hover:bg-slate-800/50'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                Debunked ({feed?.stats?.debunkedCount || 0})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search claims, publishers, keywords..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Category Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
              <Filter className="w-3 h-3" /> Sector:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap text-xs ${
                  selectedCategory === cat
                    ? 'bg-slate-800 text-white font-medium border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Loading Spinner State */}
        {isLoading && !feed && (
          <div className="py-24 text-center space-y-4">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="font-mono text-sm text-slate-300">
              Corroborating 24-Hour Tech World Intelligence...
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Querying NewsAPI + Newsdata.io wires, performing live URL connectivity validation, eliminating broken links, and executing analytical cross-verification.
            </p>
          </div>
        )}

        {/* Error Alert State */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <span className="font-bold text-sm block">Intelligence Pipeline Connection Error</span>
                <span className="text-xs">{error}</span>
              </div>
            </div>
            <button
              onClick={() => fetchFeed(true)}
              className="px-3 py-1.5 rounded bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer"
            >
              Retry Pipeline
            </button>
          </div>
        )}

        {/* Event List */}
        {!isLoading && filteredEvents.length === 0 && (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-xl p-8 space-y-3">
            <HelpCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300 font-mono">
              No matching intelligence dispatches found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {activeTab === 'VERIFIED'
                ? 'No events currently meet the rigorous multi-source verification threshold for this category. Check "Claims Under Verification" for in-progress corroboration.'
                : 'Try adjusting your search query or switching sectors.'}
            </p>
          </div>
        )}

        {/* Verified Dispatches Stream */}
        <div className="space-y-5">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} onReverify={handleReverifyEvent} />
          ))}
        </div>
          </>
        )}
      </main>

      {/* URL Inspector Modal */}
      <UrlInspectorModal isOpen={isInspectorOpen} onClose={() => setIsInspectorOpen(false)} />

      {/* Automated Daily Scheduler Modal */}
      <SchedulerModal isOpen={isSchedulerOpen} onClose={() => setIsSchedulerOpen(false)} />

      {/* Quiet Technical Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>24-Hour Tech World Intelligence · Hardened Live Wire Desk</span>
          <span className="text-[11px] text-slate-600">
            Strict Canonical URL Preservation · No LLM Hallucinated Citations
          </span>
        </div>
      </footer>
    </div>
  );
}
