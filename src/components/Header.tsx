import React from 'react';
import { Activity, ShieldCheck, AlertTriangle, RefreshCw, Globe, CheckCircle2, XCircle, FileDown, Clock, Mail, Cpu } from 'lucide-react';
import { IntelligenceFeedResponse } from '../types/intelligence';

interface HeaderProps {
  stats: IntelligenceFeedResponse['stats'] | null;
  sourcesHealth: IntelligenceFeedResponse['sourcesHealth'] | null;
  isLoading: boolean;
  isGeneratingPdf?: boolean;
  onRefresh: () => void;
  onOpenInspector: () => void;
  onGeneratePdf: () => void;
  onOpenScheduler: () => void;
  eventsCount?: number;
  activeView?: 'INTELLIGENCE' | 'RESEARCH_TELEGRAM';
  onViewChange?: (view: 'INTELLIGENCE' | 'RESEARCH_TELEGRAM') => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  sourcesHealth,
  isLoading,
  isGeneratingPdf = false,
  onRefresh,
  onOpenInspector,
  onGeneratePdf,
  onOpenScheduler,
  eventsCount = 0,
  activeView = 'RESEARCH_TELEGRAM',
  onViewChange,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Brand & Mission */}
          <div>
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-xl font-bold tracking-tight text-white font-mono uppercase">
                24-Hour Tech World Intelligence
              </h1>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono border border-slate-700">
                v2.4 Hardened
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>Real-Time Source Corroboration</span>
              <span>·</span>
              <span>Strict Canonical URL Preservation</span>
              <span>·</span>
              <span>404 &amp; Broken Link Elimination</span>
            </p>
          </div>

          {/* Actions & Health Telemetry */}
          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
            {/* Daily Dispatch Scheduler Button */}
            <button
              onClick={onOpenScheduler}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-700/80 text-xs font-mono font-medium text-indigo-200 transition-colors cursor-pointer"
              title="Daily 9:30 AM IST Automated Cloud Dispatch & Email Settings"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>9:30 AM IST Dispatch</span>
            </button>

            {/* Prominent Generate PDF Report Button */}
            <button
              onClick={onGeneratePdf}
              disabled={isGeneratingPdf || eventsCount === 0}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold text-xs transition-all shadow-md shadow-red-950/30 border border-red-500/30 disabled:opacity-50 cursor-pointer active:scale-95"
              title="Download verified 24-hour intelligence results as a professional A4 PDF with clickable exact URLs"
            >
              <FileDown className={`w-4 h-4 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
              <span>{isGeneratingPdf ? 'Compiling PDF...' : 'Generate PDF Report'}</span>
              <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] font-mono border border-white/20">
                A4
              </span>
            </button>

            <button
              onClick={onOpenInspector}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              title="Test and diagnose any external news or publisher URL"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>URL Diagnostics Probe</span>
            </button>

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Scanning Wire...' : 'Refresh Intelligence'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs between 4D Research Engine and 24h Intelligence Wire */}
        {onViewChange && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-900/80">
            <button
              onClick={() => onViewChange('RESEARCH_TELEGRAM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all ${
                activeView === 'RESEARCH_TELEGRAM'
                  ? 'bg-gradient-to-r from-sky-500 via-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-950/50'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-sky-300" />
              <span>4D Research &amp; 7-Day Telegram Engine (৯:৩০ AM IST)</span>
              <span className="px-1.5 py-0.2 rounded bg-black/30 text-[10px] text-sky-200">
                ACTIVE
              </span>
            </button>

            <button
              onClick={() => onViewChange('INTELLIGENCE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all ${
                activeView === 'INTELLIGENCE'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-cyan-950/50'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>24h Tech Intelligence Feed</span>
            </button>
          </div>
        )}

        {/* Live Aggregated Verification Counters */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3 pt-3 border-t border-slate-900 text-xs font-mono">
            <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Total Events</span>
              <span className="text-base font-bold text-white">{stats.totalEvents}</span>
            </div>
            <div className="bg-emerald-950/30 p-2 rounded border border-emerald-900/40">
              <span className="text-emerald-400 block text-[11px] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Verified Events
              </span>
              <span className="text-base font-bold text-emerald-300">{stats.verifiedCount}</span>
            </div>
            <div className="bg-amber-950/30 p-2 rounded border border-amber-900/40">
              <span className="text-amber-400 block text-[11px] flex items-center gap-1">
                <Activity className="w-3 h-3" /> Under Verification
              </span>
              <span className="text-base font-bold text-amber-300">{stats.partiallyVerifiedCount + stats.unverifiedCount}</span>
            </div>
            <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
              <span className="text-cyan-400 block text-[11px]">URLs Validated (200 OK)</span>
              <span className="text-base font-bold text-cyan-300">{stats.sourcesValidated}</span>
            </div>
            <div className="bg-rose-950/20 p-2 rounded border border-rose-900/30">
              <span className="text-rose-400 block text-[11px] flex items-center gap-1">
                <XCircle className="w-3 h-3" /> 404 / Unavailable Blocked
              </span>
              <span className="text-base font-bold text-rose-300">{stats.sourcesUnavailable}</span>
            </div>
            <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Canonical Redirects Kept</span>
              <span className="text-base font-bold text-indigo-300">{stats.redirectsPreserved}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
