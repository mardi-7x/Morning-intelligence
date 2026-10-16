import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { fetchRecentTechArticles } from './src/server/newsFetcher.ts';
import { runVerificationPipeline, reverifyEvent, processTechIntelligenceFeed } from './src/server/verificationEngine.ts';
import { validateSourceUrl } from './src/server/urlValidator.ts';
import { IntelligenceFeedResponse, TechIntelligenceEvent } from './src/types/intelligence.ts';
import {
  startBackendScheduler,
  getSchedulerStatus,
  executeScheduledDailyRun,
  updateSchedulerConfig,
} from './src/server/backendScheduler.ts';
import { streamAiResponse } from './src/server/aiStreamingService.ts';
import { jobQueue } from './src/server/jobQueue.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Enable reverse proxy trust (Cloud Run / Google Frontend ingress terminates TLS)
app.set('trust proxy', 1);

// Security Headers & HTTPS Enforcement Middleware
app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] || req.headers['host'] || '') as string;
  const isLocalOrInternal =
    !host ||
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('0.0.0.0') ||
    host.includes(':3000') ||
    host.includes(':8080');

  const proto = (req.headers['x-forwarded-proto'] || req.protocol) as string;

  // Only redirect HTTP to HTTPS in production on a public non-localhost domain
  // Ensure we never redirect the development Preview to an unreachable localhost URL
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENFORCE_HTTPS === 'true' &&
    !isLocalOrInternal &&
    !host.includes('localhost') &&
    proto === 'http'
  ) {
    return res.redirect(301, `https://${host}${req.url}`);
  }

  // Enforce HSTS only on real external production HTTPS connections (never on localhost/preview)
  if (!isLocalOrInternal && process.env.NODE_ENV === 'production' && (req.secure || proto === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Standard security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
});

app.use(express.json());

// In-memory cache for intelligence feed
let cachedFeed: IntelligenceFeedResponse | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

app.get('/api/health', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const mem = process.memoryUsage();
  const recentJobs = jobQueue.getJobs();
  const activeJobs = recentJobs.filter((j) => j.status === 'running' || j.status === 'queued');

  res.json({
    status: 'operational',
    service: '24-Hour Tech World Intelligence',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    protocol: isHttps ? 'https' : (req.protocol || 'http'),
    secure: isHttps,
    forwardedProto: req.headers['x-forwarded-proto'] || 'direct',
    tlsCertified: true,
    performance: {
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      memoryHeapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      nodeVersion: process.version,
    },
    backgroundJobs: {
      activeCount: activeJobs.length,
      totalCount: recentJobs.length,
    },
    schedulerConfigured: true,
  });
});

// Scheduler status and telemetry endpoint
app.get('/api/scheduler/status', (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve scheduler status', message: err.message });
  }
});

// Manual trigger for testing the automated 9:30 AM IST 5-step cycle immediately
app.post('/api/scheduler/trigger-now', async (req, res) => {
  try {
    console.log('[API Scheduler] Manual trigger initiated by user...');
    const result = await executeScheduledDailyRun(true);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Scheduler execution failure', message: err.message });
  }
});

// Google Cloud Scheduler Automated 09:30 AM IST Trigger Endpoint
// Compatible with Google Cloud Scheduler cron schedule (30 9 * * * / Asia/Kolkata)
app.post('/api/v1/trigger-daily-digest', async (req, res) => {
  try {
    console.log('[DIAGNOSTIC] [Cloud Scheduler] Invocation received on /api/v1/trigger-daily-digest (09:30 AM IST target)');
    
    // Validate secret token if configured in environment
    const cronSecret = process.env.CRON_SECRET_TOKEN?.trim();
    if (cronSecret) {
      const authHeader = req.headers['authorization'] || '';
      const headerSecret = req.headers['x-cron-secret'];
      const isAuthValid =
        headerSecret === cronSecret ||
        authHeader === `Bearer ${cronSecret}` ||
        authHeader === cronSecret;

      if (!isAuthValid) {
        console.warn('[DIAGNOSTIC] [Cloud Scheduler] Unauthorized trigger attempt rejected.');
        return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET_TOKEN credentials' });
      }
    }

    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await executeScheduledDailyRun(force);
    res.json(result);
  } catch (err: any) {
    console.error('[DIAGNOSTIC] [Cloud Scheduler] Execution error:', err?.message || err);
    res.status(500).json({ error: 'Failed to execute scheduled daily digest', message: err?.message });
  }
});

