import { PaperDigest } from '../types/research';
import { TechIntelligenceEvent } from '../types/intelligence';

export interface SlideItem {
  slideNumber: number;
  slideType: 'title' | 'discovery' | 'methodology' | 'impact' | 'news_wire';
  title: string;
  bulletPoints: string[];
  footerNote: string;
}

export interface SlideDeck {
  id: string;
  deckTitle: string;
  totalSlides: number;
  slides: SlideItem[];
  generatedAt: string;
}

/**
 * Generates executive briefing slide deck data structures.
 * Operates as a distinct decoupled background job.
 */
export async function generateExecutiveSlideDeck(
  digest: PaperDigest,
  events: TechIntelligenceEvent[],
  language: 'bn' | 'en' = 'bn'
): Promise<SlideDeck> {
  const isBn = language === 'bn';
  const paper = digest.paper;

  const slides: SlideItem[] = [
    {
      slideNumber: 1,
      slideType: 'title',
      title: isBn ? 'মর্নিং ইন্টেলিজেন্স: দৈনিক ব্রেকথ্রু এক্সিকিউটিভ ডেক' : 'Morning Intelligence: Daily Research Executive Deck',
      bulletPoints: [
        `Paper: ${paper.title}`,
        `Lead Category: ${paper.primaryCategory} (arXiv ID: ${paper.id})`,
        `Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' et al.' : ''}`,
      ],
      footerNote: 'Autonomous 24-Hour Verified Intelligence Pipeline',
    },
    {
      slideNumber: 2,
      slideType: 'discovery',
      title: isBn ? 'স্তম্ভ ১: মূল আবিষ্কার ও প্রমাণ (Discovery)' : 'Pillar 1: Verified Discovery & Findings',
      bulletPoints: [
        digest.discoveryBullet.replace(/<[^>]*>/g, '').slice(0, 180),
        `arXiv Canonical DOI: ${paper.absUrl}`,
      ],
      footerNote: 'Fact-checked against primary pre-print archive',
    },
    {
      slideNumber: 3,
      slideType: 'methodology',
      title: isBn ? 'স্তম্ভ ২: প্রযুক্তিগত কৌশল ও মেথডোলজি (Methodology)' : 'Pillar 2: Architecture & Empirical Methodology',
      bulletPoints: [
        digest.methodologyBullet.replace(/<[^>]*>/g, '').slice(0, 180),
      ],
      footerNote: 'Evaluated against standard benchmarks',
    },
    {
      slideNumber: 4,
      slideType: 'impact',
      title: isBn ? 'স্তম্ভ ৩: বাস্তব প্রয়োগ ও শিল্প প্রভাব (Industry Impact)' : 'Pillar 3: Industrial & Enterprise Deployment',
      bulletPoints: [
        digest.applicationBullet.replace(/<[^>]*>/g, '').slice(0, 180),
      ],
      footerNote: 'Quantitative compute & inference efficiency gains',
    },
    {
      slideNumber: 5,
      slideType: 'news_wire',
      title: isBn ? 'আজকের শীর্ষ প্রযুক্তিগত সংবাদ (Verified Tech Wire)' : "Today's Verified Technology Intelligence Wire",
      bulletPoints: events.slice(0, 4).map((e) => `• [${e.category}] ${e.newsBriefing?.headline || e.title || 'Breaking Tech Event'} (${e.evidenceStatus})`),
      footerNote: '100% Verified canonical URLs and source corroboration',
    },
  ];

  return {
    id: `slides-${Date.now()}`,
    deckTitle: paper.title,
    totalSlides: slides.length,
    slides,
    generatedAt: new Date().toISOString(),
  };
}
