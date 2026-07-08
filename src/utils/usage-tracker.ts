// Mock / Stub usage tracker to bypass Firestore dependencies in ERP

export const USD_TO_VND = 100; // 100 VNĐ = 1 Credit

export const PRICING_TABLE: Record<string, {
  costPerUnitCredit: number;
  inputCostPerUnitCredit?: number;
  unit: string;
  label: string;
  category: 'video' | 'audio' | 'image' | 'text';
  note?: string;
}> = {
  'piapi-veo31-video-audio': {
    costPerUnitCredit: 81.0,
    unit: 'seconds',
    label: 'iGen video 3.1',
    category: 'video',
  },
  'piapi-veo31-video-fast-audio': {
    costPerUnitCredit: 40.5,
    unit: 'seconds',
    label: 'iGen video 3.1 Fast',
    category: 'video',
  },
  'piapi-veo31-video-fast-no-audio': {
    costPerUnitCredit: 20.25,
    unit: 'seconds',
    label: 'iGen video 3.1 Fast Silent',
    category: 'video',
  },
  'gemini-2.5-flash-preview-tts': {
    costPerUnitCredit: 0.1275,
    unit: 'seconds',
    label: 'iGen 2.5 Flash TTS',
    category: 'audio',
  },
  'gemini-2.5-pro-preview-tts': {
    costPerUnitCredit: 0.255,
    unit: 'seconds',
    label: 'iGen 2.5 Pro TTS',
    category: 'audio',
  },
  'eleven_flash_v1': {
    costPerUnitCredit: 0.15,
    unit: 'seconds',
    label: 'iGen audio Flash v1',
    category: 'audio',
  },
  'eleven_v3': {
    costPerUnitCredit: 0.35,
    unit: 'seconds',
    label: 'iGen audio v3',
    category: 'audio',
  },
  'eleven_flash_v2_5': {
    costPerUnitCredit: 0.15,
    unit: 'seconds',
    label: 'iGen audio Flash v2.5',
    category: 'audio',
  },
  'eleven_turbo_v2_5': {
    costPerUnitCredit: 0.20,
    unit: 'seconds',
    label: 'iGen audio Turbo v2.5',
    category: 'audio',
  },
  'eleven_multilingual_v2': {
    costPerUnitCredit: 0.30,
    unit: 'seconds',
    label: 'iGen audio Multilingual v2',
    category: 'audio',
  },
  'eleven_turbo_v2.5': {
    costPerUnitCredit: 0.20,
    unit: 'seconds',
    label: 'iGen audio Turbo v2.5',
    category: 'audio',
  },
  'gemini-3.1-flash-image-preview': {
    costPerUnitCredit: 27.5,
    unit: 'count',
    label: 'iGen 3.1 Flash Image',
    category: 'image',
  },
  'gemini-3-pro-image-preview': {
    costPerUnitCredit: 57,
    unit: 'count',
    label: 'iGen 3 Pro Image',
    category: 'image',
  },
  'gemini-2.5-flash-preview-image': {
    costPerUnitCredit: 13.75,
    unit: 'count',
    label: 'iGen 2.5 Flash Image',
    category: 'image',
  },
  'imagen-3.0-generate-002': {
    costPerUnitCredit: 27.5,
    unit: 'count',
    label: 'iGen Imagen 3.0 Pro',
    category: 'image',
  },
  'imagen-3.0-fast-generate-002': {
    costPerUnitCredit: 13.75,
    unit: 'count',
    label: 'iGen Imagen 3.0 Flash',
    category: 'image',
  },
  'nano-banana-pro': {
    costPerUnitCredit: 27.5,
    unit: 'count',
    label: 'iGen Image Pro',
    category: 'image',
  },
  'nano-banana-2': {
    costPerUnitCredit: 13.75,
    unit: 'count',
    label: 'iGen Image Flash',
    category: 'image',
  },
  'gemini-banana-pro': {
    costPerUnitCredit: 27.5,
    unit: 'count',
    label: 'iGen Gemini Image Pro',
    category: 'image',
    note: 'Google Gemini Imagen API',
  },
  'gemini-banana-flash': {
    costPerUnitCredit: 27.5,
    unit: 'count',
    label: 'iGen Gemini Image Flash',
    category: 'image',
    note: 'Google Gemini Imagen API',
  },
};

export function formatAiModelName(name: string): string {
  if (!name) return '';
  return name.replace(/-preview/g, '').toUpperCase();
}

export function estimateCost(model: string, amount: number, options?: { resolution?: string; inputAmount?: number }) {
  const pricing = PRICING_TABLE[model];
  if (!pricing) {
    return {
      costCredit: 0,
      costVND: 0,
      unit: 'unknown',
      category: 'text' as const,
      label: formatAiModelName(model),
    };
  }

  const multiplier = pricing.unit === '1k tokens' ? 1000 : 1;
  const scaledAmount = amount / multiplier;
  let costCredit = pricing.costPerUnitCredit * scaledAmount;
  const costVND = Math.round(costCredit * USD_TO_VND);

  return {
    costCredit: Math.round(costCredit * 100) / 100,
    costVND,
    unit: pricing.unit,
    category: pricing.category,
    label: formatAiModelName(pricing.label),
  };
}

export function estimateAudioDuration(text: string): number {
  return Math.max(1, Math.ceil(text.length / 13));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export async function recordUsage(params: any): Promise<void> {
  // Stubbed out - no database write on ERP frontend
  console.log(`[UsageTracker Stub] recordUsage stub:`, params);
  return Promise.resolve();
}
