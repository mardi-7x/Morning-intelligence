import React, { useState, useEffect } from 'react';
import {
  Clock,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  FileDown,
  ShieldCheck,
  Server,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface SchedulerStatusData {
  config: {
    enabled: boolean;
    targetHourUtc: number;
    targetMinuteUtc: number;
    recipientEmail: string;
    smtpHost: string;
    smtpUser: string;
    smtpPass?: string;
    lastRunDateUtc: string | null;
    lastRunTimestamp: string | null;
  };
  isCurrentlyRunning: boolean;
  schedule: {
    targetTimeIst: string;
    targetTimeUtc: string;
    nextRunUtc: string;
    nextRunIst: string;
    secondsRemaining: number;
  };
  history: Array<{
    id: string;
    dispatchedAt: string;
    recipient: string;
    subject: string;
    status: 'SUCCESS' | 'FAILED' | 'ARCHIVED_LOCAL';
    eventsCount: number;
    verifiedCount: number;
    pdfSizeBytes: number;
    messageId?: string;
    error?: string;
    details?: string;
  }>;
}

interface SchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SchedulerModal: React.FC<SchedulerModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<SchedulerStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [recipientInput, setRecipientInput] = useState('subhadipmardi16@gmail.com');
  const [smtpHostInput, setSmtpHostInput] = useState('smtp.gmail.com');
  const [smtpUserInput, setSmtpUserInput] = useState('narayanmardi9735@gmail.com');
  const [smtpPassInput, setSmtpPassInput] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/scheduler/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.config?.recipientEmail) {
          setRecipientInput(json.config.recipientEmail);
        }
        if (json.config?.smtpHost) {
          setSmtpHostInput(json.config.smtpHost);
        }
        if (json.config?.smtpUser) {
          setSmtpUserInput(json.config.smtpUser);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch scheduler status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleTriggerNow = async () => {
    setIsTriggering(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/scheduler/trigger-now', {
        method: 'POST',
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({
          text: `Success! ${result.message}`,
          type: 'success',
        });
        await fetchStatus();
      } else {
        setActionMessage({
          text: result.message || 'Execution reported an issue.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: `Trigger error: ${err.message}`,
        type: 'error',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!recipientInput.trim()) return;
    setIsSavingConfig(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/scheduler/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: recipientInput.trim(),
          smtpHost: smtpHostInput.trim(),
          smtpUser: smtpUserInput.trim(),
          smtpPass: smtpPassInput.trim(),
        }),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({
          text: `Configuration updated: Recipient ${recipientInput.trim()} • SMTP sender ${smtpUserInput.trim()}`,
          type: 'success',
        });
        await fetchStatus();
      }
    } catch (err: any) {
      setActionMessage({
        text: `Update failed: ${err.message}`,
        type: 'error',
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  const formatSeconds = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-6 text-slate-200 font-sans space-y-6">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white shadow-lg shadow-indigo-900/40">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono uppercase tracking-wide">
                  Automated Daily Backend Scheduler
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ACTIVE (9:30 AM IST)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Runs automatically in the cloud every day at 9:30 AM IST (04:00 UTC) even when browser or phone is closed.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionMessage && (
          <div
            className={`p-3.5 rounded-xl text-xs font-mono flex items-center justify-between gap-3 border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}
          >
            <span className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              {actionMessage.text}
            </span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs underline cursor-pointer text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 5-Step Automated Cycle Cards */}
        <div className="space-y-2">
          <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider block">
            Automated Daily 5-Step Execution Workflow:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <span className="text-indigo-400 font-bold block mb-1">1. Collect Wire</span>
              <p className="text-[11px] text-slate-400 font-sans leading-tight">
                Gathers latest exact 24 hours of technical news with canonical URLs.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <span className="text-cyan-400 font-bold block mb-1">2. Multi-Verify</span>
              <p className="text-[11px] text-slate-400 font-sans leading-tight">
                NewsAPI + Groq + Gemini fact extraction &amp; live HTTP 404 elimination.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <span className="text-emerald-400 font-bold block mb-1">3. Compile Report</span>
              <p className="text-[11px] text-slate-400 font-sans leading-tight">
                Assembles claims, evidence status, confidence scores, and timestamps.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <span className="text-amber-400 font-bold block mb-1">4. Generate A4 PDF</span>
              <p className="text-[11px] text-slate-400 font-sans leading-tight">
                Generates forensic PDF dossier with exact clickable article hyperlinks.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <span className="text-rose-400 font-bold block mb-1">5. Email Attachment</span>
              <p className="text-[11px] text-slate-400 font-sans leading-tight">
                Dispatches PDF as attachment directly to configured recipient inbox.
              </p>
            </div>
          </div>
        </div>

        {/* Schedule & Telemetry Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>Target Schedule</span>
            </div>
            <div className="text-xl font-bold font-mono text-white">9:30 AM IST</div>
            <div className="text-xs text-slate-400 font-mono">
              04:00 AM UTC • Every Single Day (Rolling 24h Window)
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Countdown to Next Run</span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {data?.schedule?.secondsRemaining !== undefined
                ? formatSeconds(data.schedule.secondsRemaining)
                : 'Calculating...'}
            </div>
            <div className="text-xs text-slate-400 font-mono truncate" title={data?.schedule?.nextRunIst || ''}>
              Next: {data?.schedule?.nextRunIst?.replace('T', ' ').slice(0, 19) || 'Scheduled'} IST
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Execution State</span>
            </div>
            <div className="text-base font-bold font-mono text-white flex items-center gap-2">
              {data?.isCurrentlyRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span className="text-amber-400">Dispatch in Progress</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-200">Idle (Awaiting 9:30 AM IST)</span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Cloud Worker Service Active
            </div>
          </div>
        </div>

        {/* Recipient Email & SMTP Credentials Configuration */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-400" /> Automated Delivery &amp; SMTP Configuration
              </h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Every day at 9:30 AM IST, the 24-hour verified intelligence PDF will be sent to the recipient via your configured SMTP host.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTriggerNow}
                disabled={isTriggering || data?.isCurrentlyRunning}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-cyan-950/40 disabled:opacity-50 cursor-pointer active:scale-95"
                title="Execute the full 5-step automated workflow immediately and email the PDF"
              >
                <Send className={`w-3.5 h-3.5 ${isTriggering ? 'animate-spin' : ''}`} />
                <span>{isTriggering ? 'Executing 5-Step Pipeline...' : 'Test Run & Send Now'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            {/* Recipient Field */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 uppercase tracking-wider block">
                Target Recipient Email:
              </label>
              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="subhadipmardi16@gmail.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* SMTP Host / Sender Field */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 uppercase tracking-wider block">
                SMTP Sender / Host:
              </label>
              <input
                type="text"
                value={smtpUserInput}
                onChange={(e) => {
                  setSmtpUserInput(e.target.value);
                  if (e.target.value.includes('@')) {
                    setSmtpHostInput('smtp.gmail.com');
                  }
                }}
                placeholder="narayanmardi9735@gmail.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* SMTP Server Field */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 uppercase tracking-wider block">
                SMTP Server Gateway:
              </label>
              <input
                type="text"
                value={smtpHostInput}
                onChange={(e) => setSmtpHostInput(e.target.value)}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Optional Password Field */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 uppercase tracking-wider block">
                SMTP App Password (optional for live outbound gateway):
              </label>
              <input
                type="password"
                value={smtpPassInput}
                onChange={(e) => setSmtpPassInput(e.target.value)}
                placeholder="e.g. 16-character Google App Password"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400 font-sans">
              Configured dispatch: <strong>{smtpUserInput}</strong> &rarr; <strong>{recipientInput}</strong>
            </span>
            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig || !recipientInput.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold border border-indigo-400/40 disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSavingConfig ? 'Saving Settings...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {/* Dispatch History Audit Trail */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Automated Dispatch Audit Trail
            </h3>
            <button
              onClick={fetchStatus}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh Log
            </button>
          </div>

          {(!data?.history || data.history.length === 0) ? (
            <div className="p-6 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs font-mono">
              No previous automated runs logged yet. Click &quot;Test Run &amp; Send Now&quot; above to trigger an immediate verification &amp; email delivery.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5">Recipient</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Stories Verified</th>
                    <th className="p-2.5">PDF Size</th>
                    <th className="p-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
                  {data.history.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-900/30">
                      <td className="p-2.5 text-slate-300 whitespace-nowrap">
                        {new Date(record.dispatchedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
                      </td>
                      <td className="p-2.5 text-cyan-400 font-medium whitespace-nowrap">
                        {record.recipient}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {record.status === 'SUCCESS' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                            DELIVERED
                          </span>
                        ) : record.status === 'ARCHIVED_LOCAL' ? (
                          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px]">
                            COMPILED &amp; SAVED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px]">
                            FAILED
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {record.verifiedCount} / {record.eventsCount}
                      </td>
                      <td className="p-2.5 text-slate-400">
                        {(record.pdfSizeBytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="p-2.5 text-slate-400 max-w-xs truncate" title={record.details || record.error || ''}>
                        {record.details || record.error || 'Complete'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
