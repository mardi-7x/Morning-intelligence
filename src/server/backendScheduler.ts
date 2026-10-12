import { processTechIntelligenceFeed } from './verificationEngine';
import { buildIntelligencePdfDoc } from '../utils/generatePdfReport';
import { sendIntelligenceReportEmail, getDispatchHistory, DispatchRecord } from './emailDispatcher';
import fs from 'fs';
import path from 'path';

export interface SchedulerConfig {
  enabled: boolean;
  targetHourUtc: number; // 4 UTC = 9:30 AM IST (04:00 UTC)
  targetMinuteUtc: number; // 00 UTC
  recipientEmail: string;
  smtpHost: string;
  smtpUser: string;
  smtpPass?: string;
  lastRunDateUtc: string | null;
  lastRunTimestamp: string | null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SCHEDULER_CONFIG_FILE = path.join(DATA_DIR, 'scheduler-config.json');

// Default config: 9:30 AM IST = 04:00 UTC
const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  targetHourUtc: 4, // 04:00 UTC = 09:30 AM IST
  targetMinuteUtc: 0,
  recipientEmail: process.env.RECIPIENT_EMAIL || 'subhadipmardi16@gmail.com',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpUser: process.env.SMTP_USER || 'narayanmardi9735@gmail.com',
  smtpPass: process.env.SMTP_PASS || '',
  lastRunDateUtc: null,
  lastRunTimestamp: null,
};

let activeConfig: SchedulerConfig = { ...DEFAULT_CONFIG };
let schedulerInterval: NodeJS.Timeout | null = null;
let isCurrentlyRunning = false;

// Load config from disk
function loadConfig(): SchedulerConfig {
  try {
    if (fs.existsSync(SCHEDULER_CONFIG_FILE)) {
      const raw = fs.readFileSync(SCHEDULER_CONFIG_FILE, 'utf-8');
      activeConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } else {
      activeConfig = { ...DEFAULT_CONFIG };
      saveConfig(activeConfig);
    }
  } catch (err) {
    console.error('[Scheduler] Error loading config:', err);
    activeConfig = { ...DEFAULT_CONFIG };
  }
  return activeConfig;
}

// Save config to disk
export function saveConfig(config: SchedulerConfig): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SCHEDULER_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Scheduler] Error saving config:', err);
  }
}

/**
 * Calculates the next occurrence of 9:30 AM IST (04:00 UTC).
 */
export function getNextRunTimes(config: SchedulerConfig = activeConfig) {
  const now = new Date();
  
  // Calculate next run date in UTC
  const nextRun = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    config.targetHourUtc,
    config.targetMinuteUtc,
    0,
    0
  ));

  // If today's target time has already passed in UTC, schedule for tomorrow
  if (now.getTime() >= nextRun.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  const msRemaining = Math.max(0, nextRun.getTime() - now.getTime());
  const secondsRemaining = Math.floor(msRemaining / 1000);

  // Compute IST string representation (UTC + 5:30)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nextRunIst = new Date(nextRun.getTime() + istOffsetMs);

  return {
    nextRunUtc: nextRun.toISOString(),
    nextRunIst: nextRunIst.toISOString().replace('Z', '+05:30'),
    formattedIstTime: '9:30 AM IST',
    secondsRemaining,
  };
}

/**
 * Executes the complete 5-step automated intelligence cycle:
 * 1. Collect latest exact previous 24 hours of technology intelligence.
 * 2. Verify and process using existing NewsAPI + Groq + Gemini pipeline.
 * 3. Generate updated intelligence report.
 * 4. Convert report into A4 PDF with clickable URLs.
 * 5. Automatically email PDF as attachment.
 */
