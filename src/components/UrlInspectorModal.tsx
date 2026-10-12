import React, { useState } from 'react';
import { X, Search, CheckCircle2, XCircle, ArrowRight, ShieldAlert, Globe, Clock, ShieldCheck } from 'lucide-react';
import { ValidatedUrlResult } from '../server/urlValidator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const UrlInspectorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [testUrl, setTestUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<ValidatedUrlResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl.trim()) return;

    setIsTesting(true);
    setResult(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/intelligence/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || `Validation error ${res.status}`);
      }

      const data: ValidatedUrlResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to validate URL');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 font-mono text-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              Live Source URL Validation &amp; 404 Prevention Probe
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleTest} className="mt-4 space-y-3">
          <p className="text-slate-300 font-sans text-xs">
            Test any publisher article URL. The engine safely follows redirects, detects 404s/410s, measures latency, and verifies canonical destinations before accepting sources as evidence.
          </p>

          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com/article/tech-breakthrough"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              required
              className="flex-1 px-3 py-2 rounded bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono text-xs"
            />
            <button
              type="submit"
              disabled={isTesting}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isTesting ? 'Probing...' : 'Probe URL'}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-4 p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300">
            {errorMsg}
          </div>
        )}

        {result && (
          <div className="mt-5 p-4 rounded-lg bg-slate-950 border border-slate-800/90 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-slate-300">Probe Diagnostics Result</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {result.latencyMs}ms
                </span>
                {result.isAvailable ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> HTTP {result.httpStatus} OK
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Unavailable ({result.httpStatus || 'Error'})
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-500 block">Submitted Target:</span>
                <span className="text-slate-300 break-all">{result.originalUrl}</span>
              </div>

              <div>
                <span className="text-slate-500 block">Canonical Destination:</span>
                <span className="text-cyan-300 break-all font-bold">{result.canonicalUrl}</span>
              </div>

              {result.redirectDetected && (
                <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px]">
                  <span className="text-indigo-400 font-bold block mb-1 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> Redirect Chain Preserved:
                  </span>
                  {result.redirectChain.map((url, i) => (
                    <div key={i} className="text-slate-400 truncate">
                      Hop {i + 1}: {url}
                    </div>
                  ))}
                </div>
              )}

              {result.error && (
                <div className="p-2 rounded bg-rose-950/30 border border-rose-900/50 text-rose-300 text-[11px]">
                  <strong>Diagnostic Note:</strong> {result.error}
                </div>
              )}

              <div className="pt-2 border-t border-slate-900 text-slate-400">
                <strong>Engine Decision: </strong>
                {result.isAvailable ? (
                  <span className="text-emerald-400">
                    Eligible for Verified Evidence Status. Exact canonical URL retained.
                  </span>
                ) : (
                  <span className="text-rose-400">
                    "Source unavailable — not used as verified evidence". Excluded from verified counts.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 pt-3 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
