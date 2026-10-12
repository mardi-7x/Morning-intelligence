import fs from 'fs';
import path from 'path';
import { PaperDigest, UserTrialProfile, TelegramDispatchRecord, TelegramConfig } from '../types/research';
import { TechIntelligenceEvent } from '../types/intelligence';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TELEGRAM_CONFIG_FILE = path.join(DATA_DIR, 'telegram-config.json');
const TELEGRAM_HISTORY_FILE = path.join(DATA_DIR, 'telegram-dispatch-history.json');

// User provided credentials strictly maintained server-side
const DEFAULT_TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || '8730992490:AAFaqHgEUQhTHPgL9gewlG5u1cWyyPk4VR8';

export function getTelegramConfig(): TelegramConfig {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const raw = fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[TelegramDispatcher] Error reading telegram config:', err);
  }

  const initialConfig: TelegramConfig = {
    botToken: DEFAULT_TELEGRAM_TOKEN,
    chatId: '',
    enabled: true,
    botUsername: 'SubhadipMorningBot',
    botFirstName: 'Morning Intelligence',
    paymentLinkUrl: 'https://buy.stripe.com/demo_research_intelligence_pass',
  };

  saveTelegramConfig(initialConfig);
  return initialConfig;
}

export function saveTelegramConfig(config: TelegramConfig): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TelegramDispatcher] Error saving telegram config:', err);
  }
}

