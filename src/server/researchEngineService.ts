import { fetchLatestArxivPapers } from './arxivFetcher';
import {
  getUserProfile,
  advanceUserTrialDay,
  getAllRegisteredUsers,
  registerOrGetUser,
  markUserDeliveryResult,
} from './trialTracker';
import { selectBestPaperOfTheDay } from './recommendationEngine';
import { generatePaperDigest } from './digestGenerator';
import { sendTelegramResearchDigest, getTelegramConfig } from './telegramDispatcher';
import { PaperDigest, UserTrialProfile, TelegramDispatchRecord } from '../types/research';
import { processTechIntelligenceFeed } from './verificationEngine';
import { buildIntelligencePdfDoc } from '../utils/generatePdfReport';

// In-memory cache for today's research digest to avoid excessive external calls
let cachedDailyDigestBn: PaperDigest | null = null;
let cachedDailyDigestEn: PaperDigest | null = null;
let lastDigestTime = 0;
const DIGEST_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Returns today's #1 breakthrough arXiv paper and Gemini 3-bullet digest
 */
export async function getTodayResearchDigest(forceRefresh = false, targetUser?: UserTrialProfile): Promise<{
  digest: PaperDigest;
  user: UserTrialProfile;
  candidatePapersCount: number;
}> {
  const users = getAllRegisteredUsers();
  const defaultUser = targetUser || users[0] || getUserProfile();
  const now = Date.now();

  if (cachedDailyDigestBn && !forceRefresh && now - lastDigestTime < DIGEST_CACHE_TTL) {
    return {
      digest: defaultUser.preferred_language === 'en' && cachedDailyDigestEn ? cachedDailyDigestEn : cachedDailyDigestBn,
      user: defaultUser,
      candidatePapersCount: 10,
    };
  }

  // 1. Fetch genuine newly submitted arXiv papers
  const papers = await fetchLatestArxivPapers(10);

  // 2. Run 4D Time-Aware Recommendation Model
  const { selectedPaper, scores } = selectBestPaperOfTheDay(papers, defaultUser);

  // 3. Generate Gemini 3.8 Flash 3-bullet digests for both Bengali and English
  const [digestBn, digestEn] = await Promise.all([
    generatePaperDigest(selectedPaper, scores, 'bn'),
    generatePaperDigest(selectedPaper, scores, 'en'),
  ]);

  cachedDailyDigestBn = digestBn;
  cachedDailyDigestEn = digestEn;
  lastDigestTime = now;

  return {
    digest: defaultUser.preferred_language === 'en' ? digestEn : digestBn,
    user: defaultUser,
    candidatePapersCount: papers.length,
  };
}

/**
 * Executes the complete 9:30 AM IST Daily Dispatch cycle across ALL registered Telegram users dynamically.
 * Architecture:
 * 1. Generates ONE unified newspaper dossier & PDF for the day.
 * 2. Retrieves all registered Telegram users from persistent storage.
 * 3. Broadcasts the newspaper (Text + PDF) to each saved chat_id individually.
 * 4. Isolates failures: if one user blocked the bot or fails, records the failure and CONTINUES to the remaining users.
 * 5. Logs strict requirements:
 *      Sending newspaper to <chat_id>
 *      Delivery successful: <chat_id>
 *      Delivery failed: <chat_id>
 */
