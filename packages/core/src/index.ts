/**
 * @filigrane/core — mark, label and verify AI-generated content.
 *
 * Pure TypeScript, zero native dependencies: runs in Node.js 20+, browsers,
 * Deno, Bun and edge runtimes (anything with WebCrypto).
 *
 * This library implements technical measures; it is not legal advice.
 */

// High-level API
export {
  markImage,
  verifyImage,
  VERSION,
  type AiInvolvement,
  type MarkImageOptions,
  type MarkImageResult,
  type Verdict,
  type VerifyImageOptions,
  type VerifyImageResult,
} from './image/image.ts';
export {
  markText,
  readText,
  stripTextMarks,
  aiTextAttributes,
  encodeTextMarker,
  type MarkTextOptions,
  type ReadTextResult,
  type TextMarkPayload,
} from './text/text.ts';

// Signing
export { createLocalSigner, createDevSigner, type Signer, type SigningAlgorithm, type LocalSignerOptions } from './crypto/signer.ts';
export {
  generateDevCertificateChain,
  parseCertificate,
  pemToDerList,
  derToPem,
  type Certificate,
  type DevCertificateChain,
} from './crypto/x509.ts';

// C2PA
export { signAsset, newManifestLabel, type SignManifestOptions, type AssertionInput, type GeneratorInfo } from './c2pa/builder.ts';
export { readC2pa, type C2paReport, type ManifestReport, type ValidationEntry, type SignatureInfo, type ActionInfo, type ReadOptions } from './c2pa/reader.ts';
export { DIGITAL_SOURCE_TYPE, AI_SOURCE_TYPES, LABEL, shortSourceType } from './c2pa/labels.ts';
export { containerFor, sniffMimeType, jpegContainer, pngContainer, type AssetContainer } from './containers/container.ts';

// Watermark
export {
  embedWatermark,
  detectWatermark,
  payloadIdFrom,
  WATERMARK_ALG,
  type WatermarkPayload,
  type DetectResult,
  type EmbedOptions,
} from './watermark/watermark.ts';

// Metadata & images
export { buildXmp, mergeXmp, readXmpAiInfo, type XmpAiInfo, type XmpReport } from './xmp/xmp.ts';
export { decodeImage, encodeImage, detectFormat, type ImageFormat } from './image/codec.ts';
export type { Raster } from './image/raster.ts';
