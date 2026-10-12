import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { TechIntelligenceEvent, IntelligenceFeedResponse } from '../types/intelligence';

export interface DispatchRecord {
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
  periodStart: string;
  periodEnd: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DISPATCH_HISTORY_FILE = path.join(DATA_DIR, 'dispatch-history.json');
const DISPATCH_PDF_DIR = path.join(DATA_DIR, 'dispatches');

// Ensure data storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DISPATCH_PDF_DIR)) {
  fs.mkdirSync(DISPATCH_PDF_DIR, { recursive: true });
}

// Load dispatch history
export function getDispatchHistory(): DispatchRecord[] {
  try {
    if (fs.existsSync(DISPATCH_HISTORY_FILE)) {
      const raw = fs.readFileSync(DISPATCH_HISTORY_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[EmailDispatcher] Error reading dispatch history:', err);
  }
  return [];
}

// Save dispatch record
export function saveDispatchRecord(record: DispatchRecord): void {
  try {
    const history = getDispatchHistory();
    history.unshift(record);
    // Keep last 50 records
    const trimmed = history.slice(0, 50);
    fs.writeFileSync(DISPATCH_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('[EmailDispatcher] Error saving dispatch history:', err);
  }
}

export interface EmailDispatchOptions {
  pdfBuffer: Buffer;
  events: TechIntelligenceEvent[];
  stats?: IntelligenceFeedResponse['stats'];
  recipientEmail?: string;
  smtpConfig?: {
    smtpHost?: string;
    smtpUser?: string;
    smtpPass?: string;
    smtpPort?: number;
  };
  isManualTrigger?: boolean;
}

/**
 * Creates the appropriate Nodemailer transporter based on available environment/runtime credentials.
 */
function createTransporter(config?: {
  smtpHost?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpPort?: number;
}) {
  let host = config?.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
  let user = config?.smtpUser || process.env.SMTP_USER || 'narayanmardi9735@gmail.com';
  let pass = config?.smtpPass || process.env.SMTP_PASS || '';
  const port = config?.smtpPort || parseInt(process.env.SMTP_PORT || '587', 10);

  // Auto-correct common typos and email-as-host inputs (e.g., "narayanmardi9735@gamil.com")
  if (host && host.includes('@')) {
    user = host;
    host = 'smtp.gmail.com';
  }
  if (user && user.includes('gamil.com')) {
    user = user.replace('gamil.com', 'gmail.com');
  }
  if (host && host.includes('gamil.com')) {
    host = 'smtp.gmail.com';
  }

  // If credentials with password are provided
  if (user && pass) {
    if (user.includes('@gmail.com') || host.includes('gmail')) {
      return {
        transporter: nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
        }),
        isLiveGateway: true,
        user,
        host: 'smtp.gmail.com',
      };
    }

    return {
      transporter: nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      }),
      isLiveGateway: true,
      user,
      host,
    };
  }

  // Fallback: Safe JSON transport for offline archiving & logging
  return {
    transporter: nodemailer.createTransport({
      jsonTransport: true,
    }),
    isLiveGateway: false,
    user,
    host,
  };
}

/**
 * Dispatches the 24-hour intelligence dossier PDF via email.
 */
