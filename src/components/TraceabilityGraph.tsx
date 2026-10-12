import React, { useState } from 'react';
import { ExternalLink, ShieldCheck, AlertCircle, ArrowRight, CornerDownRight, Check, X, Clock } from 'lucide-react';
import { TechIntelligenceEvent } from '../types/intelligence';

interface Props {
  event: TechIntelligenceEvent;
}

export const TraceabilityGraph: React.FC<Props> = ({ event }) => {
  const [selectedClaimId, setSelectedClaimId] = useState<string>(event.claims[0]?.id || '');

  const activeClaim = event.claims.find((c) => c.id === selectedClaimId) || event.claims[0];

  return (
    <div className="bg-slate-950/70 rounded-lg border border-slate-800 p-4 font-mono text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-bold uppercase tracking-wider text-[11px]">
            Forensic Traceability Chain
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-[11px]">
            Event → Claim → Evidence Item → Publisher → Exact URL → Timestamp → Result
          </span>
        </div>
      </div>

      {/* Claim Selector Pills/Tabs if multiple claims */}
      {event.claims.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {event.claims.map((claim, idx) => (
            <button
              key={claim.id}
              onClick={() => setSelectedClaimId(claim.id)}
              className={`px-2.5 py-1 rounded text-left transition-colors cursor-pointer text-[11px] ${
                claim.id === activeClaim?.id
                  ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              Claim #{idx + 1}: {claim.statement.slice(0, 45)}...
            </button>
          ))}
        </div>
      )}

      {/* Visual Pipeline Node Breakdown */}
      {activeClaim && (
        <div className="mt-4 space-y-4">
          {/* Level 1: Claim */}
          <div className="bg-slate-900/60 p-3 rounded border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              Claim Statement
            </div>
            <p className="font-sans text-slate-200 text-sm font-medium">
              "{activeClaim.statement}"
            </p>
            {activeClaim.analysisNotes && (
              <p className="text-slate-400 text-xs mt-1.5 font-sans">
                Forensic note: {activeClaim.analysisNotes}
              </p>
            )}
          </div>

          {/* Level 2: Evidence Items bound to this claim */}
          <div className="space-y-2.5 pl-2 border-l-2 border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <CornerDownRight className="w-3.5 h-3.5 text-cyan-400" />
              <span>Corroborating Evidence Records ({activeClaim.evidenceItems.length})</span>
            </div>

            {activeClaim.evidenceItems.map((evidence, evIdx) => {
              const isUnavailable = evidence.urlValidationStatus === 'UNAVAILABLE';
              const isRedirected = evidence.urlValidationStatus === 'REDIRECTED';

              return (
                <div
                  key={evidence.id || evIdx}
                  className={`p-3 rounded border transition-all ${
                    isUnavailable
                      ? 'bg-rose-950/20 border-rose-900/40 text-slate-300'
                      : 'bg-slate-900/80 border-slate-800/80 text-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">
                        {evidence.publisher}
                      </span>
                      {evidence.isPrimarySource && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          Primary Source
                        </span>
                      )}
                      {evidence.isCorroborating && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Independent Corroboration
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(evidence.publishedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Headline & Exact URL */}
                  <div className="text-slate-300 font-sans text-xs mb-2">
                    {evidence.title}
                  </div>

                  {/* Exact URL & Validation Status */}
                  <div className="bg-slate-950 p-2 rounded border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div className="truncate flex-1">
                      <span className="text-slate-400">Canonical Source URL: </span>
                      <code className="text-cyan-300 font-mono select-all">
                        {evidence.exactUrl}
                      </code>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                      {isUnavailable ? (
                        <span className="text-rose-400 font-medium flex items-center gap-1">
                          <X className="w-3 h-3 text-rose-400" />
                          Source unavailable — not used as verified evidence
                        </span>
                      ) : (
                        <>
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-400" />
                            {isRedirected ? 'Redirect Verified' : 'Validated 200 OK'}
                          </span>
                          <a
                            href={evidence.exactUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[10px] transition-colors"
                          >
                            <span>Read Source</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Diagnostics note if any */}
                  {evidence.notes && (
                    <div className="mt-2 text-[11px] text-slate-400 italic">
                      Verification Result: {evidence.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
