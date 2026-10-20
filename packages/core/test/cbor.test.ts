import { describe, expect, it } from 'vitest';
import { decodeCbor, encodeCbor, Tagged } from '../src/cbor/cbor.ts';
import { fromHex, toHex } from '../src/util/bytes.ts';

// Test vectors from RFC 8949, Appendix A.
const vectors: [unknown, string][] = [
  [0, '00'],
  [23, '17'],
  [24, '1818'],
  [100, '1864'],
  [1000, '1903e8'],
  [1000000, '1a000f4240'],
  [1000000000000, '1b000000e8d4a51000'],
  [-1, '20'],
  [-1000, '3903e7'],
  [1.1, 'fb3ff199999999999a'],
  [false, 'f4'],
  [true, 'f5'],
  [null, 'f6'],
  ['', '60'],
  ['IETF', '6449455446'],
  ['ü', '62c3bc'],
  [[1, [2, 3], [4, 5]], '8301820203820405'],
  [{ a: 1, b: [2, 3] }, 'a26161016162820203'],
];

describe('CBOR', () => {
  it.each(vectors)('encodes %j as %s', (value, hex) => {
    expect(toHex(encodeCbor(value))).toBe(hex);
    expect(decodeCbor(fromHex(hex))).toEqual(value);
  });

  it('round-trips byte strings, maps with integer keys and tags', () => {
    const value = new Tagged(18, [new Uint8Array([1, 2, 3]), new Map<number, unknown>([[1, -7], [33, [new Uint8Array(4)]]]), null]);
    const decoded = decodeCbor(encodeCbor(value)) as Tagged;
    expect(decoded.tag).toBe(18);
    const [bytes, map, nil] = decoded.value as [Uint8Array, Map<number, unknown>, null];
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(map.get(1)).toBe(-7);
    expect(nil).toBeNull();
  });

  it('decodes half-precision floats and indefinite-length items', () => {
    expect(decodeCbor(fromHex('f93c00'))).toBe(1);
    expect(decodeCbor(fromHex('f97bff'))).toBe(65504);
    expect(decodeCbor(fromHex('9f018202039f0405ffff'))).toEqual([1, [2, 3], [4, 5]]);
    expect(decodeCbor(fromHex('7f657374726561646d696e67ff'))).toBe('streaming');
  });

  it('rejects truncated input', () => {
    expect(() => decodeCbor(fromHex('6449455'))).toThrow();
  });
});
