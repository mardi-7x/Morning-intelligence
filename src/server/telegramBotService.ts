import {
  registerOrGetUser,
  updateUserProfile,
  recordUserFeedback,
  getUserProfile,
  loadTelegramOffset,
  saveTelegramOffset,
  markUserDeliveryResult,
} from './trialTracker';
import { getTelegramConfig, sendTelegramResearchDigest } from './telegramDispatcher';
import { getTodayResearchDigest } from './researchEngineService';
import { processTechIntelligenceFeed } from './verificationEngine';
import { buildIntelligencePdfDoc } from '../utils/generatePdfReport';
import { UserTrialProfile } from '../types/research';

let isPollingActive = false;
let lastUpdateOffset = loadTelegramOffset();
const processedUpdateIds = new Set<number>();

/**
 * Sends an interactive Telegram text message with optional inline keyboard.
 */
async function sendTelegramText(
  token: string,
  chatId: string,
  text: string,
  replyMarkup?: any
): Promise<boolean> {
  try {
    console.log(`[DIAGNOSTIC] Sending response message to chat_id=${chatId}...`);
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = await res.json();
    if (!data.ok && data.description?.includes("can't parse entities")) {
      console.warn(`[DIAGNOSTIC] HTML entity parsing error for chat_id=${chatId}. Falling back to plain text.`);
      payload.text = text.replace(/<[^>]*>/g, '');
      delete payload.parse_mode;
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    }

    console.log(
      `[DIAGNOSTIC] Telegram delivery response for chat_id=${chatId}: ok=${data.ok}, message_id=${data.result?.message_id || 'N/A'}${!data.ok ? `, error=${data.description} (code ${data.error_code})` : ''}`
    );
    return Boolean(data.ok);
  } catch (err: any) {
    console.error(`[DIAGNOSTIC] Network/transport error sending text to chat_id=${chatId}:`, err?.message || err);
    return false;
  }
}

/**
 * Acknowledges a Telegram callback query with toast text.
 */
async function acknowledgeCallbackQuery(
  token: string,
  callbackQueryId: string,
  text: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    });
  } catch (e: any) {
    console.warn('[DIAGNOSTIC] Notice acknowledging callback query:', e?.message || e);
  }
}

/**
 * Builds the interactive language-selection inline keyboard.
 */
function buildLanguageSelectionKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🇮🇳 বাংলা (ভারত)', callback_data: 'set_lang_bn' },
        { text: '🇺🇸 English', callback_data: 'set_lang_en' },
      ],
      [
        { text: '📖 আজকের খবর পড়ুন / Read Today (/read)', callback_data: 'cmd_read' },
      ],
    ],
  };
}

/**
 * Executes the on-demand /read newspaper briefing workflow for a specific user.
 */
async function handleReadCommand(
  token: string,
  chatId: string,
  user: UserTrialProfile
): Promise<void> {
  const isBn = user.preferred_language === 'bn';
  await sendTelegramText(
    token,
    chatId,
    isBn
      ? '⏳ <i>আজকের গবেষণা ও সংবাদ সংগ্রহ করে সংবাদপত্র PDF তৈরি করা হচ্ছে...</i>'
      : "⏳ <i>Compiling today's research paper and newspaper dossier...</i>"
  );

  try {
    console.log(`[DIAGNOSTIC] Executing /read workflow for chat_id=${chatId} (lang=${user.preferred_language})`);
    const { digest } = await getTodayResearchDigest(false, user);
    const techFeed = await processTechIntelligenceFeed({ forceRefresh: false });

    const pdfDoc = buildIntelligencePdfDoc({
      events: techFeed.events,
      stats: techFeed.stats,
      reportTitle: '24-Hour Tech World Intelligence Dossier',
      scopeLabel: 'Automated 24-Hour Verified Wire (09:30 AM IST Edition)',
    });
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    const dateSlug = new Date().toISOString().slice(0, 10);
    const pdfFilename = `Tech_World_Intelligence_Dossier_${dateSlug}.pdf`;

    console.log(`Sending newspaper to ${chatId}`);
    const record = await sendTelegramResearchDigest(digest, user, {
      techEvents: techFeed.events,
      pdfBuffer,
      pdfFilename,
    });

    if (record.success) {
      console.log(`Delivery successful: ${chatId}`);
      markUserDeliveryResult(chatId, true);
    } else {
      console.log(`Delivery failed: ${chatId} (${record.error || 'Unknown error'})`);
      markUserDeliveryResult(chatId, false, record.error);
      if (record.error && !record.error.includes('paywall')) {
        await sendTelegramText(
          token,
          chatId,
          isBn
            ? `⚠️ দুঃখিত, ডাইজেস্ট প্রেরণে সমস্যা হয়েছে: <i>${record.error}</i>`
            : `⚠️ Sorry, issue sending digest: <i>${record.error}</i>`
        );
      }
    }
  } catch (err: any) {
    console.error(`[DIAGNOSTIC] Delivery failed for chat_id=${chatId}:`, err?.message || err);
    markUserDeliveryResult(chatId, false, err?.message);
    await sendTelegramText(
      token,
      chatId,
      isBn
        ? `⚠️ দুঃখিত, সংবাদপত্র সংকলনে সমস্যা হয়েছে: <i>${err?.message || 'API ত্রুটি'}</i>`
        : `⚠️ Error preparing digest: <i>${err?.message || 'API error'}</i>`
    );
  }
}

