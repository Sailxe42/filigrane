# filigrane

Command-line tool for AI transparency (EU AI Act Article 50).

```bash
npx filigrane scan .                                  # find chatbots and generators lacking transparency measures
npx filigrane scan . --format sarif -o filigrane.sarif # for GitHub code scanning
npx filigrane mark cover.png --model "Flux@1.1" --cert chain.pem --key key.pem
npx filigrane verify cover.ai.png
npx filigrane keygen                                  # development certificate
```

`scan` exits with code 1 when it finds errors (configure with `--fail-on error|warning|never`), so it can gate pull requests. Reports: `text`, `json`, `sarif`, `markdown`.

More: <https://github.com/Sailxe42/filigrane>. The scanner uses heuristics; it is not legal advice. MIT licence.