export async function sendIntelligenceReportEmail({
  pdfBuffer,
  events,
  stats,
  recipientEmail = process.env.RECIPIENT_EMAIL || 'subhadipmardi16@gmail.com',
  smtpConfig,
  isManualTrigger = false,
}: EmailDispatchOptions): Promise<DispatchRecord> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-');
  const filename = `Tech_World_Intelligence_Dossier_${dateStr}_${timeStr}.pdf`;

  // Save PDF copy to local archive
  const savedPdfPath = path.join(DISPATCH_PDF_DIR, filename);
  fs.writeFileSync(savedPdfPath, pdfBuffer);

  const verifiedEvents = events.filter((e) => e.evidenceStatus === 'VERIFIED');
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const subject = `[24h Tech Intelligence Dossier] Daily Verified Tech Briefing • 9:30 AM IST (${dateStr})`;

  const topHeadlinesHtml = events
    .slice(0, 5)
    .map(
      (e) => `
      <li style="margin-bottom: 10px;">
        <strong>${e.title}</strong>
        <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${
          e.evidenceStatus === 'VERIFIED' ? '#d1fae5; color: #065f46;' : '#fef3c7; color: #92400e;'
        } margin-left: 6px;">${e.evidenceStatus}</span>
        <br/>
        <span style="font-size: 12px; color: #64748b;">Claim: ${e.primaryClaim}</span>
        <br/>
        <span style="font-size: 11px; color: #0284c7;">Primary Source: <a href="${e.primarySourceUrl}" style="color: #0284c7;">${e.primarySourcePublisher || 'Publisher'}</a> (${e.independentSourcesCount} corroborating sources)</span>
      </li>
    `
    )
    .join('');

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>24-Hour Tech World Intelligence Report</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
      <div style="max-width: 680px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #090d16 0%, #1e1b4b 100%); padding: 24px; border-bottom: 2px solid #06b6d4;">
          <div style="font-size: 11px; font-weight: bold; letter-spacing: 1.5px; color: #06b6d4; text-transform: uppercase;">
            ● 24-HOUR TECH WORLD INTELLIGENCE • AUTOMATED DAILY DISPATCH
          </div>
          <h1 style="margin: 8px 0 4px; font-size: 22px; color: #ffffff;">
            Verified Technical Intelligence Dossier
          </h1>
          <p style="margin: 0; font-size: 13px; color: #94a3b8;">
            Scheduled Delivery: 9:30 AM IST (04:00 UTC) • Covering Rolling 24-Hour Window
          </p>
        </div>

        <!-- Metrics Grid -->
        <div style="padding: 20px; border-bottom: 1px solid #334155; background-color: #0f172a;">
          <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center;">
            <tr>
              <td style="padding: 10px; background-color: #1e293b; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-size: 11px; color: #94a3b8;">TOTAL STORIES</div>
                <div style="font-size: 20px; font-weight: bold; color: #f8fafc;">${events.length}</div>
              </td>
              <td width="10"></td>
              <td style="padding: 10px; background-color: #064e3b; border-radius: 8px; border: 1px solid #059669;">
                <div style="font-size: 11px; color: #a7f3d0;">VERIFIED EVENTS</div>
                <div style="font-size: 20px; font-weight: bold; color: #34d399;">${verifiedEvents.length}</div>
              </td>
              <td width="10"></td>
              <td style="padding: 10px; background-color: #1e293b; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-size: 11px; color: #38bdf8;">ACTIVE 200 OK URLs</div>
                <div style="font-size: 20px; font-weight: bold; color: #38bdf8;">${stats?.sourcesValidated ?? events.reduce((acc, e) => acc + e.validSourcesCount, 0)}</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Content Summary -->
        <div style="padding: 24px;">
          <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #cbd5e1;">
            Key Verified Developments:
          </h3>
          <ul style="padding-left: 20px; color: #e2e8f0; font-size: 14px; line-height: 1.6;">
            ${topHeadlinesHtml}
          </ul>

          <div style="margin-top: 24px; padding: 16px; background-color: #0f172a; border-radius: 8px; border-left: 4px solid #06b6d4;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              <strong style="color: #38bdf8;">Attached Forensic PDF:</strong>
              The complete A4 report is attached to this email. Every cited source contains the verified canonical URL with live redirect detection. 404/broken URLs have been filtered and barred from verification weighting.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; background-color: #090d16; border-top: 1px solid #334155; font-size: 11px; color: #64748b; text-align: center;">
          Dispatched to <strong>${recipientEmail}</strong> at 9:30 AM IST • Strict Source Traceability Engine<br/>
          Next automated run scheduled tomorrow at 9:30 AM IST (04:00 UTC).
        </div>

      </div>
    </body>
    </html>
  `;

  const { transporter, isLiveGateway, user: smtpUser } = createTransporter(smtpConfig);
  const sender =
    process.env.SMTP_FROM || `"24-Hour Tech Intelligence" <${smtpUser || 'narayanmardi9735@gmail.com'}>`;

  const mailOptions = {
    from: sender,
    to: recipientEmail,
    subject,
    html: htmlBody,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[EmailDispatcher] Intelligence PDF sent to ${recipientEmail} from ${sender}:`,
      info.messageId || 'Local-Archive'
    );

    const record: DispatchRecord = {
      id: `dispatch-${Date.now()}`,
      dispatchedAt: now.toISOString(),
      recipient: recipientEmail,
      subject,
      status: isLiveGateway ? 'SUCCESS' : 'ARCHIVED_LOCAL',
      eventsCount: events.length,
      verifiedCount: verifiedEvents.length,
      pdfSizeBytes: pdfBuffer.length,
      messageId: info.messageId || `archive-${Date.now()}`,
      periodStart,
      periodEnd,
      details: isLiveGateway
        ? `Delivered to SMTP gateway via ${smtpUser} (${info.messageId})`
        : `Report compiled & archived for ${recipientEmail} (dispatched via ${smtpUser})`,
    };

    saveDispatchRecord(record);
    return record;
  } catch (err: any) {
    console.error(`[EmailDispatcher] Failed to send email to ${recipientEmail}:`, err);
    const failedRecord: DispatchRecord = {
      id: `dispatch-${Date.now()}`,
      dispatchedAt: now.toISOString(),
      recipient: recipientEmail,
      subject,
      status: 'FAILED',
      eventsCount: events.length,
      verifiedCount: verifiedEvents.length,
      pdfSizeBytes: pdfBuffer.length,
      error: err.message,
      periodStart,
      periodEnd,
      details: `Email dispatch failed: ${err.message}`,
    };
    saveDispatchRecord(failedRecord);
    return failedRecord;
  }
}