// Update scheduler configuration (recipient email, SMTP settings, etc.)
app.post('/api/scheduler/update-config', (req, res) => {
  try {
    const { recipientEmail, enabled, smtpHost, smtpUser, smtpPass } = req.body;
    const updated = updateSchedulerConfig({
      ...(recipientEmail ? { recipientEmail } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
      ...(smtpHost ? { smtpHost } : {}),
      ...(smtpUser ? { smtpUser } : {}),
      ...(typeof smtpPass === 'string' ? { smtpPass } : {}),
    });
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update scheduler config', message: err.message });
  }
});

// ============================================================================
// 4D Research Paper & Telegram Serverless Architecture Endpoints
// ============================================================================

// GET /api/research/today: Retrieve today's #1 breakthrough arXiv paper and Gemini 3-bullet digest
app.get('/api/research/today', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const { getTodayResearchDigest } = await import('./src/server/researchEngineService.ts');
    const result = await getTodayResearchDigest(forceRefresh);
    res.json(result);
  } catch (err: any) {
    console.error('[API Research] Error getting today digest:', err);
    res.status(500).json({ error: 'Failed to fetch research paper digest', message: err?.message });
  }
});

// GET /api/research/user: Retrieve 7-Day Trial Profile for the active user
app.get('/api/research/user', async (req, res) => {
  try {
    const { getUserProfile, getAllRegisteredUsers } = await import('./src/server/trialTracker.ts');
    const requestedId = req.query.user_id as string | undefined;
    const allUsers = getAllRegisteredUsers();
    const targetId = requestedId || allUsers[0]?.user_id;
    const user = getUserProfile(targetId);
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load user profile', message: err?.message });
  }
});

// POST /api/research/user: Update 7-Day Trial Profile (language, day count, status)
app.post('/api/research/user', async (req, res) => {
  try {
    const { updateUserProfile, getAllRegisteredUsers } = await import('./src/server/trialTracker.ts');
    const { user_id, preferred_language, trial_day_count, status } = req.body;
    const allUsers = getAllRegisteredUsers();
    const targetId = user_id || allUsers[0]?.user_id;
    if (!targetId) {
      return res.status(400).json({ error: 'No user_id specified or registered.' });
    }
    const updated = updateUserProfile(targetId, {
      ...(preferred_language ? { preferred_language } : {}),
      ...(typeof trial_day_count === 'number' ? { trial_day_count } : {}),
      ...(status ? { status } : {}),
    });
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user profile', message: err?.message });
  }
});

// POST /api/research/user/reset: Reset 7-day trial back to Day 1
app.post('/api/research/user/reset', async (req, res) => {
  try {
    const { resetUserTrial, getAllRegisteredUsers } = await import('./src/server/trialTracker.ts');
    const { user_id } = req.body;
    const allUsers = getAllRegisteredUsers();
    const targetId = user_id || allUsers[0]?.user_id;
    if (!targetId) {
      return res.status(400).json({ error: 'No registered user to reset.' });
    }
    const user = resetUserTrial(targetId);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset trial', message: err?.message });
  }
});

// POST /api/research/rate: Record feedback (🔥 দরকারী vs 💤 ভালো লাগেনি)
app.post('/api/research/rate', async (req, res) => {
  try {
    const { recordUserFeedback, getAllRegisteredUsers } = await import('./src/server/trialTracker.ts');
    const { paperId, paperTitle, rating, topicTags, user_id } = req.body;
    if (!paperId || !rating) {
      return res.status(400).json({ error: 'paperId and rating are required' });
    }
    const allUsers = getAllRegisteredUsers();
    const targetId = user_id || allUsers[0]?.user_id;
    if (!targetId) {
      return res.status(400).json({ error: 'No registered user to record feedback for.' });
    }
    const user = recordUserFeedback(
      targetId,
      paperId,
      paperTitle || 'arXiv Paper',
      rating,
      topicTags || []
    );
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record feedback', message: err?.message });
  }
});

// POST /api/research/send-telegram: Trigger dispatch to user's Telegram Chat
app.post('/api/research/send-telegram', async (req, res) => {
  try {
    const { executeTelegramDailyCycle } = await import('./src/server/researchEngineService.ts');
    console.log('[API Research] Manual Telegram send requested by user...');
    const result = await executeTelegramDailyCycle(true);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send to Telegram', message: err?.message });
  }
});

