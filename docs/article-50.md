# Article 50 of the AI Act, for developers

A practical summary of the EU AI Act transparency obligations and how to implement them with Filigrane. **This is not legal advice**: check your situation with a lawyer, and read the primary sources listed at the end.

## Dates

| Date | What applies |
| --- | --- |
| 2 August 2026 | Article 50 transparency obligations apply to all AI systems, whatever their risk class |
| 2 December 2026 | Marking obligation for generative systems that were already on the market before 2 August 2026 |

Fines for breaching Article 50 can reach €15 million or 3 % of worldwide annual turnover, whichever is higher (Article 99(4)).

## The obligations

| Article | Who | Obligation | Filigrane |
| --- | --- | --- | --- |
| 50(1) | Providers | Make sure people know they are interacting with an AI system (chatbots, voice assistants), unless it is obvious | `<ai-disclosure>`, `disclosureText()` |
| 50(2) | Providers | Mark AI-generated or manipulated audio, image, video and text in a machine-readable format, detectable as artificially generated | `markImage()`, `markText()`, `verifyImage()` |
| 50(3) | Deployers | Inform people exposed to emotion recognition or biometric categorisation | Out of scope |
| 50(4) | Deployers | Disclose deepfakes; label AI text published to inform the public on matters of public interest, unless it was reviewed under editorial responsibility | `<ai-label>` |

**Provider or deployer?** If you put an AI system on the market under your name — including an app that calls a third-party model API — you are likely a provider of that system. If you use an AI system in your own activity, you are a deployer. Many companies are both.

## The Code of Practice

The European Commission published a Code of Practice on marking and labelling AI-generated content on 10 June 2026; the Commission and the AI Board confirmed it is an adequate voluntary tool to demonstrate compliance. Key technical points:

- **At least two layers of machine-readable marking** where necessary, for example metadata plus a watermark, because no single technique is robust enough on its own.
- **Detection**: provide ways for deployers, users, authorities and researchers to verify that content is AI-generated.
- **Labels**: visible, at the latest when a person first sees the content, not obstructed, kept when the content is shared. The EU publishes free icons for this purpose.
- **Accessibility**: plain language, alternative text or ARIA labels for assistive technologies.

## Checklist

- [ ] Every chat interface shows `<ai-disclosure>` (or an equivalent message) before or at the first message.
- [ ] Every generated image goes through `markImage()` with a production signing certificate.
- [ ] Generated text that leaves your product is marked with `markText()`; published texts on matters of public interest are labelled with `<ai-label>` unless an editor reviews them.
- [ ] Deepfakes are labelled visibly and the label stays when the content is downloaded or reshared.
- [ ] `filigrane scan` runs in CI (GitHub Action) and its Markdown report is kept as evidence.
- [ ] Generated audio and video: check that your provider marks them (Filigrane support is on the roadmap).

## Sources

- [European Commission — Code of Practice on transparency of AI-generated content](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
- [European Commission — EU icons for labelling AI-generated content](https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content)
- [Goodwin — EU AI Act transparency obligations are now in force (August 2026)](https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force)
- [Jones Day — Final Code of Practice on marking and labelling (June 2026)](https://www.jonesday.com/en/insights/2026/06/european-commission-publishes-final-code-of-practice-on-marking-and-labelling-aigenerated-content)
