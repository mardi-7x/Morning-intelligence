import { PaperDigest } from '../types/research';
import { TechIntelligenceEvent } from '../types/intelligence';

export interface PodcastScript {
  id: string;
  title: string;
  targetDurationSeconds: number;
  host1Name: string;
  host2Name: string;
  dialogue: Array<{ speaker: string; text: string }>;
  audioOverviewSummary: string;
  generatedAt: string;
}

/**
 * Generates an executive 2-host audio briefing podcast script for today's breakthrough paper and wire stories.
 * Decoupled from the primary newspaper pipeline so failures never impede delivery.
 */
export async function generateMorningPodcastScript(
  digest: PaperDigest,
  events: TechIntelligenceEvent[],
  language: 'bn' | 'en' = 'bn'
): Promise<PodcastScript> {
  const isBn = language === 'bn';
  const paper = digest.paper;

  const dialogue: Array<{ speaker: string; text: string }> = isBn
    ? [
        {
          speaker: 'সৌম্য (সিনিয়র রিসার্চ অ্যানালিস্ট)',
          text: `শুভ সকাল! আজকের সিন্যাপ্সডাইজেস্ট এআই মর্নিং পডকাস্টে আপনাদের স্বাগত। আজ আমাদের প্রধান ব্রেকথ্রু গবেষণাপত্রটি হলো: "${paper.title}"।`,
        },
        {
          speaker: 'অনন্যা (চিফ টেক এডিটর)',
          text: `ধন্যবাদ সৌম্য। এই গবেষণার মূল আবিষ্কার হলো—${digest.discoveryBullet.replace(/<[^>]*>/g, '')}`,
        },
        {
          speaker: 'সৌম্য',
          text: `আর গবেষকরা মেথডোলজিতে ঠিক কী কৌশল ব্যবহার করেছেন অনন্যা?`,
        },
        {
          speaker: 'অনন্যা',
          text: `${digest.methodologyBullet.replace(/<[^>]*>/g, '')}`,
        },
        {
          speaker: 'সৌম্য',
          text: `বাস্তব ক্ষেত্রে এর অর্থনৈতিক ও প্রযুক্তিগত প্রভাব ব্যাপক: ${digest.applicationBullet.replace(/<[^>]*>/g, '')}`,
        },
        {
          speaker: 'অনন্যা',
          text: `একদমই তাই। এছাড়াও আজকের টেক ওয়্যারে শীর্ষ ${Math.min(3, events.length)}টি যাচাইকৃত সংবাদের বিস্তারিত আমাদের অফিশিয়াল পিডিএফ ডসিয়ারে যুক্ত রয়েছে। সবাইকে ধন্যবাদ!`,
        },
      ]
    : [
        {
          speaker: 'Alex (Lead Research Scientist)',
          text: `Good morning and welcome to the Morning Intelligence Podcast. Today's top arXiv breakthrough paper is: "${paper.title}".`,
        },
        {
          speaker: 'Elena (Executive Technology Editor)',
          text: `Thanks Alex. Looking at the core discovery: ${digest.discoveryBullet.replace(/<[^>]*>/g, '')}`,
        },
        {
          speaker: 'Alex',
          text: `And what about the underlying technical methodology and benchmarks?`,
        },
        {
          speaker: 'Elena',
          text: `${digest.methodologyBullet.replace(/<[^>]*>/g, '')}`,
        },
        {
          speaker: 'Alex',
          text: `The practical engineering takeaway is huge: ${digest.applicationBullet.replace(/<[^>]*>/g, '')}`,
        },
        {
          speaker: 'Elena',
          text: `Indeed. Full verified citations and data are available in today's official downloadable broadsheet PDF. Have an insightful day ahead!`,
        },
      ];

  return {
    id: `podcast-${Date.now()}`,
    title: isBn ? `মর্নিং ইন্টেলিজেন্স দৈনিক অডিও ব্রিফিং (${new Date().toLocaleDateString()})` : `Morning Intelligence Daily Audio Briefing (${new Date().toLocaleDateString()})`,
    targetDurationSeconds: 180,
    host1Name: isBn ? 'সৌম্য' : 'Alex',
    host2Name: isBn ? 'অনন্যা' : 'Elena',
    dialogue,
    audioOverviewSummary: digest.executiveSummary || paper.title,
    generatedAt: new Date().toISOString(),
  };
}
