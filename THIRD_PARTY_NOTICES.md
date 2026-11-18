# Third-party notices

PII Router is licensed under the Apache License 2.0 (see `LICENSE`).
It includes or depends on the third-party work listed here, each under its own license.
This list is the disclosure of pre-existing code that the #BuildHybridAI rules ask for.

## Source code copied into this repository

These files were copied from the libraries' public registries on 2026-11-18 and adapted to this project's TypeScript and lint rules; each file starts with a header naming its source and the changes made.

| File | Library | Source | License |
|---|---|---|---|
| `src/components/vendor/animated-beam.tsx` | Magic UI | https://magicui.design/r/animated-beam.json | MIT (below) |
| `src/components/vendor/border-beam.tsx` | Magic UI | https://magicui.design/r/border-beam.json | MIT (below) |
| `src/components/vendor/decrypted-text.tsx` | React Bits | https://reactbits.dev/r/DecryptedText-TS-TW.json | MIT + Commons Clause (below) |
| `src/components/vendor/text-generate-effect.tsx` | Aceternity UI | https://ui.aceternity.com/registry/text-generate-effect.json | Aceternity UI licence, https://ui.aceternity.com/licence |

Notes on the two non-MIT licences, for the maintainer to judge:

- React Bits allows use and distribution "as part of an application, website, or product" and forbids selling or redistributing "the components themselves"; here the component is part of the app and is not offered on its own.
- The Aceternity UI licence allows "end products", including ones that are "freely distributed", and forbids re-distributing an item "as a stock image or its source files"; here the component is part of the app's source. If that reading is judged too generous, replace `text-generate-effect.tsx`, which is a cosmetic reveal effect and nothing depends on it.

21st.dev components were also considered, but its registry requires signing in, so none are included.

## npm dependencies

Runtime dependencies (from `package.json`), with the license each package declares:

| Package | License |
|---|---|
| firebase | Apache-2.0 |
| react, react-dom | MIT |
| motion | MIT |
| clsx | MIT |
| tailwind-merge | MIT |
| lucide-react | ISC |
| @fontsource-variable/hanken-grotesk | OFL-1.1 (the Hanken Grotesk font) |
| @fontsource/jetbrains-mono | OFL-1.1 (the JetBrains Mono font) |

Development tools (Vite, Vitest, TypeScript, ESLint, Tailwind CSS, Playwright, Testing Library) are used to build and test the project and are not shipped in it.

## Magic UI license

MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## React Bits license

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

The same restriction covers the React Bits tools (Background Studio, Texture Lab, Shape Magic, Center Stage, Sound Lab and any tools added later) and the sounds in the sound library. **You may not sell, sublicense, or redistribute the tools or the sounds themselves, or offer the tools or a substantially similar copy of them as a hosted service-whether alone, in a bundle, or as a ported version.**

What you make with the tools is yours to use. You can use exported code, images, videos, and audio files in any personal or commercial application, website, or product, including paid ones. **You may not sell or redistribute the exports on their own, either individually or as the product itself, such as a sound, texture, background, or template pack.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