// POST /api/research/stream-analysis: Streams real-time AI analysis using Server-Sent Events (SSE)
app.post('/api/research/stream-analysis', async (req, res) => {
  const { prompt, paperTitle, paperAbstract, language = 'bn', topic, context } = req.body || {};
  console.log(`[API Research Stream] Inbound streaming request (lang=${language}, promptLen=${(prompt || '').length})`);

  // Disable Nagle's algorithm for low-latency TCP packet delivery
  req.socket?.setNoDelay(true);

  // Configure SSE response headers for real-time incremental flush
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();
  const handleAbort = () => {
    if (!res.writableEnded) {
      console.log('[API Research Stream] Client disconnected, aborting generation.');
      abortController.abort();
    }
  };
  req.on('close', handleAbort);
  res.on('close', handleAbort);

  const isBengali = language === 'bn';
  const systemInstruction = isBengali
    ? `তুমি "মর্নিং ইন্টেলিজেন্স" (Morning Intelligence)-এর একজন বিশেষজ্ঞ এআই ও বিজ্ঞান গবেষক।
ব্যবহারকারী আজকের নির্বাচিত ব্রেকথ্রু গবেষণা পেপার বা প্রযুক্তিগত সংবাদ সম্পর্কে প্রশ্ন করেছেন বা বিস্তারিত বিশ্লেষণ চেয়েছেন।
তোমার উত্তরটি হবে তথ্যবহুল, প্রাঞ্জল, নির্ভুল এবং ব্যাকরণগতভাবে শুদ্ধ বাংলায়।
প্রযুক্তিগত মূল পরিভাষাগুলো স্বাভাবিকভাবে উপস্থাপন করো এবং কোনো তথ্য বানিয়ে বলবে না। অনুচ্ছেদ ও পরিষ্কার পয়েন্ট আকারে লেখো।`
    : `You are the Lead AI Research Scientist for Morning Intelligence.
The user is asking for in-depth technical analysis or insights regarding today's breakthrough scientific paper or technology report.
Provide an authoritative, clear, and comprehensive response. Preserve factual integrity and explain neural architecture, implications, and practical takeaways clearly with structured paragraphs and bullet points.`;

  const fullPrompt = `Subject: ${paperTitle || topic || 'Morning Intelligence Research'}
Context / Source Material:
${paperAbstract || context || 'Morning Intelligence 24-Hour Verified Feed'}

User Question / Analysis Request:
${prompt || 'Provide a comprehensive synthesis and key takeaways of this research paper.'}`;

  try {
    const fullText = await streamAiResponse(
      fullPrompt,
      { systemInstruction, language, temperature: 0.3 },
      (chunkText) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
      },
      abortController.signal
    );

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
      res.end();
    }
  } catch (err: any) {
    console.error('[API Research Stream] Streaming error:', err?.message || err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err?.message || 'Streaming generation failed' })}\n\n`);
      res.end();
    }
  }
});

// GET /api/research/download-pdf: Generates and streams original 24-Hour Tech World Intelligence Dossier PDF
app.get('/api/research/download-pdf', async (req, res) => {
  try {
    const { processTechIntelligenceFeed } = await import('./src/server/verificationEngine.ts');
    const { buildIntelligencePdfDoc } = await import('./src/utils/generatePdfReport.ts');

    const techFeed = await processTechIntelligenceFeed({ forceRefresh: false });
    const pdfDoc = buildIntelligencePdfDoc({
      events: techFeed.events,
      stats: techFeed.stats,
      reportTitle: '24-Hour Tech World Intelligence Dossier',
      scopeLabel: 'Verified 24-Hour Technological Events',
    });

    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Tech_World_Intelligence_Dossier_${dateSlug}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err: any) {
    console.error('[API Research] Failed to generate PDF:', err);
    res.status(500).json({ error: 'Failed to generate PDF', message: err?.message });
  }
});

// GET /api/jobs: List recent background jobs with status & progress
app.get('/api/jobs', (req, res) => {
  try {
    const { userId, type, status, limit = '20' } = req.query as {
      userId?: string;
      type?: any;
      status?: any;
      limit?: string;
    };
    const max = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const jobs = jobQueue.getJobs({ userId, type, status }).slice(0, max);
    res.json({
      total: jobs.length,
      jobs,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve jobs', message: err?.message });
  }
});

// GET /api/jobs/:jobId: Get status and progress of a single job
app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// GET /api/jobs/:jobId/stream: Server-Sent Events (SSE) streaming progress of a specific job
app.get('/api/jobs/:jobId/stream', (req, res) => {
  const jobId = req.params.jobId;
  const initialJob = jobQueue.getJob(jobId);

  if (!initialJob) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Setup SSE
  req.socket?.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial state immediately
  res.write(`data: ${JSON.stringify({ type: 'initial', job: initialJob })}\n\n`);

  if (initialJob.status === 'completed' || initialJob.status === 'failed') {
    res.write(`data: ${JSON.stringify({ type: 'done', job: initialJob })}\n\n`);
    return res.end();
  }

  const onProgress = (job: any) => {
    if (job.id === jobId && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'progress', progress: job.progress, status: job.status })}\n\n`);
    }
  };

  const onCompleted = (job: any) => {
    if (job.id === jobId && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'completed', result: job.result, job })}\n\n`);
      res.end();
    }
  };

  const onFailed = (job: any) => {
    if (job.id === jobId && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'failed', error: job.error, job })}\n\n`);
      res.end();
    }
  };

  jobQueue.on('job:progress', onProgress);
  jobQueue.on('job:completed', onCompleted);
  jobQueue.on('job:failed', onFailed);

  const cleanup = () => {
    jobQueue.off('job:progress', onProgress);
    jobQueue.off('job:completed', onCompleted);
    jobQueue.off('job:failed', onFailed);
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
});

