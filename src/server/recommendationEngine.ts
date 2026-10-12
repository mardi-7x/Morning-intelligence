import { ArxivPaper, FourDScoreBreakdown, UserTrialProfile } from '../types/research';

// High-impact breakthrough themes for technical research
const CORE_AI_THEMES: Record<string, string[]> = {
  REASONING_AND_LLM: ['reasoning', 'thought', 'chain', 'llm', 'transformer', 'language model', 'inference', 'tokens'],
  AUTONOMOUS_AGENTS: ['agent', 'multi-agent', 'planning', 'tool', 'autonomous', 'workflow', 'memory graph'],
  EFFICIENCY_AND_QUANTIZATION: ['compression', 'quantization', 'efficient', 'pruning', 'low-power', 'edge', 'speedup'],
  MULTIMODAL_AND_VISION: ['multimodal', 'vision-language', 'vlm', 'diffusion', 'visual', 'video'],
  SAFETY_AND_ALIGNMENT: ['verification', 'alignment', 'hallucination', 'robustness', 'benchmark', 'safety'],
};

/**
 * Calculates the 4-Dimensional Time-Aware recommendation scores for candidate papers.
 * Evaluates:
 * 1. Semantic Relevance (Dot Product A · B with user profile)
 * 2. Time Recency (24h publication freshness)
 * 3. Morning Cognitive Window (9:30 AM IST attention fit)
 * 4. User Feedback Velocity (Reward for topics marked 🔥, penalty for 💤)
 */
export function scorePaper4D(paper: ArxivPaper, user: UserTrialProfile): FourDScoreBreakdown {
  const combinedText = `${paper.title} ${paper.summary} ${paper.categories.join(' ')}`.toLowerCase();

  // ----------------------------------------------------
  // Dimension 1: Semantic Relevance Vector Dot Product (A · B)
  // ----------------------------------------------------
  const matchedThemes: string[] = [];
  let rawThemeHits = 0;

  Object.entries(CORE_AI_THEMES).forEach(([themeName, keywords]) => {
    const hits = keywords.filter((k) => combinedText.includes(k.toLowerCase())).length;
    if (hits > 0) {
      matchedThemes.push(themeName.replace(/_/g, ' '));
      rawThemeHits += hits;
    }
  });

  const semanticRelevance = Math.min(99, Math.round(50 + rawThemeHits * 10));

  // ----------------------------------------------------
  // Dimension 2: Time Recency (Freshness within 24h window)
  // ----------------------------------------------------
  const pubTime = new Date(paper.publishedDate).getTime();
  const now = Date.now();
  const ageHours = Math.max(0, (now - pubTime) / (1000 * 60 * 60));

  let timeRecency = 95;
  if (ageHours <= 24) {
    timeRecency = 98;
  } else if (ageHours <= 48) {
    timeRecency = 88;
  } else if (ageHours <= 72) {
    timeRecency = 75;
  } else {
    timeRecency = Math.max(40, Math.round(95 - (ageHours / 24) * 10));
  }

  // ----------------------------------------------------
  // Dimension 3: Morning Cognitive Fit (9:30 AM IST)
  // ----------------------------------------------------
  // Rewards papers with concise abstracts (120-250 words) that yield high morning clarity
  const wordCount = paper.summary.split(/\s+/).length;
  let morningCognitiveFit = 85;
  if (wordCount >= 100 && wordCount <= 220) {
    morningCognitiveFit = 96; // Optimal morning briefing length
  } else if (wordCount > 300) {
    morningCognitiveFit = 72; // Overly verbose for morning commute
  } else {
    morningCognitiveFit = 88;
  }

  // ----------------------------------------------------
  // Dimension 4: User Feedback Velocity
  // ----------------------------------------------------
  let feedbackVelocity = 70; // baseline neutral
  if (user.read_history_vectors.length > 0) {
    let positiveVotes = 0;
    let negativeVotes = 0;

    user.read_history_vectors.forEach((historyItem) => {
      // Check if past rated paper shares themes with this paper
      const pastTitleLower = historyItem.paperTitle.toLowerCase();
      const sharesConcept = matchedThemes.some((t) => pastTitleLower.includes(t.toLowerCase().split(' ')[0]));

      if (sharesConcept) {
        if (historyItem.rating === 'HELPFUL') positiveVotes += 1.5;
        if (historyItem.rating === 'NOT_HELPFUL') negativeVotes += 2.0;
      }
    });

    feedbackVelocity = Math.max(20, Math.min(99, Math.round(70 + positiveVotes * 10 - negativeVotes * 15)));
  }

  // ----------------------------------------------------
  // Composite 4D Score: Weighted Linear Combination
  // ----------------------------------------------------
  // 35% Semantic Dot Product + 30% Time Recency + 20% Morning Fit + 15% Feedback Vector
  const composite4DScore = Math.round(
    semanticRelevance * 0.35 +
      timeRecency * 0.30 +
      morningCognitiveFit * 0.20 +
      feedbackVelocity * 0.15
  );

  return {
    semanticRelevance,
    timeRecency,
    morningCognitiveFit,
    feedbackVelocity,
    composite4DScore,
    matchedThemes: matchedThemes.length > 0 ? matchedThemes : ['Core AI Advancement'],
  };
}

/**
 * Selects the #1 best research paper of the day from arXiv candidates
 */
export function selectBestPaperOfTheDay(
  papers: ArxivPaper[],
  user: UserTrialProfile
): {
  selectedPaper: ArxivPaper;
  scores: FourDScoreBreakdown;
  rankedPapers: Array<{ paper: ArxivPaper; scores: FourDScoreBreakdown }>;
} {
  if (papers.length === 0) {
    throw new Error('No candidate research papers provided for ranking.');
  }

  const scored = papers.map((paper) => ({
    paper,
    scores: scorePaper4D(paper, user),
  }));

  // Sort descending by composite 4D score
  scored.sort((a, b) => b.scores.composite4DScore - a.scores.composite4DScore);

  return {
    selectedPaper: scored[0].paper,
    scores: scored[0].scores,
    rankedPapers: scored,
  };
}
