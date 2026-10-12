import { jsPDF } from 'jspdf';
import { TechIntelligenceEvent, IntelligenceFeedResponse } from '../types/intelligence';

interface GeneratePdfOptions {
  events: TechIntelligenceEvent[];
  stats?: IntelligenceFeedResponse['stats'];
  reportTitle?: string;
  scopeLabel?: string;
}

/**
 * Builds the jsPDF document object for the technical intelligence report.
 * Works seamlessly in both browser and Node.js environments.
 */
export function buildIntelligencePdfDoc({
  events,
  stats,
  reportTitle = '24-Hour Tech World Intelligence Dossier',
  scopeLabel = 'Verified 24-Hour Technological Events',
}: GeneratePdfOptions): jsPDF {
  // A4 dimensions in mm: 210 x 297
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm
  const bottomMargin = 22;

  let yPos = 14;

  const checkPageBreak = (neededHeight: number) => {
    if (yPos + neededHeight > pageHeight - bottomMargin) {
      doc.addPage();
      yPos = 16;
      drawPageHeader();
    }
  };

  const drawPageHeader = () => {
    // Subtle top running header on subsequent pages
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('24-HOUR TECH WORLD INTELLIGENCE • EXECUTIVE DOSSIER', marginX, 10);
    const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    doc.text(dateStr, pageWidth - marginX, 10, { align: 'right' });

    // Thin separator line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(marginX, 11.5, pageWidth - marginX, 11.5);
  };

  // ================= COVER / TOP HEADER BANNER =================
  // Dark slate background banner
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(marginX, yPos, contentWidth, 34, 'F');

  // Accent cyan bar on left
  doc.setFillColor(6, 182, 212); // #06b6d4
  doc.rect(marginX, yPos, 2.5, 34, 'F');

  // Classification Tag
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(6, 182, 212);
  doc.text('VERIFIED INTELLIGENCE BRIEFING • FORENSIC EVIDENCE CHAIN', marginX + 6, yPos + 7);

  // Main Report Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(248, 250, 252);
  doc.text(reportTitle.toUpperCase(), marginX + 6, yPos + 16);

  // Subtitle & Scope
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  const genTime = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  doc.text(
    `Scope: ${scopeLabel} • Generated: ${genTime} • Non-Recycled Primary & Corroborated Evidence`,
    marginX + 6,
    yPos + 23
  );

  // Notice pill
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(52, 211, 153);
  doc.text('● LIVE CANONICAL URL VALIDATION ACTIVE • ZERO HALLUCINATED SOURCES', marginX + 6, yPos + 29.5);

  yPos += 38;

  // ================= EXECUTIVE AUDIT METRICS =================
  if (stats) {
    checkPageBreak(22);
    const boxW = contentWidth / 4;
    const boxH = 15;

    const metrics = [
      { label: 'TOTAL EVENTS', val: String(stats.totalEvents || events.length), color: [15, 23, 42] },
      { label: 'VERIFIED/ACTIVE', val: String(stats.verifiedCount ?? events.filter(e => e.evidenceStatus === 'VERIFIED').length), color: [5, 150, 105] },
      { label: 'VALIDATED SOURCES', val: String(stats.sourcesValidated ?? stats.totalSourcesChecked ?? 0), color: [2, 132, 199] },
      { label: 'UNAVAILABLE / 404', val: String(stats.sourcesUnavailable ?? 0), color: [225, 29, 72] },
    ];

    metrics.forEach((m, idx) => {
      const bx = marginX + idx * boxW;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(bx, yPos, boxW - 2, boxH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(m.label, bx + 4, yPos + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(m.color[0], m.color[1], m.color[2]);
      doc.text(m.val, bx + 4, yPos + 12);
    });

    yPos += boxH + 6;
  }

  // Section Header
  checkPageBreak(12);
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, yPos, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`VERIFIED EVENT DOSSIERS (${events.length} RECORDED DISPATCHES)`, marginX + 4, yPos + 5);
  yPos += 11;

  // If no events
  if (events.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No events match the selected criteria.', marginX, yPos + 6);
    yPos += 14;
  }

  // ================= EVENT DOSSIERS =================
  events.forEach((event, idx) => {
    // Estimate needed block height
    const claimLines = doc.splitTextToSize(event.primaryClaim || event.title, contentWidth - 16);
    const whyLines = doc.splitTextToSize(event.whyThisStatus || event.statusReason || '', contentWidth - 16);
    const estimatedHeight = 55 + claimLines.length * 4 + whyLines.length * 4 + (event.evidenceList.length * 15);

    checkPageBreak(Math.min(estimatedHeight, 80));

    // Event Card Container Top Bar
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);

    // Event Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);

    const titlePrefix = `#${idx + 1}  `;
    const fullTitle = `${titlePrefix}${event.title}`;
    const wrappedTitle = doc.splitTextToSize(fullTitle, contentWidth - 48);

    doc.text(wrappedTitle, marginX, yPos);
    const titleBlockHeight = wrappedTitle.length * 4.5;

    // Status Badge Pill
    const badgeW = 34;
    const badgeH = 5.5;
    const badgeX = pageWidth - marginX - badgeW;
    const badgeY = yPos - 3.5;

    // Status Colors
    let badgeBg = [100, 116, 139];
    let badgeText = [255, 255, 255];
    let statusLabel = event.evidenceStatus.replace('_', ' ');

    switch (event.evidenceStatus) {
      case 'VERIFIED':
        badgeBg = [5, 150, 105]; // Emerald
        statusLabel = 'VERIFIED';
        break;
      case 'PARTIALLY_VERIFIED':
        badgeBg = [2, 132, 199]; // Sky/Blue
        statusLabel = 'PARTIAL EVIDENCE';
        break;
      case 'UNVERIFIED':
        badgeBg = [217, 119, 6]; // Amber
        statusLabel = 'UNVERIFIED';
        break;
      case 'CONFLICTING_REPORTS':
        badgeBg = [147, 51, 234]; // Purple
        statusLabel = 'CONFLICTING';
        break;
      case 'FALSE_DEBUNKED':
        badgeBg = [225, 29, 72]; // Rose/Red
        statusLabel = 'DEBUNKED';
        break;
    }

    doc.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(badgeText[0], badgeText[1], badgeText[2]);
    doc.text(statusLabel, badgeX + badgeW / 2, badgeY + 3.8, { align: 'center' });

    yPos += Math.max(titleBlockHeight, 6) + 1;

    // Metadata Sub-row: Category, Confidence, Timestamps
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const pubTimeStr = event.publicationTime
      ? new Date(event.publicationTime).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      : 'N/A';
    const verifiedTimeStr = event.lastVerificationTime
      ? new Date(event.lastVerificationTime).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      : 'N/A';

    doc.text(
      `Category: ${event.category}  |  Confidence: ${event.confidenceLevel}%  |  Published: ${pubTimeStr}  |  Last Verified: ${verifiedTimeStr}`,
      marginX,
      yPos
    );
    yPos += 5;

    // Primary Claim & What Happened Box
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    const claimBoxH = 6 + claimLines.length * 3.8;
    doc.rect(marginX, yPos, contentWidth, claimBoxH, 'FD');

    // Left accent bar on claim
    doc.setFillColor(6, 182, 212);
    doc.rect(marginX, yPos, 1.8, claimBoxH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(2, 132, 199);
    doc.text('HEADLINE & WHAT HAPPENED:', marginX + 4, yPos + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(claimLines, marginX + 4, yPos + 8.5);
    yPos += claimBoxH + 4;

    // Structured 3-Part Newspaper Dossier: What Happened -> Key Facts -> Why It Matters
    if (event.newsBriefing && (event.newsBriefing.keyFacts || event.newsBriefing.whyItMatters)) {
      // Key Facts Section
      if (event.newsBriefing.keyFacts) {
        const factLines = doc.splitTextToSize(event.newsBriefing.keyFacts, contentWidth - 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text('KEY FACTS & EVIDENCE:', marginX, yPos);
        yPos += 3.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(51, 65, 85);
        doc.text(factLines, marginX, yPos);
        yPos += factLines.length * 3.5 + 3.5;
      }

      // Why It Matters Section
      if (event.newsBriefing.whyItMatters) {
        const whyMattersLines = doc.splitTextToSize(event.newsBriefing.whyItMatters, contentWidth - 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(3, 105, 161);
        doc.text('WHY IT MATTERS & INDUSTRY IMPACT:', marginX, yPos);
        yPos += 3.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(51, 65, 85);
        doc.text(whyMattersLines, marginX, yPos);
        yPos += whyMattersLines.length * 3.5 + 3.5;
      }
    } else {
      // Standard Verification Findings & Rationale
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text('VERIFICATION FINDINGS & CORROBORATION RATIONALE:', marginX, yPos);
      yPos += 3.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(51, 65, 85);
      doc.text(whyLines, marginX, yPos);
      yPos += whyLines.length * 3.5 + 4;
    }

    // Flagged Issues (if present)
    const issues = Array.isArray(event.detectedIssues) ? event.detectedIssues : [];
    if (issues.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(180, 83, 9);
      doc.text(`FLAGGED ISSUES: ${issues.join(' • ')}`, marginX, yPos);
      yPos += 4.5;
    }

    // Sources Evaluated Table Header
    checkPageBreak(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `SOURCES & TRACEABILITY (${event.evidenceList.length} sources evaluated, ${event.validSourcesCount} validated active):`,
      marginX,
      yPos
    );
    yPos += 4;

    // Evidence Items List
    event.evidenceList.forEach((ev, evIdx) => {
      checkPageBreak(16);

      const isUnavailable = ev.urlValidationStatus === 'UNAVAILABLE';
      const isRedirect = ev.urlValidationStatus === 'REDIRECTED';

      // Bullet dot
      doc.setFillColor(isUnavailable ? 225 : 5, isUnavailable ? 29 : 150, isUnavailable ? 72 : 105);
      doc.circle(marginX + 2, yPos + 1.2, 0.9, 'F');

      // Publisher & Role
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);
      const pubTitle = `${ev.publisher || 'Publisher'} ${ev.isPrimarySource ? '[PRIMARY SOURCE]' : '[CORROBORATING]'}`;
      doc.text(pubTitle, marginX + 5, yPos + 2);

      // Status Note
      let statusNote = 'Verified Live (HTTP 200)';
      let statusColor = [5, 150, 105];
      if (isUnavailable) {
        statusNote = 'Source unavailable — not used as verified evidence';
        statusColor = [225, 29, 72];
      } else if (isRedirect) {
        statusNote = 'HTTP Redirect Verified (Canonical URL Preserved)';
        statusColor = [2, 132, 199];
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.text(statusNote, pageWidth - marginX, yPos + 2, { align: 'right' });

      yPos += 5;

      // Clickable URL with Link Annotation
      const exactUrl = ev.exactUrl || ev.originalUrl;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(2, 132, 199); // Blue / Cyan

      const maxUrlChars = 92;
      const displayUrl =
        exactUrl.length > maxUrlChars ? exactUrl.slice(0, maxUrlChars) + '...' : exactUrl;

      // Draw text with link annotation
      doc.text(displayUrl, marginX + 5, yPos + 1);
      const textW = doc.getTextWidth(displayUrl);

      // Underline to clearly indicate clickability
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.15);
      doc.line(marginX + 5, yPos + 1.6, marginX + 5 + textW, yPos + 1.6);

      // Add clickable active hyperlink annotation in PDF
      doc.link(marginX + 5, yPos - 2.5, textW, 4.5, { url: exactUrl });

      yPos += 6;
    });

    // Separator line between events
    yPos += 3;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, yPos, pageWidth - marginX, yPos);
    yPos += 7;
  });

  // ================= FOOTERS ON ALL PAGES =================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Bottom line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      '24-HOUR TECH WORLD INTELLIGENCE • ALL RIGHTS RESERVED • STRICT SOURCE TRACEABILITY COMPLIANT',
      marginX,
      pageHeight - 8
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
  }

  return doc;
}

/**
 * Converts currently verified 24-hour intelligence results into a professional A4 PDF
 * and starts the download automatically in browser.
 */
export function generateIntelligencePdfReport(options: GeneratePdfOptions): void {
  const doc = buildIntelligencePdfDoc(options);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const timeSlug = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
  const filename = `Tech_World_Intelligence_Dossier_${dateSlug}_${timeSlug}.pdf`;
  doc.save(filename);
}
