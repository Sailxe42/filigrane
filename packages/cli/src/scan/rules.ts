/**
 * Static heuristics that look for AI features needing transparency measures.
 *
 * These rules are an aid, not a legal assessment: they flag code that *looks*
 * like a chatbot, an image/audio generator or a deepfake tool, and check
 * whether the project shows signs of the matching transparency measure.
 */

export type Level = 'error' | 'warning' | 'note';

export interface Rule {
  id: string;
  name: string;
  level: Level;
  article: string;
  summary: string;
  help: string;
}

export const RULES: Record<string, Rule> = {
  'FG001': {
    id: 'FG001',
    name: 'chatbot-without-disclosure',
    level: 'error',
    article: 'AI Act Art. 50(1)',
    summary: 'Conversational AI without a visible "you are talking to an AI" disclosure',
    help: 'Show a disclosure at the latest at the first interaction, e.g. <ai-disclosure> from @filigrane/ui.',
  },
  'FG002': {
    id: 'FG002',
    name: 'generated-image-not-marked',
    level: 'error',
    article: 'AI Act Art. 50(2)',
    summary: 'AI-generated images without machine-readable marking',
    help: 'Mark outputs with at least two layers (e.g. markImage() from @filigrane/core: C2PA + watermark + IPTC).',
  },
  'FG003': {
    id: 'FG003',
    name: 'generated-audio-video',
    level: 'warning',
    article: 'AI Act Art. 50(2)',
    summary: 'AI-generated audio or video: machine-readable marking required',
    help: 'Check that your provider watermarks outputs or add C2PA/watermarking; Filigrane audio/video support is on the roadmap.',
  },
  'FG004': {
    id: 'FG004',
    name: 'deepfake-capability',
    level: 'warning',
    article: 'AI Act Art. 50(4)',
    summary: 'Face/voice synthesis capability: deepfakes must be disclosed by deployers',
    help: 'Label deepfakes visibly (e.g. <ai-label kind="modified">) and keep the label when content is shared.',
  },
  'FG005': {
    id: 'FG005',
    name: 'generated-text',
    level: 'note',
    article: 'AI Act Art. 50(2) and 50(4)',
    summary: 'AI-generated text: mark outputs and label texts published on matters of public interest',
    help: 'Use markText() for machine-readable marking and <ai-label> for published texts not reviewed by an editor.',
  },
};

export interface Pattern {
  re: RegExp;
  what: string;
}

/** Imports of generative-AI SDKs (JavaScript/TypeScript and Python). */
export const AI_SDK: Pattern[] = [
  {
    re: /(?:from\s+|require\(\s*|import\(\s*)["'](openai|@anthropic-ai\/sdk|ai|@ai-sdk\/[\w-]+|@google\/genai|@google\/generative-ai|@mistralai\/mistralai|cohere-ai|langchain|@langchain\/[\w-]+|replicate|@huggingface\/inference|groq-sdk|together-ai|@fal-ai\/client|@fal-ai\/serverless-client|ollama|@huggingface\/transformers|@xenova\/transformers|elevenlabs|@elevenlabs\/elevenlabs-js)["']/,
    what: 'generative AI SDK',
  },
  {
    re: /^\s*(?:from|import)\s+(openai|anthropic|google\.genai|google\.generativeai|mistralai|cohere|langchain\w*|replicate|transformers|diffusers|groq|together|fal_client|ollama|elevenlabs)\b/m,
    what: 'generative AI SDK',
  },
];

export const CHAT: Pattern[] = [
  { re: /\buse(?:Chat|Assistant)\s*\(/, what: 'chat UI hook' },
  { re: /\bchat\.completions\.create\s*\(/, what: 'chat completion call' },
  { re: /\bmessages\.(?:create|stream)\s*\(/, what: 'messages API call' },
  { re: /\b(?:streamText|generateText)\s*\(\s*\{[^}]*\bmessages\b/s, what: 'chat generation call' },
  { re: /\bclient\.chat\.(?:complete|stream)\s*\(/, what: 'chat API call' },
  { re: /\.chat\s*\(\s*(?:model\s*=|\{)/, what: 'chat API call' },
];

export const IMAGE_GEN: Pattern[] = [
  { re: /\bimages\.(?:generate|edit|create_variation|createVariation)\s*\(/, what: 'image generation call' },
  { re: /\b(?:experimental_)?generateImage\s*\(/, what: 'image generation call' },
  { re: /\b(?:StableDiffusion\w*Pipeline|DiffusionPipeline|FluxPipeline|AutoPipelineForText2Image)\b/, what: 'diffusion pipeline' },
  { re: /\bfal\.(?:subscribe|run)\s*\(\s*["'][^"']*(?:flux|sdxl|stable-diffusion|image|recraft|ideogram)/i, what: 'image model call' },
  { re: /\breplicate\.run\s*\(\s*["'][^"']*(?:flux|sdxl|stable-diffusion|image|imagen|ideogram|recraft)/i, what: 'image model call' },
  { re: /\btextToImage\s*\(/, what: 'image generation call' },
];

export const AUDIO_VIDEO_GEN: Pattern[] = [
  { re: /\baudio\.speech\.create\s*\(/, what: 'speech synthesis call' },
  { re: /\b(?:experimental_)?generateSpeech\s*\(/, what: 'speech synthesis call' },
  { re: /\btextToSpeech\.(?:convert|stream)\s*\(/, what: 'speech synthesis call' },
  { re: /\b(?:generateVideo|videos\.(?:generate|create))\s*\(/, what: 'video generation call' },
];

export const DEEPFAKE: Pattern[] = [
  { re: /\b(?:insightface|roop|facefusion|faceswap|face_swap|deepfacelab|simswap)\b/i, what: 'face swapping library' },
  { re: /\bvoices\.(?:add|ivc\.create|pvc\.create)\s*\(|\bclone_voice\b|\bvoiceClone\b/i, what: 'voice cloning call' },
];

/** Evidence that a visible disclosure exists somewhere in the project. */
export const DISCLOSURE_EVIDENCE: RegExp[] = [
  /<ai-disclosure\b/,
  /@filigrane\/ui/,
  /\bdisclosureText\s*\(/,
  /\bAiDisclosure\b/,
  /(?:you are|you're) (?:chatting|talking|interacting) with an? (?:AI|artificial intelligence)/i,
  /(?:vous (?:échangez|discutez|parlez|conversez) avec (?:un|une) (?:système d[’']IA|IA|intelligence artificielle|assistant IA))/i,
  /\bKI-System\b|\bsistema de IA\b|\bsistema di IA\b|\bAI-systeem\b/i,
];

/** Evidence that generated images are marked. */
export const MARKING_EVIDENCE: RegExp[] = [
  /\bmarkImage\s*\(/,
  /@filigrane\/core/,
  /\bc2pa\b|@contentauth\//i,
  /\bsign[-_]ai[-_]media\b/,
  /\btrustmark\b|\bsynthid\b|\bwatermark\w*\s*\(/i,
];
