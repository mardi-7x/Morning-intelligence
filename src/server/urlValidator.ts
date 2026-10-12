import { SourceDiagnostics, UrlValidationStatus } from '../types/intelligence.ts';

export interface ValidatedUrlResult {
  originalUrl: string;
  canonicalUrl: string;
  status: UrlValidationStatus;
  httpStatus?: number;
  redirectDetected: boolean;
  redirectChain: string[];
  latencyMs: number;
  isAvailable: boolean;
  error?: string;
  diagnostics: SourceDiagnostics;
}

/**
 * Validates a news article source URL by testing live HTTP connectivity,
 * following redirects safely, capturing canonical URLs, and identifying broken 404/410 links.
 */
export async function validateSourceUrl(rawUrl: string): Promise<ValidatedUrlResult> {
  const startTime = Date.now();
  const trimmedUrl = (rawUrl || '').trim();

  // Basic format check
  if (!trimmedUrl || (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://'))) {
    const latency = Date.now() - startTime;
    return {
      originalUrl: trimmedUrl,
      canonicalUrl: trimmedUrl,
      status: 'UNAVAILABLE',
      httpStatus: 400,
      redirectDetected: false,
      redirectChain: [],
      latencyMs: latency,
      isAvailable: false,
      error: 'Malformed URL: missing valid http/https protocol scheme',
      diagnostics: {
        urlCaptured: Boolean(trimmedUrl),
        urlValidated: false,
        primarySourceFound: false,
        independentSourceFound: false,
        evidenceVerified: false,
        redirectDetected: false,
        sourceUnavailable: true,
        conflictingEvidence: false,
        httpStatus: 400,
        responseLatencyMs: latency,
        canonicalUrl: trimmedUrl,
        validationError: 'Malformed URL scheme',
        checkedAt: new Date().toISOString(),
      },
    };
  }

  // Realistic browser headers to prevent false 403s on news sites
  const requestHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TechWorldIntelligence/2.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  };

  const redirectChain: string[] = [trimmedUrl];
  let canonicalUrl = trimmedUrl;
  let responseStatus = 0;
  let redirectDetected = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

    // Try HEAD request first for fast header check
    let res: Response;
    try {
      res = await fetch(trimmedUrl, {
        method: 'HEAD',
        headers: requestHeaders,
        redirect: 'follow',
        signal: controller.signal,
      });

      // Some servers block HEAD or return 405 Method Not Allowed / 403 Forbidden on HEAD
      if (res.status === 405 || (res.status === 403 && !res.ok)) {
        res = await fetch(trimmedUrl, {
          method: 'GET',
          headers: { ...requestHeaders, Range: 'bytes=0-2048' },
          redirect: 'follow',
          signal: controller.signal,
        });
      }
    } catch (headErr: any) {
      if (headErr.name === 'AbortError') {
        throw new Error('Connection timed out after 3500ms');
      }
      // If HEAD threw network error, attempt GET once
      res = await fetch(trimmedUrl, {
        method: 'GET',
        headers: { ...requestHeaders, Range: 'bytes=0-2048' },
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    responseStatus = res.status;
    const finalUrl = res.url || trimmedUrl;

    if (finalUrl && finalUrl !== trimmedUrl) {
      redirectDetected = true;
      canonicalUrl = finalUrl;
      redirectChain.push(finalUrl);
    }

    const latency = Date.now() - startTime;

    // Check for broken statuses: 404, 410, 500, etc.
    if (res.status === 404 || res.status === 410) {
      return {
        originalUrl: trimmedUrl,
        canonicalUrl,
        status: 'UNAVAILABLE',
        httpStatus: res.status,
        redirectDetected,
        redirectChain,
        latencyMs: latency,
        isAvailable: false,
        error: `HTTP ${res.status} Page Not Found / Resource Deleted`,
        diagnostics: {
          urlCaptured: true,
          urlValidated: false,
          primarySourceFound: false,
          independentSourceFound: false,
          evidenceVerified: false,
          redirectDetected,
          sourceUnavailable: true,
          conflictingEvidence: false,
          httpStatus: res.status,
          responseLatencyMs: latency,
          canonicalUrl,
          redirectChain,
          validationError: `HTTP ${res.status} ${res.statusText || 'Not Found'}`,
          checkedAt: new Date().toISOString(),
        },
      };
    }

    if (res.status >= 500) {
      return {
        originalUrl: trimmedUrl,
        canonicalUrl,
        status: 'UNAVAILABLE',
        httpStatus: res.status,
        redirectDetected,
        redirectChain,
        latencyMs: latency,
        isAvailable: false,
        error: `Publisher server error (HTTP ${res.status})`,
        diagnostics: {
          urlCaptured: true,
          urlValidated: false,
          primarySourceFound: false,
          independentSourceFound: false,
          evidenceVerified: false,
          redirectDetected,
          sourceUnavailable: true,
          conflictingEvidence: false,
          httpStatus: res.status,
          responseLatencyMs: latency,
          canonicalUrl,
          redirectChain,
          validationError: `Server error ${res.status}`,
          checkedAt: new Date().toISOString(),
        },
      };
    }

    if (res.status >= 400 && res.status < 500 && res.status !== 403) {
      // Client errors (400, 401, etc.)
      return {
        originalUrl: trimmedUrl,
        canonicalUrl,
        status: 'UNAVAILABLE',
        httpStatus: res.status,
        redirectDetected,
        redirectChain,
        latencyMs: latency,
        isAvailable: false,
        error: `Client error HTTP ${res.status}`,
        diagnostics: {
          urlCaptured: true,
          urlValidated: false,
          primarySourceFound: false,
          independentSourceFound: false,
          evidenceVerified: false,
          redirectDetected,
          sourceUnavailable: true,
          conflictingEvidence: false,
          httpStatus: res.status,
          responseLatencyMs: latency,
          canonicalUrl,
          redirectChain,
          validationError: `HTTP ${res.status}`,
          checkedAt: new Date().toISOString(),
        },
      };
    }

    // Special case for 403 on known strict publishers (e.g., Bloomberg, Reuters bot firewall)
    // If it's a 403 Cloudflare/Akamai bot challenge, page exists but blocks headless scrapers
    const isStrictWaf = res.status === 403;
    const isAvailable = res.ok || isStrictWaf;
    const finalStatus: UrlValidationStatus = !isAvailable
      ? 'UNAVAILABLE'
      : redirectDetected
      ? 'REDIRECTED'
      : isStrictWaf
      ? 'BLOCKED'
      : 'VALIDATED';

    return {
      originalUrl: trimmedUrl,
      canonicalUrl,
      status: finalStatus,
      httpStatus: res.status,
      redirectDetected,
      redirectChain,
      latencyMs: latency,
      isAvailable: res.ok,
      error: isStrictWaf ? 'Publisher bot firewall detected (HTTP 403), article URL reachable' : undefined,
      diagnostics: {
        urlCaptured: true,
        urlValidated: res.ok,
        primarySourceFound: false,
        independentSourceFound: false,
        evidenceVerified: false,
        redirectDetected,
        sourceUnavailable: !res.ok && !isStrictWaf,
        conflictingEvidence: false,
        httpStatus: res.status,
        responseLatencyMs: latency,
        canonicalUrl,
        redirectChain,
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    const latency = Date.now() - startTime;
    return {
      originalUrl: trimmedUrl,
      canonicalUrl,
      status: 'UNAVAILABLE',
      httpStatus: responseStatus || 0,
      redirectDetected,
      redirectChain,
      latencyMs: latency,
      isAvailable: false,
      error: err?.message || 'Network lookup failure / DNS resolution error',
      diagnostics: {
        urlCaptured: true,
        urlValidated: false,
        primarySourceFound: false,
        independentSourceFound: false,
        evidenceVerified: false,
        redirectDetected: false,
        sourceUnavailable: true,
        conflictingEvidence: false,
        responseLatencyMs: latency,
        canonicalUrl: trimmedUrl,
        redirectChain,
        validationError: err?.message || 'Connection failed',
        checkedAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Validates a batch of source URLs concurrently with concurrency limit.
 */
export async function validateSourceUrlsBatch(
  urls: string[],
  concurrency = 5
): Promise<Map<string, ValidatedUrlResult>> {
  const results = new Map<string, ValidatedUrlResult>();
  const queue = [...urls];

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      if (results.has(url)) continue;
      const res = await validateSourceUrl(url);
      results.set(url, res);
    }
  });

  await Promise.all(workers);
  return results;
}
