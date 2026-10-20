/**
 * High-level image API: mark AI-generated images with up to three layers and
 * verify any image for all of them.
 *
 *   1. Invisible watermark  — survives recompression and resizing.
 *   2. IPTC / XMP metadata  — DigitalSourceType read by search engines and photo tools.
 *   3. Signed C2PA manifest — tamper-evident provenance (Content Credentials).
 *
 * Layers are applied in that order because the C2PA hard binding must cover
 * the final pixels and metadata.
 */
import { newManifestLabel, signAsset } from '../c2pa/builder.ts';
import { DIGITAL_SOURCE_TYPE, LABEL, AI_SOURCE_TYPES } from '../c2pa/labels.ts';
import { type C2paReport, readC2pa, type ReadOptions } from '../c2pa/reader.ts';
import { containerFor } from '../containers/container.ts';
import type { Signer } from '../crypto/signer.ts';
import { pemToDerList } from '../crypto/x509.ts';
import { toBase64, u32, uuidV4 } from '../util/bytes.ts';
import { type DetectResult, detectWatermark, embedWatermark, payloadIdFrom, WATERMARK_ALG } from '../watermark/watermark.ts';
import { mergeXmp, readXmpAiInfo, type XmpReport } from '../xmp/xmp.ts';
import { canProcessPixels, decodeImageAsync, detectFormat, encodeImageAsync } from './codec.ts';

export const VERSION = '0.1.2';

export type AiInvolvement = 'generated' | 'modified';

export interface MarkImageOptions {
  /**
   * Signs a C2PA manifest. Without a signer the C2PA layer is skipped and the
   * image still carries the watermark and IPTC metadata (two layers).
   */
  signer?: Signer;
  /** Your application, recorded as the C2PA claim generator. */
  generator?: { name: string; version?: string };
  /** The AI system that produced the content. */
  model?: { name: string; version?: string };
  /** "generated" (default): fully AI-generated. "modified": real content altered by AI. */
  involvement?: AiInvolvement;
  title?: string;
  /** Turn individual layers off (all on by default). */
  layers?: { watermark?: boolean; metadata?: boolean; c2pa?: boolean };
  watermark?: { strength?: number; key?: string };
  /** JPEG quality used when the watermark forces a re-encode (default 92). */
  quality?: number;
}

export interface MarkImageResult {
  bytes: Uint8Array;
  mimeType: string;
  layers: ('watermark' | 'metadata' | 'c2pa')[];
  /** Layers that could not be applied, and why (e.g. no WebP codec registered). */
  warnings: string[];
  instanceId: string;
  manifestLabel?: string;
  watermarkId?: number;
}

function sourceType(involvement: AiInvolvement | undefined): string {
  return involvement === 'modified' ? DIGITAL_SOURCE_TYPE.compositeWithTrainedAlgorithmicMedia : DIGITAL_SOURCE_TYPE.trainedAlgorithmicMedia;
}

/** Marks an AI-generated JPEG, PNG or WebP image. */
export async function markImage(input: Uint8Array, o: MarkImageOptions = {}): Promise<MarkImageResult> {
  const format = detectFormat(input);
  if (!format) throw new Error('Unsupported image format: JPEG, PNG and WebP are supported');
  const container = containerFor(input);
  const want = { watermark: true, metadata: true, c2pa: true, ...o.layers };
  const layers: MarkImageResult['layers'] = [];
  const warnings: string[] = [];
  const instanceId = `xmp:iid:${uuidV4()}`;
  const manifestLabel = want.c2pa && o.signer ? newManifestLabel() : undefined;
  const dst = sourceType(o.involvement);
  let bytes = container.strip(input);
  let watermarkId: number | undefined;

  // 1. Watermark (pixels)
  if (want.watermark && !canProcessPixels(format)) {
    warnings.push(`watermark skipped: no ${format} codec registered (see registerImageCodec)`);
  } else if (want.watermark) {
    const raster = await decodeImageAsync(bytes);
    if (raster.width < 64 || raster.height < 64) {
      warnings.push('watermark skipped: image smaller than 64×64 pixels');
    } else {
      watermarkId = payloadIdFrom(instanceId);
      const marked = embedWatermark(
        raster,
        { aiGenerated: o.involvement !== 'modified', aiModified: o.involvement === 'modified', id: watermarkId },
        o.watermark,
      );
      bytes = await encodeImageAsync(marked, format, { quality: o.quality, source: bytes });
      // Read it back: on tiny or very uniform images, compression can erase the mark.
      const check = detectWatermark(await decodeImageAsync(bytes), { key: o.watermark?.key });
      if (check.detected && check.payload?.id === watermarkId) {
        layers.push('watermark');
      } else {
        warnings.push('watermark not detectable after encoding (image too small or too uniform): not counted as a layer');
        watermarkId = undefined;
      }
    }
  }

  // 2. IPTC / XMP metadata
  if (want.metadata) {
    bytes = container.writeXmp(
      bytes,
      mergeXmp(container.readXmp(bytes), {
        digitalSourceType: dst,
        aiSystem: o.model?.name,
        aiSystemVersion: o.model?.version,
        instanceId,
        provenance: manifestLabel ? `self#jumbf=/c2pa/${manifestLabel}` : undefined,
      }),
    );
    layers.push('metadata');
  }

  // 3. C2PA manifest (hard binding over everything above)
  if (want.c2pa && !o.signer) warnings.push('C2PA layer skipped: no signer provided');
  if (want.c2pa && o.signer && manifestLabel) {
    // The first action of a new manifest must be c2pa.created; the source type says how AI was involved.
    const action: Record<string, unknown> = { action: 'c2pa.created', digitalSourceType: dst };
    if (o.model) action.softwareAgent = { name: o.model.name, ...(o.model.version ? { version: o.model.version } : {}) };
    const assertions: { label: string; data: unknown }[] = [{ label: LABEL.actionsV2, data: { actions: [action] } }];
    if (watermarkId !== undefined) {
      assertions.push({
        label: LABEL.softBinding,
        data: { alg: WATERMARK_ALG, blocks: [{ scope: {}, value: toBase64(u32(watermarkId)) }], pad: new Uint8Array(0) },
      });
    }
    const signed = await signAsset(bytes, container, {
      signer: o.signer,
      assertions,
      claimGenerator: { name: o.generator?.name ?? 'Filigrane', version: o.generator?.version ?? VERSION, 'io.filigrane': VERSION },
      title: o.title,
      instanceId,
      manifestLabel,
    });
    bytes = signed.bytes;
    layers.push('c2pa');
  }

  return { bytes, mimeType: container.mimeType, layers, warnings, instanceId, manifestLabel, watermarkId };
}