export async function executeScheduledDailyRun(isManual = false): Promise<{
  success: boolean;
  message: string;
  dispatchRecord?: DispatchRecord;
  error?: string;
}> {
  if (isCurrentlyRunning) {
    return {
      success: false,
      message: 'A verification & dispatch cycle is already in progress.',
    };
  }

  const todayUtcString = new Date().toISOString().slice(0, 10);

  // Idempotency check: Do not duplicate previous reports on the same day unless manually triggered
  if (!isManual && activeConfig.lastRunDateUtc === todayUtcString) {
    console.log(`[Scheduler] Report for ${todayUtcString} was already dispatched. Skipping duplicate run.`);
    return {
      success: true,
      message: `Daily report for ${todayUtcString} was already dispatched.`,
    };
  }

  isCurrentlyRunning = true;
  console.log(`[DIAGNOSTIC] [Scheduler] Starting automated 24h intelligence cycle at ${new Date().toISOString()} (Manual: ${isManual}, Target: 09:30 AM IST / 04:00 UTC)...`);

  try {
    let feed: any = null;
    let pdfBuffer: Buffer | null = null;
    let emailRecord: DispatchRecord | undefined;

    // Step 1-4: Tech Intelligence Feed, Verification & PDF generation
    try {
      console.log('[DIAGNOSTIC] [Scheduler] Step 1 & 2: Collecting & verifying fresh 24-hour wire...');
      feed = await processTechIntelligenceFeed({ forceRefresh: true });

      if (feed && feed.events && feed.events.length > 0) {
        console.log(`[DIAGNOSTIC] [Scheduler] Step 3: Generated intelligence feed with ${feed.events.length} total events (${feed.stats.verifiedCount} verified).`);
        console.log('[DIAGNOSTIC] [Scheduler] Step 4: Compiling high-end A4 PDF with exact source URLs...');
        const pdfDoc = buildIntelligencePdfDoc({
          events: feed.events,
          stats: feed.stats,
          reportTitle: '24-Hour Tech World Intelligence Dossier',
          scopeLabel: 'Automated 24-Hour Verified Wire (9:30 AM IST Daily Briefing)',
        });
        const pdfArrayBuffer = pdfDoc.output('arraybuffer');
        pdfBuffer = Buffer.from(pdfArrayBuffer);
        console.log(`[DIAGNOSTIC] [Scheduler] Step 4 complete: PDF generated (${pdfBuffer.length} bytes).`);
      } else {
        console.warn('[DIAGNOSTIC] [Scheduler] Fresh news wire returned empty events. Proceeding with research dispatch.');
      }
    } catch (feedErr: any) {
      console.error('[DIAGNOSTIC] [Scheduler] Tech news wire collection error (isolated):', feedErr?.message || feedErr);
    }

    // Step 5: Automatically email the PDF if available
    if (pdfBuffer && feed) {
      try {
        console.log(`[DIAGNOSTIC] [Scheduler] Step 5: Emailing PDF attachment to ${activeConfig.recipientEmail}...`);
        emailRecord = await sendIntelligenceReportEmail({
          pdfBuffer,
          events: feed.events,
          stats: feed.stats,
          recipientEmail: activeConfig.recipientEmail,
          smtpConfig: {
            smtpHost: activeConfig.smtpHost,
            smtpUser: activeConfig.smtpUser,
            smtpPass: activeConfig.smtpPass,
          },
          isManualTrigger: isManual,
        });
        console.log(`[DIAGNOSTIC] [Scheduler] Step 5 email delivery record: status=${emailRecord.status}, id=${emailRecord.id}`);
      } catch (emailErr: any) {
        console.error('[DIAGNOSTIC] [Scheduler] Step 5 Email delivery warning (isolated):', emailErr?.message || emailErr);
      }
    }

    // Step 6: Trigger 4D arXiv Research Paper Telegram Dispatch (09:30 AM IST) - ALWAYS EXECUTED INDEPENDENTLY
    let telegramResult: any = null;
    try {
      const { executeTelegramDailyCycle } = await import('./researchEngineService.ts');
      console.log('[DIAGNOSTIC] [Scheduler] Step 6: Dispatching 4D Breakthrough Research Paper to Telegram...');
      telegramResult = await executeTelegramDailyCycle(isManual);
      console.log(
        `[DIAGNOSTIC] [Scheduler] Step 6 Telegram dispatch complete: success=${telegramResult.success}, dispatched=${telegramResult.dispatchedCount}, failed=${telegramResult.failedCount}`
      );
    } catch (tgErr: any) {
      console.error('[DIAGNOSTIC] [Scheduler] Telegram 4D Research dispatch error (isolated):', tgErr?.message || tgErr);
    }

    // Mark today as dispatched if either Telegram or Email ran
    if (telegramResult?.success || emailRecord?.status === 'SUCCESS' || emailRecord?.status === 'ARCHIVED_LOCAL') {
      activeConfig.lastRunDateUtc = todayUtcString;
      activeConfig.lastRunTimestamp = new Date().toISOString();
      saveConfig(activeConfig);
    } else if (!isManual) {
      // Set run date to avoid infinite tight-loop failure retries
      activeConfig.lastRunDateUtc = todayUtcString;
      activeConfig.lastRunTimestamp = new Date().toISOString();
      saveConfig(activeConfig);
    }

    console.log(`[DIAGNOSTIC] [Scheduler] Daily intelligence cycle completed: email=${emailRecord?.status || 'SKIPPED'}, telegram=${telegramResult?.dispatchedCount || 0} sent`);

    return {
      success: true,
      message: `24-Hour Intelligence Dossier cycle executed (Email: ${emailRecord?.status || 'N/A'}, Telegram dispatched: ${telegramResult?.dispatchedCount || 0})`,
      dispatchRecord: emailRecord,
    };
  } catch (err: any) {
    console.error('[DIAGNOSTIC] [Scheduler] Error during automated intelligence run:', err?.message || err);
    return {
      success: false,
      message: `Automated run failed: ${err.message}`,
      error: err.message,
    };
  } finally {
    isCurrentlyRunning = false;
  }
}

