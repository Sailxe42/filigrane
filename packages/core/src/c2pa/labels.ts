/** C2PA labels, JUMBF type UUIDs and IPTC vocabulary used by Filigrane. */

const c2paUuid = (fourcc: string) =>
  `${[...fourcc].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}-0011-0010-8000-00aa00389b71`;

export const UUID = {
  manifestStore: c2paUuid('c2pa'),
  manifest: c2paUuid('c2ma'),
  updateManifest: c2paUuid('c2um'),
  assertionStore: c2paUuid('c2as'),
  claim: c2paUuid('c2cl'),
  signature: c2paUuid('c2cs'),
  credentialStore: c2paUuid('c2vc'),
  cbor: c2paUuid('cbor'),
  json: c2paUuid('json'),
  embeddedFile: '40cb0c32-bb8a-489d-a70b-2ad6f47f4369',
} as const;

export const LABEL = {
  manifestStore: 'c2pa',
  assertionStore: 'c2pa.assertions',
  claimV1: 'c2pa.claim',
  claimV2: 'c2pa.claim.v2',
  signature: 'c2pa.signature',
  actions: 'c2pa.actions',
  actionsV2: 'c2pa.actions.v2',
  hashData: 'c2pa.hash.data',
  hashBmff: 'c2pa.hash.bmff.v2',
  softBinding: 'c2pa.soft-binding',
  trainingMining: 'cawg.training-mining',
} as const;

/** IPTC NewsCodes "digital source type" vocabulary (https://cv.iptc.org/newscodes/digitalsourcetype/). */
export const DIGITAL_SOURCE_TYPE = {
  trainedAlgorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  compositeWithTrainedAlgorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
  algorithmicallyEnhanced: 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced',
  algorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia',
  compositeSynthetic: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic',
  digitalCapture: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
} as const;

/** Source types that mean "generated or manipulated by a trained (AI) model". */
export const AI_SOURCE_TYPES = new Set<string>([
  DIGITAL_SOURCE_TYPE.trainedAlgorithmicMedia,
  DIGITAL_SOURCE_TYPE.compositeWithTrainedAlgorithmicMedia,
]);

export function shortSourceType(uri: string | undefined): string | undefined {
  return uri?.split('/').pop();
}