export async function executeTelegramDailyCycle(isManualTrigger = false): Promise<{
  success: boolean;
  message: string;
  totalRecipients: number;
  dispatchedCount: number;
  failedCount: number;
  results: Array<{ chat_id: string; success: boolean; stageLabel?: string; error?: string }>;
  error?: string;
}> {
  try {
    const config = getTelegramConfig();

    if (!config.enabled && !isManualTrigger) {
      return {
        success: false,
        message: 'Telegram automated dispatch is currently paused in settings.',
        totalRecipients: 0,
        dispatchedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    // 1. Retrieve all registered users dynamically
    let users = getAllRegisteredUsers();

    // If no users are registered yet, check if TELEGRAM_CHAT_ID exists as initial fallback
    if (users.length === 0 && process.env.TELEGRAM_CHAT_ID) {
      registerOrGetUser(process.env.TELEGRAM_CHAT_ID, { username: 'DefaultAdmin' });
      users = getAllRegisteredUsers();
    }

    if (users.length === 0) {
      console.log('[ResearchEngineService] No registered Telegram users found for dispatch.');
      return {
        success: false,
        message: 'No registered Telegram users found. Press /start in the Telegram bot to register.',
        totalRecipients: 0,
        dispatchedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    console.log(`[ResearchEngineService] Starting 9:30 AM IST newspaper generation for ${users.length} registered user(s)...`);

    // 2. Generate ONE unified newspaper content and A4 PDF for today
    const { digest: sampleDigest } = await getTodayResearchDigest(isManualTrigger);

    console.log('[ResearchEngineService] Collecting latest 24h tech news wire for unified newspaper...');
    const techFeed = await processTechIntelligenceFeed({ forceRefresh: false });

    console.log('[DIAGNOSTIC] [ResearchEngineService] Compiling official A4 PDF dossier (generated once for all users)...');
    const pdfDoc = buildIntelligencePdfDoc({
      events: techFeed.events,
      stats: techFeed.stats,
      reportTitle: '24-Hour Tech World Intelligence Dossier',
      scopeLabel: 'Automated 24-Hour Verified Wire (9:30 AM IST Daily Briefing)',
    });
    const pdfArrayBuffer = pdfDoc.output('arraybuffer');
    const pdfBuffer = Buffer.from(pdfArrayBuffer);
    const dateSlug = new Date().toISOString().slice(0, 10);
    const pdfFilename = `Tech_World_Intelligence_Dossier_${dateSlug}.pdf`;
    console.log(`[DIAGNOSTIC] [ResearchEngineService] PDF generation complete: filename=${pdfFilename}, bufferSize=${pdfBuffer.length} bytes`);

    // Ensure we have both language digests ready
    const digestBn = cachedDailyDigestBn || sampleDigest;
    const digestEn = cachedDailyDigestEn || sampleDigest;

    // 3. Broadcast to all registered users sequentially with isolated error handling
    let dispatchedCount = 0;
    let failedCount = 0;
    const results: Array<{ chat_id: string; success: boolean; stageLabel?: string; error?: string }> = [];

    for (const user of users) {
      const chatId = user.user_id;
      console.log(`Sending newspaper to ${chatId}`);
      console.log(`[DIAGNOSTIC] [ResearchEngineService] Telegram broadcast: dispatching newspaper to chat_id=${chatId}...`);

      try {
        const userDigest = user.preferred_language === 'en' ? digestEn : digestBn;

        const record = await sendTelegramResearchDigest(userDigest, user, {
          techEvents: techFeed.events,
          pdfBuffer,
          pdfFilename,
        });

        if (record.success) {
          console.log(`Delivery successful: ${chatId}`);
          console.log(
            `[DIAGNOSTIC] [ResearchEngineService] Telegram delivery response for chat_id=${chatId}: success=true, textMessageId=${record.telegramMessageId}, pdfDocMessageId=${record.pdfDocumentMessageId || 'N/A'}`
          );
          advanceUserTrialDay(chatId);
          markUserDeliveryResult(chatId, true);
          dispatchedCount++;
          results.push({
            chat_id: chatId,
            success: true,
            stageLabel: record.stageLabel,
          });
        } else {
          console.log(`Delivery failed: ${chatId}`);
          console.warn(
            `[DIAGNOSTIC] [ResearchEngineService] Telegram delivery response for chat_id=${chatId}: success=false, error=${record.error || 'rejected'}`
          );
          markUserDeliveryResult(chatId, false, record.error);
          failedCount++;
          results.push({
            chat_id: chatId,
            success: false,
            stageLabel: record.stageLabel,
            error: record.error || 'Delivery rejected by Telegram gateway',
          });
        }
      } catch (userErr: any) {
        // Critical: One failed user must NEVER stop the delivery process for remaining users!
        console.log(`Delivery failed: ${chatId}`);
        console.error(`[DIAGNOSTIC] [ResearchEngineService] Exception delivering to chat_id=${chatId}:`, userErr?.message || userErr);
        markUserDeliveryResult(chatId, false, userErr?.message);
        failedCount++;
        results.push({
          chat_id: chatId,
          success: false,
          error: userErr?.message || 'Unexpected communication failure',
        });
      }
    }

    const summaryMsg = `Newspaper broadcast completed: ${dispatchedCount} succeeded, ${failedCount} failed out of ${users.length} registered user(s).`;
    console.log(`[ResearchEngineService] ${summaryMsg}`);

    return {
      success: dispatchedCount > 0 || users.length === 0,
      message: summaryMsg,
      totalRecipients: users.length,
      dispatchedCount,
      failedCount,
      results,
    };
  } catch (err: any) {
    console.error('[ResearchEngineService] Daily cycle error:', err);
    return {
      success: false,
      message: err?.message || 'Server error executing Telegram newspaper cycle.',
      totalRecipients: 0,
      dispatchedCount: 0,
      failedCount: 0,
      results: [],
      error: err?.message,
    };
  }
}
