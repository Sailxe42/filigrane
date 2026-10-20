# The fgw1 watermark

`fgw1` is Filigrane's invisible image watermark. It is the layer that survives when metadata is stripped (social networks, screenshots of the file, format conversion). Algorithm identifier: `io.filigrane.fgw1`, recorded in the C2PA manifest as a `c2pa.soft-binding` assertion so the two layers can be linked.

## Payload

64 bits:

| Bits | Field |
| --- | --- |
| 8 | Magic `0xA5` |
| 4 | Version (`1`) |
| 4 | Flags: bit 0 = fully AI-generated, bit 1 = partly modified by AI |
| 32 | Identifier (by default a hash of the asset's C2PA instance ID) |
| 16 | CRC-16/CCITT over the 48 previous bits |

The magic byte and the CRC make accidental detection on unmarked images extremely unlikely (0 false positives in the benchmark).

## Embedding

1. Compute the luminance (BT.601) of the image.
2. Resample it with an area filter to a **canonical size**: 256 pixels on the long side, both dimensions rounded to multiples of 8. Working at this scale is what makes the mark survive resizing.
3. Split the canonical image into 8×8 blocks and compute their DCT. Six low/mid-frequency coefficients per block carry the mark: (0,2), (2,0), (1,2), (2,1), (1,3), (3,1).
4. A keyed pseudo-random generator assigns each coefficient ("chip") to one of the 64 bits and gives it a ±1 sign. Each bit is spread over hundreds of chips.
5. **Informed embedding**: each chip is pushed only as far as needed for its sign to match the bit, with a strength proportional to the block's texture (stronger in busy areas, gentle in flat ones) and a cap to avoid visible artefacts.
6. The difference between the marked and the original canonical images is upsampled bilinearly and added equally to R, G and B (luminance only, no colour shift).
7. A second, weaker pass compensates for losses due to resampling and clipping.

Images smaller than 64×64 pixels are left unchanged.

## Detection

The same canonical transform is applied, each chip's coefficient is clipped (to limit the weight of strong edges) and correlated with its sign; the sign of each bit's sum gives the bit. Detection succeeds only if the magic byte and the CRC are correct. The `confidence` value is the mean normalised correlation of the 64 bits.

## Robustness and limits

See the measured table in the [README](../README.md#watermark-robustness) and reproduce it with `node scripts/benchmark-watermark.mjs`.

- Survives: JPEG recompression down to quality 30, resizing (25 % to 150 %), brightness and contrast changes, metadata stripping.
- Does not survive yet: cropping, rotation, mirroring, heavy stylisation. A crop-resistant version is on the roadmap.

## Security considerations

- With the default public key, **anyone can detect** the mark — this is intended for transparency (the Code of Practice asks for detection by third parties).
- A watermark is a transparency signal, not DRM: a determined attacker who knows the algorithm can attenuate it. The C2PA layer provides tamper evidence; the watermark provides resilience. Use both.
- Providers can pass a private `key` to `markImage({ watermark: { key } })` and `verifyImage({ watermarkKey })` if they want detection limited to themselves.

## Prior art

Spread-spectrum watermarking in the DCT domain is a classic technique from the 1990s literature (for example Cox et al., 1997). fgw1 is an original implementation of these well-known ideas.
