import React, { useState, useRef } from 'react';
import {
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  CheckCircle,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Activity,
  AlertOctagon,
  Sparkles,
  Square,
  Copy,
  Check,
} from 'lucide-react';
import { TechIntelligenceEvent, EvidenceStatus } from '../types/intelligence';
import { SourceDiagnosticsBadges } from './SourceDiagnosticsBadges';
import { TraceabilityGraph } from './TraceabilityGraph';

interface Props {
  event: TechIntelligenceEvent;
  onReverify: (event: TechIntelligenceEvent) => Promise<void>;
}

export const EventCard: React.FC<Props> = ({ event, onReverify }) => {
  const [isReverifying, setIsReverifying] = useState(false);
  const [showTraceability, setShowTraceability] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  // Real-time AI Streaming State for Event
  const [showAiStream, setShowAiStream] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleReverifyClick = async () => {
    setIsReverifying(true);
    try {
      await onReverify(event);
    } finally {
      setIsReverifying(false);
    }
  };

  const startEventStream = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abort = new AbortController();
    abortControllerRef.current = abort;

    setIsStreaming(true);
    setStreamError(null);
    setStreamedText('');

    try {
      const response = await fetch('/api/research/stream-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: event.title,
          context: `Category: ${event.category}. Status: ${event.evidenceStatus}. Primary claim: ${event.primaryClaim}. Summary: ${event.summary}. Rationale: ${event.whyThisStatus}.`,
          prompt: 'Provide an analytical, forensic breakdown of this tech event, the verified facts, and its strategic implications in structured paragraphs.',
          language: 'bn',
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to connect stream`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body unavailable');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';
      let rafId: number | null = null;

      const scheduleFlush = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            setStreamedText(accumulated);
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
              throw new Error(data.message);
            }
          } catch (e: any) {
            // ignore JSON boundary splits
          }
        }
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      setStreamedText(accumulated);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStreamError(err.message || 'Stream generation failed');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleToggleAiStream = () => {
    if (!showAiStream) {
      setShowAiStream(true);
      if (!streamedText && !isStreaming) {
        startEventStream();
      }
    } else {
      setShowAiStream(false);
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleCopy = async () => {
    if (!streamedText) return;
    try {
      await navigator.clipboard.writeText(streamedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.warn(e);
    }
  };

  // Status visual configurations
  const statusConfig: Record<
    EvidenceStatus,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    VERIFIED: {
      label: 'VERIFIED',
      bg: 'bg-emerald-950/40',
      text: 'text-emerald-400',
      border: 'border-emerald-800/80',
      icon: <CheckCircle className="w-3.5 h-3.5" />,
    },
    PARTIALLY_VERIFIED: {
      label: 'PARTIALLY VERIFIED',
      bg: 'bg-amber-950/40',
      text: 'text-amber-400',
      border: 'border-amber-800/80',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    UNVERIFIED: {
      label: 'UNVERIFIED',
      bg: 'bg-slate-900/60',
      text: 'text-slate-400',
      border: 'border-slate-800',
      icon: <HelpCircle className="w-3.5 h-3.5" />,
    },
    CONFLICTING_REPORTS: {
      label: 'CONFLICTING REPORTS',
      bg: 'bg-orange-950/40',
      text: 'text-orange-400',
      border: 'border-orange-800/80',
      icon: <AlertOctagon className="w-3.5 h-3.5" />,
    },
    FALSE_DEBUNKED: {
      label: 'FALSE / DEBUNKED',
      bg: 'bg-rose-950/40',
      text: 'text-rose-400',
      border: 'border-rose-800/80',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  };

  const currentStatus = statusConfig[event.evidenceStatus] || statusConfig.UNVERIFIED;

  // Primary source determination
  const primaryEvidence =
    event.evidenceList.find((e) => e.isPrimarySource) ||
    event.evidenceList.find((e) => e.urlValidationStatus === 'VALIDATED') ||
    event.evidenceList[0];

  const visibleSources = showAllSources ? event.evidenceList : event.evidenceList.slice(0, 3);

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 transition-all p-5 shadow-sm space-y-4">
      {/* Header Row: Category, Timestamps & Re-verify button */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-semibold">{event.category}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            Pub: {new Date(event.publicationTime).toLocaleDateString()} {new Date(event.publicationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {event.eventTimeKnown && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                Event: {new Date(event.eventTimeKnown).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-[11px] hidden sm:inline">
            Verified: {new Date(event.lastVerificationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          <button
            onClick={handleToggleAiStream}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer border ${
              showAiStream
                ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Generate real-time streaming forensic AI breakdown for this story"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>{showAiStream ? 'Hide AI' : 'AI Deep-Dive'}</span>
          </button>

          <button
            onClick={handleReverifyClick}
            disabled={isReverifying}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
            title="Perform fresh live URL validation & analytical verification for this event"
          >
            <RefreshCw className={`w-3 h-3 ${isReverifying ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            <span>{isReverifying ? 'Re-verifying...' : 'Re-verify'}</span>
          </button>
        </div>
      </div>

      {/* Streaming AI Deep-Dive Drawer */}
      {showAiStream && (
        <div className="rounded-xl border border-cyan-500/40 bg-slate-950/90 p-3.5 space-y-2.5 text-xs shadow-inner">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              {isStreaming ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  Streaming live analysis...
                </span>
              ) : (
                'Forensic AI Analysis'
              )}
            </span>

            <div className="flex items-center gap-2">
              {isStreaming && (
                <button
                  onClick={handleStopStream}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-mono cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop
                </button>
              )}
              {streamedText && (
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-mono cursor-pointer hover:text-white"
                >
                  {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                  {isCopied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          {streamedText && (
            <div className="text-slate-200 leading-relaxed font-sans whitespace-pre-wrap select-text text-xs">
              {streamedText}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 bg-cyan-400 animate-pulse ml-0.5 align-middle rounded-xs" />
              )}
            </div>
          )}

          {isStreaming && !streamedText && (
            <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] py-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              Connecting to streaming engine...
            </div>
          )}

          {streamError && (
            <div className="p-2 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono flex items-center justify-between">
              <span>{streamError}</span>
              <button
                onClick={startEventStream}
                className="underline text-xs cursor-pointer ml-2"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Title & Status Badge */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
            {event.title}
          </h2>

          <div className="flex items-center gap-2 self-start flex-shrink-0">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wide border ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border}`}
            >
              {currentStatus.icon}
              <span>{currentStatus.label}</span>
            </div>

            <div
              className="text-xs font-mono px-2 py-1 rounded bg-slate-800/80 text-slate-300 border border-slate-700"
              title="Calculated confidence score based on corroborating primary sources"
            >
              {event.confidenceLevel}% Conf.
            </div>
          </div>
        </div>

        {/* Primary Claim */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-sm">
          <span className="text-cyan-400 font-mono text-xs font-semibold uppercase block mb-1">
            Original Claim Identified:
          </span>
          <p className="text-slate-200 leading-relaxed font-normal">
            {event.primaryClaim}
          </p>
        </div>
      </div>

      {/* Why This Status Received */}
      <div className="text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 space-y-1">
        <span className="text-slate-400 font-mono font-semibold uppercase tracking-wider block">
          Verification Findings &amp; Corroboration Rationale:
        </span>
        <p className="text-slate-300 leading-relaxed font-sans">
          {event.whyThisStatus}
        </p>

        {/* Detected Issues */}
        {(() => {
          const issues: string[] = Array.isArray(event.detectedIssues)
            ? event.detectedIssues.map((i) => (typeof i === 'string' ? i : JSON.stringify(i)))
            : typeof event.detectedIssues === 'string'
            ? [event.detectedIssues]
            : typeof event.detectedIssues === 'object' && event.detectedIssues !== null
            ? Object.values(event.detectedIssues).map((i: any) =>
                typeof i === 'string' ? i : JSON.stringify(i)
              )
            : [];

          if (issues.length === 0) return null;

          return (
            <div className="pt-2 mt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-2">
              <span className="text-amber-400 font-mono text-[11px] font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Issues Flagged:
              </span>
              {issues.map((issue, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/60"
                >
                  {issue}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Source Diagnostics Checklist */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            Source Diagnostics Matrix
          </span>
          <span className="text-slate-500 text-[11px]">
            {event.validSourcesCount} verified / {event.brokenSourcesCount} unavailable
          </span>
        </div>
        <SourceDiagnosticsBadges diagnostics={event.overallDiagnostics} compact />
      </div>

      {/* Evidence & Exact Source URLs List */}
      <div className="space-y-2 pt-2 border-t border-slate-800/60">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-semibold">
            Sources &amp; Grounding Evidence ({event.evidenceList.length})
          </span>
          <span className="text-slate-400 text-[11px]">
            {event.independentSourcesCount} independent corroborating outlet(s)
          </span>
        </div>

        <div className="space-y-2">
          {visibleSources.map((evidence) => {
            const isUnavailable = evidence.urlValidationStatus === 'UNAVAILABLE';
            const isRedirected = evidence.urlValidationStatus === 'REDIRECTED';

            return (
              <div
                key={evidence.id}
                className={`p-3 rounded-lg border text-xs transition-colors ${
                  isUnavailable
                    ? 'bg-rose-950/15 border-rose-900/50 text-slate-400'
                    : 'bg-slate-950/50 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs font-mono">
                      {evidence.publisher}
                    </span>
                    {evidence.isPrimarySource && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-mono">
                        Primary Source
                      </span>
                    )}
                    {evidence.isCorroborating && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-mono">
                        Corroborating
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(evidence.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="font-sans text-slate-300 text-xs mb-2">
                  {evidence.title}
                </p>

                {/* EXACT Canonical Source URL & Read Source Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/50">
                  <div className="font-mono text-[11px] text-slate-400 truncate max-w-lg">
                    <span>URL: </span>
                    <span className="text-cyan-300 select-all underline decoration-cyan-800/50">
                      {evidence.exactUrl}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isUnavailable ? (
                      <span className="text-rose-400 text-[11px] font-mono font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        Source unavailable — not used as verified evidence
                      </span>
                    ) : (
                      <>
                        <span className="text-emerald-400 text-[11px] font-mono flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          {isRedirected ? 'Redirect Verified' : 'Validated 200 OK'}
                        </span>
                        <a
                          href={evidence.exactUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-colors shadow-sm cursor-pointer"
                        >
                          <span>Read Source</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {event.evidenceList.length > 3 && (
          <button
            onClick={() => setShowAllSources(!showAllSources)}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors pt-1 cursor-pointer"
          >
            {showAllSources
              ? 'Collapse additional sources'
              : `Show all ${event.evidenceList.length} source records...`}
          </button>
        )}
      </div>

      {/* Expandable Forensic Traceability Chain */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          onClick={() => setShowTraceability(!showTraceability)}
          className="w-full flex items-center justify-between p-2 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold">
              Forensic Traceability Chain (Event → Claim → Evidence → Result)
            </span>
          </div>
          {showTraceability ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showTraceability && (
          <div className="mt-3">
            <TraceabilityGraph event={event} />
          </div>
        )}
      </div>
    </article>
  );
};