export function getTelegramDispatchHistory(): TelegramDispatchRecord[] {
  try {
    if (fs.existsSync(TELEGRAM_HISTORY_FILE)) {
      const raw = fs.readFileSync(TELEGRAM_HISTORY_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[TelegramDispatcher] Error reading history:', err);
  }
  return [];
}

export function saveTelegramDispatchRecord(record: TelegramDispatchRecord): void {
  try {
    const list = getTelegramDispatchHistory();
    list.unshift(record);
    const trimmed = list.slice(0, 50);
    fs.writeFileSync(TELEGRAM_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TelegramDispatcher] Error saving history record:', err);
  }
}

/**
 * Builds the psychological message text according to user's 7-day trial cycle.
 */
export function formatTelegramDigestMessage(
  digest: PaperDigest,
  user: UserTrialProfile,
  techEvents?: TechIntelligenceEvent[]
): {
  text: string;
  inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  stageLabel: string;
} {
  const isBengali = user.preferred_language === 'bn';
  const paper = digest.paper;
  const day = user.trial_day_count;
  const scores = digest.scores;

  let headerBadge = '';
  let footerPsychologicalNote = '';
  let stageLabel = `Day ${day} Free Trial`;

  // -------------------------------------------------------------------------
  // Psychological Stage Messaging
  // -------------------------------------------------------------------------
  if (user.status === 'paid_subscriber') {
    stageLabel = 'Paid Subscriber';
    headerBadge = isBengali
      ? '🌟 <b>[প্রিমিয়াম ডেইলি রিসার্চ ডাইজেস্ট]</b>'
      : '🌟 <b>[PREMIUM DAILY RESEARCH DIGEST]</b>';
  } else if (day <= 5) {
    stageLabel = `Day ${day} of 7 Free Trial`;
    headerBadge = isBengali
      ? `🔬 <b>[সকালের এআই গবেষণা ডাইজেস্ট • দিন ${day}/৭]</b>`
      : `🔬 <b>[Morning AI Research Digest • Day ${day}/7]</b>`;
    footerPsychologicalNote = isBengali
      ? `\n💡 <i>আজকের ৪D অ্যালগরিদমিক স্কোর: <b>${scores.composite4DScore}/১০০</b> (${scores.matchedThemes.slice(0, 2).join(', ')})</i>`
      : `\n💡 <i>Today's 4D Algorithmic Score: <b>${scores.composite4DScore}/100</b></i>`;
  } else if (day === 6) {
    // Day 6: Pre-loss warning
    stageLabel = 'Day 6: Pre-Loss Warning';
    headerBadge = isBengali
      ? '⚠️ <b>[জরুরি নোটিশ: ট্রায়াল শেষ হওয়ার পূর্বপ্রস্তুতি • দিন ৬/৭]</b>'
      : '⚠️ <b>[URGENT: Trial Ending Tomorrow • Day 6/7]</b>';
    footerPsychologicalNote = isBengali
      ? `\n\n🚨 <b>মনোযোগ দিন:</b> আপনার ফ্রি ট্রায়ালের আর মাত্র <b>২৪ ঘণ্টা</b> বাকি। আপনার কাস্টম এআই ভেক্টর প্রোফাইল কাল ফ্রিজ হয়ে যাবে।`
      : `\n\n🚨 <b>Pre-loss Notice:</b> Only 24 hours remain on your free trial. Your custom AI interest vector profile will freeze tomorrow.`;
  } else if (day === 7) {
    // Day 7: The Cut-Off
    stageLabel = 'Day 7: The Cut-Off';
    headerBadge = isBengali
      ? '🔒 <b>[৭ দিনের ট্রায়াল সমাপ্তি • ফাইনাল ফ্রি ডাইজেস্ট]</b>'
      : '🔒 <b>[7-Day Trial Complete • Final Free Digest]</b>';
    footerPsychologicalNote = isBengali
      ? `\n\n⛔ <b>৭ দিনের ট্রায়াল সমাপ্ত:</b> প্রতিদিন সকালের এই রিসার্চ সামারি এবং আপনার সেভ করা ভেক্টর প্রোফাইল চালু রাখতে সাবস্ক্রিপশন নিশ্চিত করুন।`
      : `\n\n⛔ <b>Trial Complete:</b> To continue receiving daily morning research digests and unlock your active vector profile, please confirm your subscription.`;
  } else {
    // Day 8+: Expired Paywall
    stageLabel = 'Trial Expired (Paywall)';
    return {
      text: isBengali
        ? `🔒 <b>আপনার ৭ দিনের ফ্রি ট্রায়াল সমাপ্ত হয়েছে।</b>\n\nGoogle Cloud সার্ভারলেস 4D রেকমেন্ডেশন ইঞ্জিন চালু রাখতে এবং প্রতিদিন সকাল ৯:৩০-এ আন্তর্জাতিক arXiv পেপারের সারাংশ পেতে আপনার সাবস্ক্রিপশন সক্রিয় করুন।`
        : `🔒 <b>Your 7-Day Free Trial has expired.</b>\n\nTo continue receiving daily 9:30 AM IST research digests, please activate your subscription.`,
      inlineKeyboard: [
        [
          {
            text: isBengali ? '💳 সাবস্ক্রিপশন নিশ্চিত করুন' : '💳 Activate Subscription',
            url: getTelegramConfig().paymentLinkUrl || 'https://buy.stripe.com/demo_research_intelligence_pass',
          },
        ],
      ],
      stageLabel,
    };
  }

  // Construct message body
  let techNewsSection = '';
  if (techEvents && techEvents.length > 0) {
    const topEvents = techEvents.slice(0, 4);
    const eventsList = topEvents
      .map((ev, i) => {
        const briefing = ev.newsBriefing;
        const sourceName = ev.primarySourcePublisher || 'Verified Wire';
        const sourceUrl = ev.primarySourceUrl || '#';
        const sourceLink = sourceUrl.startsWith('http') ? `<a href="${sourceUrl}">[${sourceName}]</a>` : `[${sourceName}]`;

        if (i === 0 && briefing) {
          // Major story: 80-150 words depth
          return isBengali
            ? `📌 <b>${ev.title}</b> [প্রধান সংবাদ]\n<b>ঘটনা:</b> ${briefing.whatHappened}\n<b>মূল তথ্য:</b> ${briefing.keyFacts}\n<b>তাৎপর্য:</b> ${briefing.whyItMatters}\n🔗 সূত্র: ${sourceLink}`
            : `📌 <b>${ev.title}</b> [Lead Story]\n<b>What Happened:</b> ${briefing.whatHappened}\n<b>Key Facts:</b> ${briefing.keyFacts}\n<b>Why It Matters:</b> ${briefing.whyItMatters}\n🔗 Source: ${sourceLink}`;
        } else if (i < 3 && briefing) {
          // Secondary story: 40-80 words
          return isBengali
            ? `🔹 <b>${ev.title}</b> [দ্বিতীয় গুরুত্বপূর্ণ সংবাদ]\n${briefing.whatHappened} ${briefing.keyFacts} ${briefing.whyItMatters}\n🔗 সূত্র: ${sourceLink}`
            : `🔹 <b>${ev.title}</b> [Secondary Story]\n${briefing.whatHappened} ${briefing.keyFacts} ${briefing.whyItMatters}\n🔗 Source: ${sourceLink}`;
        } else {
          // Minor update: brief one-line format
          return isBengali
            ? `• <b>${ev.title}</b>: ${ev.primaryClaim} — সূত্র: ${sourceLink}`
            : `• <b>${ev.title}</b>: ${ev.primaryClaim} — Source: ${sourceLink}`;
        }
      })
      .join('\n\n');

    techNewsSection = isBengali
      ? `\n\n📰 <b>[শীর্ষ টেকনোলজি নিউজ ব্রিফিং • ২৪ ঘণ্টার যাচাইকৃত সারসংক্ষেপ]</b>\n${eventsList}\n━━━━━━━━━━━━━━━━━━`
      : `\n\n📰 <b>[Top Verified Tech News Briefing • 24-Hour Verified Wire]</b>\n${eventsList}\n━━━━━━━━━━━━━━━━━━`;
  }

  const text = isBengali
    ? `${headerBadge}
🕒 <i>৯:৩০ AM IST ক্লাউড ডেলিভারি (টেক্সট + PDF ফরম্যাট)</i>${techNewsSection}

🔬 <b>[আজকের #১ রিসার্চ পেপার ব্রেকথ্রু]</b>
📄 <b>শিরোনাম:</b> ${paper.title}
👥 <b>গবেষক:</b> ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' প্রমুখ' : ''}
🏷️ <b>ক্যাটাগরি:</b> <code>${paper.primaryCategory}</code> (${paper.categories.slice(0, 3).join(', ')})
━━━━━━━━━━━━━━━━━━
${digest.discoveryBullet}

${digest.methodologyBullet}

${digest.applicationBullet}
━━━━━━━━━━━━━━━━━━${footerPsychologicalNote}

🔗 <a href="${paper.pdfUrl}"><b>[অফিসিয়াল PDF ডাউনলোড]</b></a> • <a href="${paper.absUrl}"><b>[arXiv অ্যাবস্ট্রাক্ট]</b></a>`
    : `${headerBadge}
🕒 <i>9:30 AM IST Cloud Automated Dispatch (Text + PDF Format)</i>${techNewsSection}

🔬 <b>[Today's #1 Research Paper Breakthrough]</b>
📄 <b>Title:</b> ${paper.title}
👥 <b>Authors:</b> ${paper.authors.slice(0, 3).join(', ')}
🏷️ <b>Category:</b> <code>${paper.primaryCategory}</code>
━━━━━━━━━━━━━━━━━━
${digest.discoveryBullet}

${digest.methodologyBullet}

${digest.applicationBullet}
━━━━━━━━━━━━━━━━━━${footerPsychologicalNote}

🔗 <a href="${paper.pdfUrl}"><b>[Download Official PDF]</b></a> • <a href="${paper.absUrl}"><b>[arXiv Abstract]</b></a>`;

  // Inline rating and action buttons
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: isBengali ? '🔥 দরকারী (Helpful)' : '🔥 Helpful',
        callback_data: `rate_${paper.arxivId}_HELPFUL`,
      },
      {
        text: isBengali ? '💤 ভালো লাগেনি (Skip)' : '💤 Skip',
        callback_data: `rate_${paper.arxivId}_NOT_HELPFUL`,
      },
    ],
    [
      {
        text: isBengali ? '📄 অফিসিয়াল PDF পড়ুন' : '📄 Read Full PDF',
        url: paper.pdfUrl,
      },
    ],
  ];

  // If day 6 or 7, append subscription button
  if (day >= 6 && user.status !== 'paid_subscriber') {
    inlineKeyboard.push([
      {
        text: isBengali ? '💳 সাবস্ক্রিপশন নিশ্চিত করুন' : '💳 Activate Subscription',
        url: getTelegramConfig().paymentLinkUrl || 'https://buy.stripe.com/demo_research_intelligence_pass',
      },
    ]);
  }

  return { text, inlineKeyboard, stageLabel };
}