/**
 * Processes a single Telegram update dynamically.
 * Used identically by both HTTP Webhook and Long-Polling workers.
 */
export async function processTelegramUpdate(update: any): Promise<void> {
  if (!update || typeof update !== 'object') return;

  const updateId = update.update_id;
  console.log(
    `[DIAGNOSTIC] Telegram update received: update_id=${updateId || 'N/A'}, type=${
      update.message ? 'message' : update.callback_query ? 'callback_query' : 'other'
    }`
  );

  if (updateId) {
    if (processedUpdateIds.has(updateId)) {
      console.log(`[DIAGNOSTIC] Skipping duplicate update_id=${updateId}`);
      return;
    }
    processedUpdateIds.add(updateId);
    if (processedUpdateIds.size > 2000) {
      const oldest = Array.from(processedUpdateIds).slice(0, 500);
      oldest.forEach((id) => processedUpdateIds.delete(id));
    }
  }

  const config = getTelegramConfig();
  const token = config.botToken;
  if (!token) {
    console.warn('[DIAGNOSTIC] Cannot process Telegram update: botToken is not configured.');
    return;
  }

  // 1. Handle Inline Button Callback Queries (Language Selection & Feedback)
  if (update.callback_query) {
    const cq = update.callback_query;
    const cbId = cq.id;
    const data = cq.data || '';
    const fromId = String(cq.from?.id || cq.message?.chat?.id || '').trim();

    if (!fromId) return;

    console.log(`[DIAGNOSTIC] Dynamic chat_id extracted from callback_query: ${fromId} (data="${data}")`);

    // Ensure user profile exists or is registered
    const { user } = registerOrGetUser(fromId, {
      username: cq.from?.username,
      firstName: cq.from?.first_name,
    });

    // Language Selection: Bengali
    if (data === 'set_lang_bn' || data === 'lang_bn') {
      const updated = updateUserProfile(fromId, { preferred_language: 'bn' });
      await acknowledgeCallbackQuery(token, cbId, 'ভাষা বাংলায় সংরক্ষিত হয়েছে');
      const confMsg =
        `✅ আপনার ভাষা সফলভাবে <b>বাংলায়</b> সেট করা হয়েছে।\n\n` +
        `প্রতিদিন সকাল <b>০৯:৩০ IST</b>-এ আপনি বাংলায় সংবাদপত্র ও গবেষণা ডাইজেস্ট পাবেন।\n\n` +
        `আজকের সংস্করণ এখনই সরাসরি পড়তে নিচের বাটনে চাপ দিন বা <b>/read</b> লিখুন:`;
      const readMarkup = {
        inline_keyboard: [
          [{ text: '📖 আজকের সংস্করণ পড়ুন (/read)', callback_data: 'cmd_read' }],
        ],
      };
      await sendTelegramText(token, fromId, confMsg, readMarkup);
      return;
    }

    // Language Selection: English
    if (data === 'set_lang_en' || data === 'lang_en') {
      const updated = updateUserProfile(fromId, { preferred_language: 'en' });
      await acknowledgeCallbackQuery(token, cbId, 'Language set to English');
      const confMsg =
        `✅ Language successfully set to <b>English</b>.\n\n` +
        `Every morning at <b>09:30 AM IST</b> you will receive your verified newspaper briefing in English.\n\n` +
        `To read today's edition right now, tap below or type <b>/read</b>:`;
      const readMarkup = {
        inline_keyboard: [
          [{ text: "📖 Read Today's Briefing (/read)", callback_data: 'cmd_read' }],
        ],
      };
      await sendTelegramText(token, fromId, confMsg, readMarkup);
      return;
    }

    // Read On-Demand Callback
    if (data === 'cmd_read') {
      await acknowledgeCallbackQuery(token, cbId, 'সংবাদপত্র তৈরি করা হচ্ছে...');
      const currentUser = getUserProfile(fromId);
      await handleReadCommand(token, fromId, currentUser);
      return;
    }

    // Paper Feedback Rating
    if (data.startsWith('rate_')) {
      const parts = data.split('_');
      const paperId = parts[1] || 'paper';
      const rating =
        parts[2] === 'NOT' || data.includes('NOT_HELPFUL') || data.includes('skip')
          ? 'NOT_HELPFUL'
          : 'HELPFUL';
      recordUserFeedback(fromId, paperId, 'Research Paper', rating, []);

      const ackText = data.includes('skip')
        ? 'মতামত সংরক্ষিত: স্কিপ করা হয়েছে।'
        : 'মতামত সংরক্ষিত: আপনার ভেক্টর প্রোফাইল আপডেট হয়েছে!';
      await acknowledgeCallbackQuery(token, cbId, ackText);
      return;
    }

    await acknowledgeCallbackQuery(token, cbId, 'OK');
    return;
  }

  // 2. Handle Text Messages & Bot Commands
  const message = update.message;
  if (!message || !message.chat) {
    console.log('[DIAGNOSTIC] Update contains no message or chat payload. Skipping.');
    return;
  }

  const chatId = String(message.chat.id).trim();
  const text = (message.text || '').trim();
  const fromMeta = {
    username: message.from?.username,
    firstName: message.from?.first_name,
    languageCode: message.from?.language_code,
  };

  console.log(`[DIAGNOSTIC] Dynamic chat_id extracted: ${chatId} (text: "${text.slice(0, 30)}")`);

  // Dynamically register or fetch user profile without duplicate records
  const { user, isNew } = registerOrGetUser(chatId, fromMeta);
  console.log(
    `[DIAGNOSTIC] User registration status: user_id=${user.user_id}, trial_day=${user.trial_day_count}, status=${user.status}, isNew=${isNew}`
  );

  // Handle Command /start
  if (text.startsWith('/start') || isNew) {
    console.log(`[DIAGNOSTIC] /start command handler triggered for chat_id=${chatId} (isNew=${isNew})`);
    const isBn = user.preferred_language === 'bn';
    const welcomeMsg = isBn
      ? `👋 <b>স্বাগতম SynapseDigest AI-তে!</b>\n\n` +
        `আপনি সফলভাবে দৈনিক সকাল <b>০৯:৩০ IST</b> সংবাদপত্রের জন্য নিবন্ধিত হয়েছেন।\n\n` +
        `📊 <b>আপনার ৭-দিনের ফ্রি ট্রায়াল সক্রিয় হয়েছে (দিন ${user.trial_day_count}/৭)।</b>\n\n` +
        `প্রতিদিন সকাল ৯:৩০-এ আপনি স্বয়ংক্রিয়ভাবে পাবেন:\n` +
        `• যাচাইকৃত শীর্ষ টেক নিউজ ও ফ্যাক্ট-চেকড সারসংক্ষেপ\n` +
        `• আজকের #১ ব্রেকথ্রু গবেষণা পেপারের ৩-পয়েন্ট বিশ্লেষণ\n` +
        `• ডাউনলোডযোগ্য অফিশিয়াল A4 PDF ব্রডশিট ফাইল\n\n` +
        `🌐 <b>আপনার পছন্দসই ভাষা নির্বাচন করুন (Select Language):</b>`
      : `👋 <b>Welcome to SynapseDigest AI!</b>\n\n` +
        `You have successfully registered for the automated <b>09:30 AM IST</b> Daily Research Newspaper.\n\n` +
        `📊 <b>Your 7-Day Free Trial is Active (Day ${user.trial_day_count}/7).</b>\n\n` +
        `Every morning at 09:30 AM IST you will receive:\n` +
        `• Verified tech world intelligence news wire\n` +
        `• Today's #1 breakthrough arXiv paper 3-point briefing\n` +
        `• Executive downloadable A4 broadsheet PDF\n\n` +
        `🌐 <b>Select Your Preferred Language:</b>`;

    const langKeyboard = buildLanguageSelectionKeyboard();
    await sendTelegramText(token, chatId, welcomeMsg, langKeyboard);
    return;
  }

  // Handle Command /lang
  if (text.startsWith('/lang')) {
    const parts = text.split(/\s+/);
    const newLang = parts[1]?.toLowerCase();
    if (newLang === 'bn' || newLang === 'en') {
      updateUserProfile(chatId, { preferred_language: newLang });
      const ack =
        newLang === 'bn'
          ? '✅ আপনার ভাষা সফলভাবে <b>বাংলায়</b> সেট করা হয়েছে।\n\nআজকের সংস্করণ সরাসরি পড়তে <b>/read</b> লিখুন।'
          : '✅ Language successfully set to <b>English</b>.\n\nType <b>/read</b> to receive today\'s briefing right now.';
      const readMarkup = {
        inline_keyboard: [
          [{ text: newLang === 'bn' ? '📖 আজকের খবর পড়ুন (/read)' : "📖 Read Today's Edition (/read)", callback_data: 'cmd_read' }],
        ],
      };
      await sendTelegramText(token, chatId, ack, readMarkup);
    } else {
      const prompt =
        '🌐 <b>পছন্দসই ভাষা বেছে নিন / Select Language:</b>\n\n' +
        'নিচের বাটনে চাপ দিন অথবা <code>/lang bn</code> কিংবা <code>/lang en</code> লিখুন।';
      await sendTelegramText(token, chatId, prompt, buildLanguageSelectionKeyboard());
    }
    return;
  }

  // Handle Command /status
  if (text.startsWith('/status')) {
    const currentUser = getUserProfile(chatId);
    const isBn = currentUser.preferred_language === 'bn';
    const statusMsg = isBn
      ? `📊 <b>SynapseDigest AI অ্যাকাউন্ট স্ট্যাটাস</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• চ্যাট আইডি: <code>${chatId}</code>\n` +
        `• বর্তমান দিন: <b>দিন ${currentUser.trial_day_count}/৭</b>\n` +
        `• সদস্যপদ স্ট্যাটাস: <b>${currentUser.status.toUpperCase()}</b>\n` +
        `• নির্বাচিত ভাষা: <b>${currentUser.preferred_language === 'bn' ? 'বাংলা' : 'English'}</b>\n` +
        `• মোট প্রাপ্ত সংস্করণ: <b>${currentUser.total_digests_received || 0} টি</b>\n` +
        `• ডেলিভারি শিডিউল: <b>প্রতিদিন সকাল ০৯:৩০ IST</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`
      : `📊 <b>SynapseDigest AI Account Status</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Chat ID: <code>${chatId}</code>\n` +
        `• Current Day: <b>Day ${currentUser.trial_day_count}/7</b>\n` +
        `• Status: <b>${currentUser.status.toUpperCase()}</b>\n` +
        `• Language: <b>${currentUser.preferred_language.toUpperCase()}</b>\n` +
        `• Digests Received: <b>${currentUser.total_digests_received || 0}</b>\n` +
        `• Schedule: <b>Every day at 09:30 AM IST</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    await sendTelegramText(token, chatId, statusMsg);
    return;
  }

  // Handle Command /read: On-demand dispatch to this specific user
  if (text.startsWith('/read')) {
    await handleReadCommand(token, chatId, user);
    return;
  }

  // Resilient fallback for any unrecognized text/greeting (e.g. "hi", "help", "info")
  const isBn = user.preferred_language === 'bn';
  const helpMsg = isBn
    ? `🤖 <b>SynapseDigest AI বট কমান্ডসমূহ:</b>\n\n` +
      `• <b>/read</b> — আজকের ব্রেকথ্রু গবেষণা ও সংবাদপত্র সংস্করণ এখনই সরাসরি পড়ুন\n` +
      `• <b>/lang</b> — ভাষা পরিবর্তন করুন (বাংলা / English)\n` +
      `• <b>/status</b> — আপনার ৭-দিনের ট্রায়াল ও অ্যাকাউন্ট স্ট্যাটাস দেখুন\n` +
      `• <b>/start</b> — পরিচিতি ও ভাষা নির্বাচন স্ক্রিন পুনরায় দেখুন\n\n` +
      `<i>প্রতিদিন সকাল ০৯:৩০ IST-এ আপনার কাছে স্বয়ংক্রিয়ভাবে দৈনিক সংস্করণ পৌঁছে যাবে।</i>`
    : `🤖 <b>SynapseDigest AI Bot Commands:</b>\n\n` +
      `• <b>/read</b> — Read today's breakthrough research & newspaper edition immediately\n` +
      `• <b>/lang</b> — Change language preference (English / Bengali)\n` +
      `• <b>/status</b> — View 7-day trial and subscription status\n` +
      `• <b>/start</b> — Restart introduction and language selection\n\n` +
      `<i>Automated daily editions are delivered every morning at 09:30 AM IST.</i>`;

  const helpMarkup = {
    inline_keyboard: [
      [{ text: isBn ? '📖 আজকের সংস্করণ পড়ুন (/read)' : "📖 Read Today's Briefing (/read)", callback_data: 'cmd_read' }],
      [
        { text: '🇮🇳 বাংলা', callback_data: 'set_lang_bn' },
        { text: '🇺🇸 English', callback_data: 'set_lang_en' },
      ],
    ],
  };
  await sendTelegramText(token, chatId, helpMsg, helpMarkup);
}

/**
 * Returns true if Telegram long-polling worker is currently active.
 */
export function isTelegramPollingActive(): boolean {
  return isPollingActive;
}

/**
 * Starts continuous, resilient background long-polling for incoming updates.
 * Automatically backs off if a webhook is configured on the bot.
 */
export async function startTelegramPollingWorker(): Promise<void> {
  if (isPollingActive) return;
  isPollingActive = true;

  console.log('[DIAGNOSTIC] [TelegramBotService] Initializing Telegram dynamic update listener (Long-Polling Worker)...');

  let lastWebhookCheck = 0;
  let isWebhookMode = false;

  // Async loop in background
  (async () => {
    while (isPollingActive) {
      try {
        const config = getTelegramConfig();
        const token = config.botToken;

        if (!token || !config.enabled) {
          console.log('[DIAGNOSTIC] Telegram polling worker paused: token missing or enabled=false');
          await new Promise((r) => setTimeout(r, 8000));
          continue;
        }

        const now = Date.now();

        // Check webhook status every 60 seconds (prevents Telegram rate limiting)
        if (now - lastWebhookCheck > 60000) {
          lastWebhookCheck = now;
          try {
            const hookCheck = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
            const hookData = await hookCheck.json();
            if (hookData.ok && hookData.result?.url) {
              isWebhookMode = true;
              console.log(
                `[DIAGNOSTIC] Active webhook detected on Telegram ("${hookData.result.url}"). Long polling yielding to webhook mode.`
              );
            } else {
              isWebhookMode = false;
            }
          } catch (hErr) {
            // Ignore transient check error
          }
        }

        if (isWebhookMode) {
          // In webhook mode, sleep and yield to inbound HTTP webhook
          await new Promise((r) => setTimeout(r, 30000));
          continue;
        }

        try {
          // Long-poll updates with 15s timeout
          const pollUrl = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateOffset}&timeout=15&limit=25`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);

          const pollRes = await fetch(pollUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (pollRes.status === 409) {
            console.warn('[DIAGNOSTIC] Telegram HTTP 409 Conflict: Another polling connection or webhook is active. Inspecting webhook state...');
            try {
              const hookCheck = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
              const hookData = await hookCheck.json();
              if (hookData.ok && hookData.result?.url) {
                isWebhookMode = true;
                console.log(`[DIAGNOSTIC] Webhook confirmed on Telegram ("${hookData.result.url}"). Yielding to webhook mode.`);
                await new Promise((r) => setTimeout(r, 20000));
                continue;
              }
            } catch (e) {}
            // Transient polling overlap (e.g., rapid server restart); back off briefly and retry polling
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }

          if (!pollRes.ok) {
            console.warn(`[DIAGNOSTIC] Telegram getUpdates HTTP error: status ${pollRes.status} ${pollRes.statusText}`);
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }

          const data = await pollRes.json();
          if (data.ok && Array.isArray(data.result)) {
            if (data.result.length > 0) {
              console.log(`[DIAGNOSTIC] Telegram getUpdates received ${data.result.length} update(s)`);
            }
            for (const update of data.result) {
              lastUpdateOffset = Math.max(lastUpdateOffset, update.update_id + 1);
              saveTelegramOffset(lastUpdateOffset);
              // Process update non-blocking so heavy operations (e.g. /read) do not block other updates (/start, /lang)
              processTelegramUpdate(update).catch((procErr: any) => {
                console.error('[DIAGNOSTIC] Error handling update:', procErr?.message || procErr);
              });
            }
          } else if (!data.ok) {
            console.warn(`[DIAGNOSTIC] Telegram getUpdates API error: ${data.description} (code ${data.error_code})`);
            if (data.error_code === 409) {
              await new Promise((r) => setTimeout(r, 5000));
              continue;
            }
          }
        } catch (pollErr: any) {
          if (pollErr?.name !== 'AbortError') {
            console.log(`[DIAGNOSTIC] Telegram polling cycle notice: ${pollErr?.message || 'timeout/connection reset'}`);
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (outerLoopErr: any) {
        console.error('[DIAGNOSTIC] Unexpected outer error in Telegram polling worker:', outerLoopErr?.message || outerLoopErr);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}

/**
 * Stops the long-polling worker
 */
export function stopTelegramPollingWorker(): void {
  isPollingActive = false;
}
