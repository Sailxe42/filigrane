/**
 * XMP / IPTC metadata layer.
 *
 * Writes the IPTC "Digital Source Type" (read by search engines, social networks
 * and photo tools to flag AI imagery), the IPTC 2025 AI properties, and a
 * `dcterms:provenance` link to the C2PA manifest, as recommended by C2PA.
 */

export interface XmpAiInfo {
  digitalSourceType: string;
  /** Name of the AI system used (IPTC Iptc4xmpExt:AISystemUsed). */
  aiSystem?: string;
  aiSystemVersion?: string;
  instanceId?: string;
  /** JUMBF URI of the active C2PA manifest. */
  provenance?: string;
}

const NS = {
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  Iptc4xmpExt: 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/',
  xmpMM: 'http://ns.adobe.com/xap/1.0/mm/',
  dcterms: 'http://purl.org/dc/terms/',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function description(info: XmpAiInfo): string {
  const attrs = [
    `xmlns:Iptc4xmpExt="${NS.Iptc4xmpExt}"`,
    `xmlns:xmpMM="${NS.xmpMM}"`,
    `xmlns:dcterms="${NS.dcterms}"`,
    `Iptc4xmpExt:DigitalSourceType="${esc(info.digitalSourceType)}"`,
  ];
  if (info.aiSystem) attrs.push(`Iptc4xmpExt:AISystemUsed="${esc(info.aiSystem)}"`);
  if (info.aiSystemVersion) attrs.push(`Iptc4xmpExt:AISystemVersionUsed="${esc(info.aiSystemVersion)}"`);
  if (info.instanceId) attrs.push(`xmpMM:InstanceID="${esc(info.instanceId)}"`);
  if (info.provenance) attrs.push(`dcterms:provenance="${esc(info.provenance)}"`);
  return `  <rdf:Description rdf:about=""\n    ${attrs.join('\n    ')}/>\n`;
}

/** Builds a fresh XMP packet. */
export function buildXmp(info: XmpAiInfo): string {
  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="${NS.x}">\n <rdf:RDF xmlns:rdf="${NS.rdf}">\n` +
    description(info) +
    ` </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`
  );
}

const OWN_PROPS = ['Iptc4xmpExt:DigitalSourceType', 'Iptc4xmpExt:AISystemUsed', 'Iptc4xmpExt:AISystemVersionUsed', 'xmpMM:InstanceID', 'dcterms:provenance'];

/** Adds our properties to an existing packet (removing stale copies), or creates one. */
export function mergeXmp(existing: string | undefined, info: XmpAiInfo): string {
  if (!existing || !existing.includes('</rdf:RDF>')) return buildXmp(info);
  let xmp = existing;
  for (const prop of OWN_PROPS) {
    xmp = xmp.replace(new RegExp(`\\s${prop}="[^"]*"`, 'g'), '');
    xmp = xmp.replace(new RegExp(`<${prop}>[\\s\\S]*?</${prop}>`, 'g'), '');
  }
  return xmp.replace('</rdf:RDF>', `${description(info)} </rdf:RDF>`);
}

function prop(xmp: string, name: string): string | undefined {
  const attr = new RegExp(`${name}="([^"]*)"`).exec(xmp);
  if (attr) return attr[1];
  const el = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xmp);
  return el?.[1];
}

export interface XmpReport {
  present: boolean;
  digitalSourceType?: string;
  aiSystem?: string;
  provenance?: string;
}

export function readXmpAiInfo(xmp: string | undefined): XmpReport {
  if (!xmp) return { present: false };
  return {
    present: true,
    digitalSourceType: prop(xmp, 'Iptc4xmpExt:DigitalSourceType'),
    aiSystem: prop(xmp, 'Iptc4xmpExt:AISystemUsed'),
    provenance: prop(xmp, 'dcterms:provenance'),
  };
}