// POST /api/jobs/trigger-read: Enqueues an on-demand briefing compilation job via API
app.post('/api/jobs/trigger-read', async (req, res) => {
  try {
    const { userId = 'api_client', language = 'bn' } = req.body || {};
    const { registerOrGetUser } = await import('./src/server/trialTracker.ts');
    const { user } = registerOrGetUser(userId);
    user.preferred_language = language;

    const { job, isExisting } = jobQueue.enqueueJob('user_on_demand_read', userId, {
      user,
    });

    res.status(isExisting ? 200 : 202).json({
      success: true,
      jobId: job.id,
      status: job.status,
      isExisting,
      streamUrl: `/api/jobs/${job.id}/stream`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to enqueue job', message: err?.message });
  }
});

// GET /api/intelligence/stream-feed: Streams news events progressively via SSE
app.get('/api/intelligence/stream-feed', async (req, res) => {
  req.socket?.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Collecting 24h tech wire...' })}\n\n`);
    const { fetchRecentTechArticles } = await import('./src/server/newsFetcher.ts');
    const { articles, newsApiStatus, newsDataStatus } = await fetchRecentTechArticles();

    res.write(
      `data: ${JSON.stringify({
        type: 'articles_collected',
        count: articles.length,
        newsApiStatus,
        newsDataStatus,
      })}\n\n`
    );

    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Running verification & URL corroboration...' })}\n\n`);
    const { runVerificationPipeline } = await import('./src/server/verificationEngine.ts');
    const { events, stats, engineUsed } = await runVerificationPipeline(articles);

    // Stream each verified event progressively
    for (let i = 0; i < events.length; i++) {
      if (res.writableEnded) break;
      res.write(
        `data: ${JSON.stringify({
          type: 'event',
          index: i + 1,
          total: events.length,
          event: events[i],
        })}\n\n`
      );
    }

    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          stats,
          engineUsed,
          totalEvents: events.length,
        })}\n\n`
      );
      res.end();
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err?.message || 'Streaming failed' })}\n\n`);
      res.end();
    }
  }
});

// POST /api/telegram/webhook & POST /webhook: Inbound Telegram webhook handler
app.post(['/api/telegram/webhook', '/webhook'], async (req, res) => {
  try {
    console.log(`[DIAGNOSTIC] [Webhook Receiver] Inbound Telegram webhook HTTP POST received on ${req.path}`);
    const { processTelegramUpdate } = await import('./src/server/telegramBotService.ts');
    await processTelegramUpdate(req.body);
    res.status(200).send('OK');
  } catch (err: any) {
    console.error('[DIAGNOSTIC] [Webhook Receiver] Error processing webhook payload:', err?.message || err);
    res.status(200).send('OK'); // Always 200 OK for Telegram
  }
});