/**
 * Dispatches a PDF document directly to Telegram chat using sendDocument API.
 */
export async function sendTelegramPdfDocument(
  pdfBuffer: Buffer,
  filename: string,
  caption: string,
  targetChatId?: string
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const config = getTelegramConfig();
  const token = config.botToken || DEFAULT_TELEGRAM_TOKEN;
  const chatId = targetChatId || config.chatId;

  if (!chatId) {
    return {
      success: false,
      error: 'Target chatId is missing for PDF document delivery.',
    };
  }

  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption);
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    form.append('document', blob, filename);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });

    const resJson = await response.json();
    console.log(
      `[DIAGNOSTIC] [TelegramDispatcher] PDF sendDocument response for chat_id=${chatId}: ok=${resJson.ok}, doc_message_id=${resJson.result?.message_id || 'N/A'}${!resJson.ok ? `, error=${resJson.description}` : ''}`
    );
    if (!response.ok || !resJson.ok) {
      throw new Error(resJson.description || `Telegram document upload failed: HTTP ${response.status}`);
    }

    return {
      success: true,
      messageId: resJson.result?.message_id,
    };
  } catch (err: any) {
    console.error(`[DIAGNOSTIC] [TelegramDispatcher] Failed to send PDF document to Chat ID ${chatId}:`, err?.message || err);
    return {
      success: false,
      error: err?.message || 'Failed to send PDF document',
    };
  }
}