export type Verdict = 'ai-generated' | 'ai-modified' | 'no-ai-signal';

export interface VerifyImageResult {
  mimeType?: string;
  verdict: Verdict;
  /** Number of independent layers that report AI involvement. */
  signals: number;
  c2pa: C2paReport;
  metadata: XmpReport & { ai: boolean };
  watermark: DetectResult;
  /** True when a C2PA manifest is present but the file no longer matches it. */
  tampered: boolean;
  /** Checks that could not run (e.g. no WebP codec to read the watermark). */
  warnings: string[];
  width?: number;
  height?: number;
}

export interface VerifyImageOptions {
  /** PEM string or DER certificates of trusted C2PA signers / CAs. */
  trustAnchors?: string | Uint8Array[];
  watermarkKey?: string;
  /** Skip pixel decoding (faster, no watermark check). */
  skipWatermark?: boolean;
  now?: Date;
}

/** Inspects an image for C2PA, IPTC metadata and watermark signals. */
export async function verifyImage(input: Uint8Array, o: VerifyImageOptions = {}): Promise<VerifyImageResult> {
  const container = containerFor(input);
  const readOpts: ReadOptions = {
    now: o.now,
    trustAnchors: typeof o.trustAnchors === 'string' ? pemToDerList(o.trustAnchors) : o.trustAnchors,
  };
  const c2pa = await readC2pa(input, container, readOpts);
  let xmpPacket: string | undefined;
  try {
    xmpPacket = container.readXmp(input);
  } catch {
    // Damaged container: the other layers are still reported.
  }
  const xmp = readXmpAiInfo(xmpPacket);
  const metadata = { ...xmp, ai: !!xmp.digitalSourceType && AI_SOURCE_TYPES.has(xmp.digitalSourceType) };

  let watermark: DetectResult = { detected: false, confidence: 0, weakBits: 64 };
  let width: number | undefined;
  let height: number | undefined;
  const warnings: string[] = [];
  const format = detectFormat(input);
  if (!o.skipWatermark && format && !canProcessPixels(format)) {
    warnings.push(`watermark not checked: no ${format} codec registered (see registerImageCodec)`);
  } else if (!o.skipWatermark) {
    try {
      const raster = await decodeImageAsync(input);
      width = raster.width;
      height = raster.height;
      watermark = detectWatermark(raster, { key: o.watermarkKey });
    } catch {
      // Undecodable pixels: report the metadata layers only.
    }
  }

  const c2paAi = !!c2pa.active?.aiGenerated;
  const wmAi = watermark.detected && (watermark.payload?.aiGenerated || watermark.payload?.aiModified);
  const signals = [c2paAi, metadata.ai, wmAi].filter(Boolean).length;
  const modified =
    c2pa.active?.digitalSourceType === DIGITAL_SOURCE_TYPE.compositeWithTrainedAlgorithmicMedia ||
    metadata.digitalSourceType === DIGITAL_SOURCE_TYPE.compositeWithTrainedAlgorithmicMedia ||
    (watermark.payload?.aiModified ?? false);
  const tampered = !!c2pa.active && c2pa.active.validation.some((v) => v.code === 'assertion.dataHash.mismatch');

  return {
    mimeType: container.mimeType,
    verdict: signals === 0 ? 'no-ai-signal' : modified ? 'ai-modified' : 'ai-generated',
    signals,
    c2pa,
    metadata,
    watermark,
    tampered,
    warnings,
    width,
    height,
  };
}
