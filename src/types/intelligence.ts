export type EvidenceStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'UNVERIFIED'
  | 'CONFLICTING_REPORTS'
  | 'FALSE_DEBUNKED';

export type UrlValidationStatus =
  | 'VALIDATED'
  | 'REDIRECTED'
  | 'UNAVAILABLE'
  | 'BLOCKED'
  | 'PENDING';

export interface SourceDiagnostics {
  urlCaptured: boolean;
  urlValidated: boolean;
  primarySourceFound: boolean;
  independentSourceFound: boolean;
  evidenceVerified: boolean;
  redirectDetected: boolean;
  sourceUnavailable: boolean;
  conflictingEvidence: boolean;
  httpStatus?: number;
  responseLatencyMs?: number;
  redirectChain?: string[];
  canonicalUrl?: string;
  validationError?: string;
  checkedAt: string;
}

export interface EvidenceItem {
  id: string;
  publisher: string;
  publisherDomain: string;
  exactUrl: string; // The canonical immutable URL from the news source
  originalUrl: string;
  publishedAt: string;
  title: string;
  snippet?: string;
  isPrimarySource: boolean;
  isCorroborating: boolean;
  urlValidationStatus: UrlValidationStatus;
  diagnostics: SourceDiagnostics;
  supportsClaim: boolean;
  notes?: string;
}

export interface ClaimItem {
  id: string;
  statement: string;
  evidenceItems: EvidenceItem[];
  verificationResult: EvidenceStatus;
  analysisNotes: string;
}

export interface TechIntelligenceEvent {
  id: string;
  title: string;
  category: 'AI & Frontier Models' | 'Semiconductors & Compute' | 'Cybersecurity & Privacy' | 'Enterprise Cloud & Infra' | 'Big Tech & Regulation' | 'Open Source & Dev Tools';
  primaryClaim: string;
  summary: string;
  evidenceStatus: EvidenceStatus;
  confidenceLevel: number; // 0 to 100%
  statusReason: string;
  whyThisStatus: string;
  newsBriefing?: {
    importanceTier: 'MAJOR' | 'SECONDARY' | 'UPDATE';
    headline: string;
    whatHappened: string;
    keyFacts: string;
    whyItMatters: string;
    wordCount: number;
    primarySourcePublisher?: string;
    primarySourceUrl?: string;
  };
  primarySourcePublisher?: string;
  primarySourceUrl?: string;
  independentSourcesCount: number;
  totalSourcesEvaluated: number;
  validSourcesCount: number;
  brokenSourcesCount: number;
  claims: ClaimItem[];
  evidenceList: EvidenceItem[];
  detectedIssues: string[];
  publicationTime: string;
  eventTimeKnown?: string;
  lastVerificationTime: string;
  verificationAuditLog: {
    timestamp: string;
    engine: 'Gemini 3.8 Flash' | 'Groq Llama-3.3' | 'Heuristic Corroborator';
    status: EvidenceStatus;
    summary: string;
  }[];
  overallDiagnostics: {
    urlCaptured: boolean;
    urlValidated: boolean;
    primarySourceFound: boolean;
    independentSourceFound: boolean;
    evidenceVerified: boolean;
    redirectDetected: boolean;
    sourceUnavailable: boolean;
    conflictingEvidence: boolean;
  };
}

export interface IntelligenceFeedResponse {
  events: TechIntelligenceEvent[];
  stats: {
    totalEvents: number;
    verifiedCount: number;
    partiallyVerifiedCount: number;
    unverifiedCount: number;
    conflictingCount: number;
    debunkedCount: number;
    totalSourcesChecked: number;
    sourcesValidated: number;
    sourcesUnavailable: number;
    redirectsPreserved: number;
    lastRefresh: string;
  };
  sourcesHealth: {
    newsApiStatus: 'operational' | 'rate_limited' | 'standby';
    newsDataStatus: 'operational' | 'rate_limited' | 'standby';
    geminiStatus: 'operational' | 'ready' | 'fallback';
    groqStatus: 'operational' | 'ready' | 'standby';
    urlValidatorLatencyMs: number;
  };
}
