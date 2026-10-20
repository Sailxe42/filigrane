#!/usr/bin/env node
/**
 * filigrane — command-line tool for AI transparency (EU AI Act Article 50).
 */
import { parseArgs } from 'node:util';
import { CLI_VERSION, cmdKeygen, cmdMark, cmdScan, cmdVerify } from './commands.ts';
import { c } from './term.ts';

const HELP = `${c.bold('filigrane')} ${CLI_VERSION} — mark, label and verify AI-generated content

${c.bold('Usage')}
  filigrane mark <file> [options]      Mark an AI-generated image (JPEG/PNG) or text (.txt/.md)
  filigrane verify <files...>          Check files for C2PA, IPTC metadata, watermark and text markers
  filigrane scan [dir]                 Find chatbots/generators lacking transparency measures
  filigrane keygen                     Create a development signing certificate

${c.bold('mark')}
  -o, --output <file>       Output path (default: <name>.ai.<ext>)
  -m, --model <name@ver>    AI system that produced the content
      --modified            Real content partly modified by AI (default: fully generated)
      --cert <pem> --key <pem>
                            Signing certificate chain and private key (files or PEM text;
                            or env FILIGRANE_CERT / FILIGRANE_KEY)
      --dev                 Sign with a throw-away development certificate
      --no-watermark --no-metadata --no-c2pa
                            Disable a layer
      --strength <n>        Watermark strength (default 1)
      --quality <n>         JPEG quality when re-encoding (default 92)

${c.bold('verify')}
      --json                Machine-readable output
      --trust <pem>         Trusted CA certificates (C2PA trust list)

${c.bold('scan')}
  -f, --format <fmt>        text (default) | json | sarif | markdown
  -o, --output <file>       Write the report to a file
      --fail-on <level>     error (default) | warning | never

${c.bold('keygen')}
      --out <dir>           Output directory (default .filigrane)
      --name <org>          Organisation name in the certificate
      --days <n>            Validity in days (default 365)

Not legal advice. Docs: https://github.com/Sailxe42/filigrane`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    console.log(CLI_VERSION);
    return 0;
  }

  if (command === 'mark') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      allowNegative: true,
      options: {
        output: { type: 'string', short: 'o' },
        model: { type: 'string', short: 'm' },
        modified: { type: 'boolean' },
        cert: { type: 'string' },
        key: { type: 'string' },
        dev: { type: 'boolean' },
        watermark: { type: 'boolean', default: true },
        metadata: { type: 'boolean', default: true },
        c2pa: { type: 'boolean', default: true },
        strength: { type: 'string' },
        quality: { type: 'string' },
      },
    });
    if (positionals.length !== 1) throw new Error('mark expects exactly one input file');
    return cmdMark(positionals[0], {
      ...values,
      strength: values.strength ? Number(values.strength) : undefined,
      quality: values.quality ? Number(values.quality) : undefined,
    });
  }

  if (command === 'verify') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { json: { type: 'boolean' }, trust: { type: 'string' } },
    });
    if (!positionals.length) throw new Error('verify expects at least one file');
    return cmdVerify(positionals, values);
  }

  if (command === 'scan') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { format: { type: 'string', short: 'f' }, output: { type: 'string', short: 'o' }, 'fail-on': { type: 'string' } },
    });
    return cmdScan(positionals[0] ?? '.', { format: values.format, output: values.output, failOn: values['fail-on'] });
  }

  if (command === 'keygen') {
    const { values } = parseArgs({
      args: rest,
      options: { out: { type: 'string' }, name: { type: 'string' }, days: { type: 'string' } },
    });
    return cmdKeygen({ ...values, days: values.days ? Number(values.days) : undefined });
  }

  throw new Error(`Unknown command "${command}". Run "filigrane --help".`);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: Error) => {
    console.error(c.red(`error: ${err.message}`));
    process.exitCode = 2;
  },
);