/**
 * Starts the automated backend scheduler loop.
 * Runs in background independently of frontend browser/client.
 */
export function startBackendScheduler(): void {
  loadConfig();

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`[DIAGNOSTIC] [Scheduler] Initialized. Daily run configured at 9:30 AM IST (04:00 UTC). Recipient: ${activeConfig.recipientEmail}`);

  let lastLoggedMinute = -1;

  // Check every 30 seconds for target time match
  schedulerInterval = setInterval(async () => {
    if (!activeConfig.enabled || isCurrentlyRunning) return;

    const now = new Date();
    const currentUtcHours = now.getUTCHours();
    const currentUtcMinutes = now.getUTCMinutes();
    const todayUtc = now.toISOString().slice(0, 10);

    // Periodic heartbeat log every 10 minutes or at target hour
    if (currentUtcMinutes % 10 === 0 && currentUtcMinutes !== lastLoggedMinute) {
      lastLoggedMinute = currentUtcMinutes;
      console.log(
        `[DIAGNOSTIC] [Scheduler Tick] currentUtc=${now.toISOString()}, targetUtc=${activeConfig.targetHourUtc}:${String(activeConfig.targetMinuteUtc).padStart(2, '0')} (09:30 AM IST), lastRunDateUtc=${activeConfig.lastRunDateUtc || 'never'}`
      );
    }

    // 04:00 UTC = 09:30 AM IST (with catch-up if server started or woke after target time on the same date)
    const exactMatch =
      currentUtcHours === activeConfig.targetHourUtc && currentUtcMinutes === activeConfig.targetMinuteUtc;
    const pastTargetToday =
      currentUtcHours > activeConfig.targetHourUtc ||
      (currentUtcHours === activeConfig.targetHourUtc && currentUtcMinutes >= activeConfig.targetMinuteUtc);
    const needsRun = (exactMatch || pastTargetToday) && activeConfig.lastRunDateUtc !== todayUtc;

    if (needsRun) {
      console.log(
        `[DIAGNOSTIC] [Scheduler] Target time reached or passed (Current UTC: ${now.toISOString()} / 09:30 AM IST). Launching automated intelligence dispatch!`
      );
      await executeScheduledDailyRun(false);
    }
  }, 30000);
}

/**
 * Returns current scheduler status, timing, and dispatch history.
 */
export function getSchedulerStatus() {
  loadConfig();
  const times = getNextRunTimes(activeConfig);
  const history = getDispatchHistory();

  return {
    config: activeConfig,
    isCurrentlyRunning,
    schedule: {
      targetTimeIst: '9:30 AM IST',
      targetTimeUtc: '04:00 AM UTC',
      nextRunUtc: times.nextRunUtc,
      nextRunIst: times.nextRunIst,
      secondsRemaining: times.secondsRemaining,
    },
    history,
  };
}

/**
 * Updates recipient email or status.
 */
export function updateSchedulerConfig(updates: Partial<SchedulerConfig>): SchedulerConfig {
  loadConfig();
  activeConfig = {
    ...activeConfig,
    ...updates,
  };
  saveConfig(activeConfig);
  return activeConfig;
}
