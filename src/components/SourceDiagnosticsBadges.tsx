import React from 'react';
import { SourceDiagnostics } from '../types/intelligence';

interface Props {
  diagnostics: SourceDiagnostics | {
    urlCaptured: boolean;
    urlValidated: boolean;
    primarySourceFound: boolean;
    independentSourceFound: boolean;
    evidenceVerified: boolean;
    redirectDetected: boolean;
    sourceUnavailable: boolean;
    conflictingEvidence: boolean;
  };
  compact?: boolean;
}

export const SourceDiagnosticsBadges: React.FC<Props> = ({ diagnostics, compact = false }) => {
  const items = [
    {
      key: 'urlCaptured',
      label: 'URL captured',
      active: diagnostics.urlCaptured,
      type: 'success',
      icon: '✓',
    },
    {
      key: 'urlValidated',
      label: 'URL validated',
      active: diagnostics.urlValidated,
      type: 'success',
      icon: '✓',
    },
    {
      key: 'primarySourceFound',
      label: 'Primary source found',
      active: diagnostics.primarySourceFound,
      type: 'success',
      icon: '✓',
    },
    {
      key: 'independentSourceFound',
      label: 'Independent source found',
      active: diagnostics.independentSourceFound,
      type: 'success',
      icon: '✓',
    },
    {
      key: 'evidenceVerified',
      label: 'Evidence verified',
      active: diagnostics.evidenceVerified,
      type: 'success',
      icon: '✓',
    },
    {
      key: 'redirectDetected',
      label: 'Redirect detected',
      active: diagnostics.redirectDetected,
      type: 'info',
      icon: '✓',
    },
    {
      key: 'sourceUnavailable',
      label: 'Source unavailable',
      active: diagnostics.sourceUnavailable,
      type: 'danger',
      icon: '✗',
    },
    {
      key: 'conflictingEvidence',
      label: 'Conflicting evidence',
      active: diagnostics.conflictingEvidence,
      type: 'warning',
      icon: '⚠',
    },
  ];

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        {items.map((item) => (
          <span
            key={item.key}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${
              item.active
                ? item.type === 'danger'
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-800'
                  : item.type === 'warning'
                  ? 'bg-amber-950/70 text-amber-300 border border-amber-800'
                  : item.type === 'info'
                  ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-800'
                  : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                : 'text-slate-600 bg-slate-900/40 border border-slate-800/60 line-through opacity-45'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
      {items.map((item) => {
        const isTriggered = item.active;
        let colorClasses = 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-60';
        if (isTriggered) {
          if (item.type === 'danger') {
            colorClasses = 'border-rose-700/80 bg-rose-950/40 text-rose-300 font-medium shadow-sm';
          } else if (item.type === 'warning') {
            colorClasses = 'border-amber-700/80 bg-amber-950/40 text-amber-300 font-medium shadow-sm';
          } else if (item.type === 'info') {
            colorClasses = 'border-cyan-700/80 bg-cyan-950/40 text-cyan-300 font-medium shadow-sm';
          } else {
            colorClasses = 'border-emerald-700/80 bg-emerald-950/40 text-emerald-300 font-medium shadow-sm';
          }
        }

        return (
          <div
            key={item.key}
            className={`flex items-center gap-2 p-2 rounded border transition-colors ${colorClasses}`}
          >
            <span
              className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isTriggered
                  ? item.type === 'danger'
                    ? 'bg-rose-500/20 text-rose-300'
                    : item.type === 'warning'
                    ? 'bg-amber-500/20 text-amber-300'
                    : item.type === 'info'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-slate-800 text-slate-600'
              }`}
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};
