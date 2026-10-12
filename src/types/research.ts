export type TrialStatus = 'active_trial' | 'trial_warning' | 'trial_expired' | 'paid_subscriber';

export interface UserTrialProfile {
  user_id: string; // Telegram Chat ID e.g. "8204210827"
  username?: string;
  firstName?: string;
  joined_date: string;
  trial_day_count: number; // 1 to 7
  status: TrialStatus;
  preferred_language: 'bn' | 'en';
  read_history_vectors: {
    paperId: string;
    paperTitle: string;
    rating: 'HELPFUL' | 'NOT_HELPFUL';
    timestamp: string;
    topicTags: string[];
  }[];
  last_digest_sent_at?: string;
  last_delivery_status?: 'SUCCESS' | 'FAILED';
  last_delivery_error?: string;
  total_digests_received: number;
}

export interface ArxivPaper {
  id: string;
  arxivId: string;
  title: string;
  summary: string;
  authors: string[];
  publishedDate: string;
  updatedDate?: string;
  categories: string[];
  primaryCategory: string;
  pdfUrl: string;
  absUrl: string;
}

export interface FourDScoreBreakdown {
  semanticRelevance: number; // Dimension 1: Dot product A · B (0-100)
  timeRecency: number; // Dimension 2: 24h freshness score (0-100)
  morningCognitiveFit: number; // Dimension 3: 9:30 AM IST attention window fit (0-100)
  feedbackVelocity: number; // Dimension 4: User vector affinity (0-100)
  composite4DScore: number; // Weighted composite (0-100)
  matchedThemes: string[];
}

export interface PaperDigest {
  paper: ArxivPaper;
  scores: FourDScoreBreakdown;
  discoveryBullet: string; // আবিষ্কার
  methodologyBullet: string; // মেথডোলজি
  applicationBullet: string; // বাস্তব প্রয়োগ
  executiveSummary: string;
  language: 'bn' | 'en';
  generatedAt: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  botUsername?: string;
  botFirstName?: string;
  paymentLinkUrl?: string;
}

export interface TelegramDispatchRecord {
  id: string;
  dispatchedAt: string;
  chatId: string;
  trialDay: number;
  status: TrialStatus;
  paperTitle: string;
  pdfUrl: string;
  telegramMessageId?: number; // Text format message ID
  pdfDocumentMessageId?: number; // PDF document message ID
  textFormatDelivered?: boolean;
  pdfDocumentDelivered?: boolean;
  success: boolean;
  error?: string;
  stageLabel: string;
}
