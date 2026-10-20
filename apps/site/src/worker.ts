/// <reference lib="webworker" />
/**
 * Runs the heavy work off the main thread: verification, marking with a
 * throw-away demo certificate, and a "social network" simulation that strips
 * metadata and recompresses.
 */
import { createDevSigner, decodeImage, encodeImage, markImage, type Signer, verifyImage } from '@filigrane/core';

let signer: Promise<Signer> | undefined;

export type WorkerRequest =
  | { id: number; type: 'verify'; bytes: Uint8Array }
  | { id: number; type: 'mark'; bytes: Uint8Array }
  | { id: number; type: 'launder'; bytes: Uint8Array };

async function handle(req: WorkerRequest): Promise<unknown> {
  if (req.type === 'verify') return { report: await verifyImage(req.bytes) };
  if (req.type === 'mark') {
    signer ??= createDevSigner('Filigrane Demo (browser)');
    const marked = await markImage(req.bytes, { signer: await signer, model: { name: 'Demo model' }, generator: { name: 'Filigrane playground' } });
    return { bytes: marked.bytes, mimeType: marked.mimeType, report: await verifyImage(marked.bytes) };
  }
  // Social-network simulation: decode pixels, re-encode as JPEG q75 — all metadata is lost.
  const laundered = encodeImage(decodeImage(req.bytes), 'jpeg', { quality: 75 });
  return { bytes: laundered, mimeType: 'image/jpeg', report: await verifyImage(laundered) };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const result = await handle(e.data);
    self.postMessage({ id: e.data.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: (err as Error).message });
  }
};