// GET /api/telegram/webhook-info: Returns Telegram getWebhookInfo without exposing token
app.get('/api/telegram/webhook-info', async (req, res) => {
  try {
    const { getTelegramConfig } = await import('./src/server/telegramDispatcher.ts');
    const config = getTelegramConfig();
    const token = config.botToken;
    if (!token) {
      return res.status(400).json({ error: 'botToken not configured' });
    }
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData = await infoRes.json();
    res.json({
      ok: infoData.ok,
      webhookUrl: infoData.result?.url || '',
      hasCustomCert: infoData.result?.has_custom_certificate || false,
      pendingUpdateCount: infoData.result?.pending_update_count || 0,
      lastErrorDate: infoData.result?.last_error_date,
      lastErrorMessage: infoData.result?.last_error_message,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to query Telegram webhook info', message: err?.message });
  }
});

// POST /api/telegram/set-webhook: Dynamically registers or deletes Telegram Webhook URL
app.post('/api/telegram/set-webhook', async (req, res) => {
  try {
    const { webhookUrl, dropPendingUpdates } = req.body;
    const { getTelegramConfig } = await import('./src/server/telegramDispatcher.ts');
    const config = getTelegramConfig();
    const token = config.botToken;
    if (!token) {
      return res.status(400).json({ error: 'botToken not configured' });
    }

    if (!webhookUrl) {
      // Clear webhook and revert to getUpdates
      const delRes = await fetch(
        `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=${Boolean(dropPendingUpdates)}`
      );
      const delData = await delRes.json();
      console.log('[DIAGNOSTIC] Webhook deleted from Telegram. Reverting to polling mode.');
      return res.json({ success: delData.ok, mode: 'polling', telegramResult: delData });
    }

    if (!String(webhookUrl).startsWith('https://')) {
      return res.status(400).json({
        error: 'Insecure URL',
        message: 'Telegram Webhooks strictly require a valid, publicly reachable HTTPS URL (e.g. https://your-domain.com/api/telegram/webhook).'
      });
    }

    // Register webhook URL
    const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: Boolean(dropPendingUpdates),
      }),
    });
    const setData = await setRes.json();
    console.log(`[DIAGNOSTIC] Telegram setWebhook called with url=${webhookUrl}: ok=${setData.ok}`);
    res.json({ success: setData.ok, mode: 'webhook', webhookUrl, telegramResult: setData });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to configure Telegram webhook', message: err?.message });
  }
});