/**
 * Splits long Telegram messages into chunks within the 4096-character API limit.
 */
function splitTelegramMessage(content: string, maxLength = 3900): string[] {
  if (content.length <= maxLength) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx === -1) {
      splitIdx = maxLength;
    }
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Dispatches the formatted research digest and latest news directly to the user's Telegram chat.
 * Supports BOTH text format and PDF document attachment.
 */
export async function sendTelegramResearchDigest(
  digest: PaperDigest,
  user: UserTrialProfile,
  options?: {
    techEvents?: TechIntelligenceEvent[];
    pdfBuffer?: Buffer;
    pdfFilename?: string;
  }
): Promise<TelegramDispatchRecord> {
  const config = getTelegramConfig();
  const token = config.botToken || DEFAULT_TELEGRAM_TOKEN;
  const targetChatId = String(user.user_id || '').trim();

  if (!targetChatId) {
    throw new Error('user.user_id is missing for Telegram dispatch.');
  }

  const { text, inlineKeyboard, stageLabel } = formatTelegramDigestMessage(
    digest,
    user,
    options?.techEvents
  );

  // If Day 8+ and not paid, send paywall notification with upgrade link
  if (user.trial_day_count >= 8 && user.status !== 'paid_subscriber') {
    try {
      const paywallRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        }),
      });
      const pwJson = await paywallRes.json();
      console.log(`[TelegramDispatcher] Paywall notice sent to chat_id=${targetChatId}: ok=${pwJson.ok}`);
    } catch (e: any) {
      console.warn(`[TelegramDispatcher] Failed to send paywall notice to chat_id=${targetChatId}:`, e?.message || e);
    }

    const expiredRecord: TelegramDispatchRecord = {
      id: `tg-${Date.now()}`,
      dispatchedAt: new Date().toISOString(),
      chatId: targetChatId,
      trialDay: user.trial_day_count,
      status: 'trial_expired',
      paperTitle: digest.paper.title,
      pdfUrl: digest.paper.pdfUrl,
      textFormatDelivered: true,
      pdfDocumentDelivered: false,
      success: true,
      error: 'Trial expired. Sent paywall notification with subscription link.',
      stageLabel: 'Trial Expired (Paywall)',
    };
    saveTelegramDispatchRecord(expiredRecord);
    return expiredRecord;
  }

  try {
    // -------------------------------------------------------------
    // Part 1: Dispatch Text Format Message (Chunked safely to prevent 400 Bad Request)
    // -------------------------------------------------------------
    const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const textChunks = splitTelegramMessage(text, 3900);
    let textMessageId: number | undefined;

    for (let i = 0; i < textChunks.length; i++) {
      const isLast = i === textChunks.length - 1;
      const payload: any = {
        chat_id: targetChatId,
        text: textChunks[i],
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      };
      if (isLast) {
        payload.reply_markup = {
          inline_keyboard: inlineKeyboard,
        };
      }

      let response = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let resJson = await response.json();

      // Resilient fallback if Telegram HTML parser rejects entities
      if (!resJson.ok && resJson.description?.includes("can't parse entities")) {
        console.warn(`[TelegramDispatcher] HTML entity error in chunk ${i + 1}. Retrying as plain text...`);
        payload.text = textChunks[i].replace(/<[^>]*>/g, '');
        delete payload.parse_mode;
        response = await fetch(telegramApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        resJson = await response.json();
      }

      console.log(
        `[DIAGNOSTIC] [TelegramDispatcher] Text message (chunk ${i + 1}/${textChunks.length}) response for chat_id=${targetChatId}: ok=${resJson.ok}, msg_id=${resJson.result?.message_id || 'N/A'}${!resJson.ok ? `, error=${resJson.description}` : ''}`
      );

      if (!response.ok || !resJson.ok) {
        throw new Error(resJson.description || `Telegram API error status ${response.status}`);
      }

      if (isLast) {
        textMessageId = resJson.result?.message_id;
      }
    }

    console.log(`[TelegramDispatcher] Text format sent to Chat ID ${targetChatId} (Msg ID: ${textMessageId})`);

    // -------------------------------------------------------------
    // Part 2: Dispatch PDF Document File (if provided)
    // -------------------------------------------------------------
    let pdfDocMessageId: number | undefined;
    let pdfDelivered = false;

    if (options?.pdfBuffer) {
      const dateSlug = new Date().toISOString().slice(0, 10);
      const filename = options.pdfFilename || `Tech_World_Intelligence_Dossier_${dateSlug}.pdf`;
      const caption = `📄 <b>24-Hour Tech World Intelligence Dossier (PDF Format)</b>\n🕒 <i>9:30 AM IST Daily Automated Delivery • Verified Sources & Clickable Hyperlinks</i>`;

      const docRes = await sendTelegramPdfDocument(options.pdfBuffer, filename, caption, targetChatId);
      if (docRes.success) {
        pdfDocMessageId = docRes.messageId;
        pdfDelivered = true;
        console.log(`[TelegramDispatcher] PDF document sent to Chat ID ${targetChatId} (Doc Msg ID: ${pdfDocMessageId})`);
      } else {
        console.warn(`[TelegramDispatcher] PDF document upload warning: ${docRes.error}`);
      }
    }

    const record: TelegramDispatchRecord = {
      id: `tg-${Date.now()}`,
      dispatchedAt: new Date().toISOString(),
      chatId: targetChatId,
      trialDay: user.trial_day_count,
      status: user.status,
      paperTitle: digest.paper.title,
      pdfUrl: digest.paper.pdfUrl,
      telegramMessageId: textMessageId,
      pdfDocumentMessageId: pdfDocMessageId,
      textFormatDelivered: true,
      pdfDocumentDelivered: pdfDelivered,
      success: true,
      stageLabel,
    };

    saveTelegramDispatchRecord(record);
    return record;
  } catch (error: any) {
    console.error(`[TelegramDispatcher] Failed to send digest to Chat ID ${targetChatId}:`, error);

    const failRecord: TelegramDispatchRecord = {
      id: `tg-${Date.now()}`,
      dispatchedAt: new Date().toISOString(),
      chatId: targetChatId,
      trialDay: user.trial_day_count,
      status: user.status,
      paperTitle: digest.paper.title,
      pdfUrl: digest.paper.pdfUrl,
      textFormatDelivered: false,
      pdfDocumentDelivered: false,
      success: false,
      error: error?.message || 'Unknown network error',
      stageLabel,
    };

    saveTelegramDispatchRecord(failRecord);
    return failRecord;
  }
}