// GET /api/research/users: Returns all registered Telegram users dynamically
app.get('/api/research/users', async (req, res) => {
  try {
    const { getAllRegisteredUsers } = await import('./src/server/trialTracker.ts');
    const users = getAllRegisteredUsers();
    const sanitized = users.map((u) => ({
      user_id_masked: u.user_id.length > 4 ? `${u.user_id.slice(0, 4)}••••${u.user_id.slice(-2)}` : u.user_id,
      user_id: u.user_id,
      username: u.username,
      firstName: u.firstName,
      trial_day_count: u.trial_day_count,
      status: u.status,
      preferred_language: u.preferred_language,
      joined_date: u.joined_date,
      total_digests_received: u.total_digests_received || 0,
      last_digest_sent_at: u.last_digest_sent_at,
      last_delivery_status: u.last_delivery_status,
      last_delivery_error: u.last_delivery_error,
    }));
    res.json({ total: sanitized.length, users: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load users', message: err?.message });
  }
});

// GET /api/research/telegram-status: Masked Telegram credentials, connection, and history
app.get('/api/research/telegram-status', async (req, res) => {
  try {
    const { getTelegramConfig, getTelegramDispatchHistory } = await import(
      './src/server/telegramDispatcher.ts'
    );
    const config = getTelegramConfig();
    const history = getTelegramDispatchHistory();

    // Mask sensitive token & chat id for security
    const token = config.botToken || '';
    const maskedToken =
      token.length > 10 ? `${token.slice(0, 4)}••••••••••••••••••••••••${token.slice(-5)}` : '••••••••';
    const { getAllRegisteredUsers } = await import('./src/server/trialTracker.ts');
    const { isTelegramPollingActive } = await import('./src/server/telegramBotService.ts');
    const allUsers = getAllRegisteredUsers();
    const activeChatId = allUsers[0]?.user_id || config.chatId || '';
    const maskedChatId =
      activeChatId.length > 4
        ? `${activeChatId.slice(0, 4)}••••${activeChatId.slice(-2)}`
        : activeChatId || 'Dynamic (Multi-user)';

    res.json({
      enabled: config.enabled,
      pollingActive: isTelegramPollingActive(),
      botUsername: config.botUsername || 'SubhadipMorningBot',
      botFirstName: config.botFirstName || 'Morning Intelligence',
      chatIdMasked: maskedChatId,
      tokenMasked: maskedToken,
      paymentLinkUrl: config.paymentLinkUrl,
      history,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load Telegram status', message: err?.message });
  }
});

// POST /api/research/telegram-toggle: Enable or pause automated Telegram dispatches
app.post('/api/research/telegram-toggle', async (req, res) => {
  try {
    const { getTelegramConfig, saveTelegramConfig } = await import('./src/server/telegramDispatcher.ts');
    const { enabled } = req.body;
    const config = getTelegramConfig();
    config.enabled = typeof enabled === 'boolean' ? enabled : !config.enabled;
    saveTelegramConfig(config);
    res.json({ success: true, enabled: config.enabled });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle Telegram', message: err?.message });
  }
});

app.get('/api/intelligence/feed', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  if (cachedFeed && !forceRefresh && now - lastFetchTime < CACHE_TTL_MS) {
    return res.json(cachedFeed);
  }

  try {
    const responsePayload = await processTechIntelligenceFeed({ forceRefresh });
    cachedFeed = responsePayload;
    lastFetchTime = now;
    res.json(responsePayload);
  } catch (error: any) {
    console.error('[API Feed] Generation failed:', error);
    res.status(500).json({
      error: 'Intelligence pipeline execution failure',
      message: error?.message || 'Unknown server error',
    });
  }
});

app.post('/api/intelligence/reverify', async (req, res) => {
  try {
    const { event } = req.body as { event: TechIntelligenceEvent };
    if (!event || !event.id) {
      return res.status(400).json({ error: 'Valid event payload required for re-verification' });
    }

    const updatedEvent = await reverifyEvent(event);

    // Update in cached feed if present
    if (cachedFeed) {
      const idx = cachedFeed.events.findIndex((e) => e.id === updatedEvent.id);
      if (idx !== -1) {
        cachedFeed.events[idx] = updatedEvent;
      }
    }

    res.json({ event: updatedEvent });
  } catch (err: any) {
    console.error('[API Reverify] Error:', err);
    res.status(500).json({ error: 'Re-verification failed', message: err?.message });
  }
});

app.post('/api/intelligence/validate-url', async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const validation = await validateSourceUrl(url);
    res.json(validation);
  } catch (err: any) {
    res.status(500).json({ error: 'URL validation failed', message: err?.message });
  }
});

// Start server with Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`[TechWorldIntelligence] Server operational at http://${HOST}:${PORT}`);
    // Start automated backend scheduler (runs 9:30 AM IST / 04:00 UTC daily)
    startBackendScheduler();
    // Start dynamic Telegram update polling worker (for incoming /start and bot commands)
    import('./src/server/telegramBotService.ts')
      .then(({ startTelegramPollingWorker }) => {
        startTelegramPollingWorker();
      })
      .catch((err) => {
        console.error('[TechWorldIntelligence] Failed to start Telegram polling worker:', err);
      });
  });

  // Cloud Run Graceful Shutdown Handler
  const handleShutdown = (signal: string) => {
    console.log(`[Cloud Run] Received ${signal}. Starting graceful shutdown...`);
    try {
      // 1. Persist in-memory job queue state immediately
      jobQueue.persistJobsSync();

      // 2. Stop Telegram long polling worker
      import('./src/server/telegramBotService.ts')
        .then(({ stopTelegramPollingWorker }) => {
          stopTelegramPollingWorker();
        })
        .catch(() => {});

      // 3. Stop accepting new connections and close server
      server.close(() => {
        console.log('[Cloud Run] HTTP server closed gracefully. Exiting process.');
        process.exit(0);
      });

      setTimeout(() => {
        console.warn('[Cloud Run] Forcefully exiting after shutdown timeout.');
        process.exit(0);
      }, 8000);
    } catch (e) {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();
