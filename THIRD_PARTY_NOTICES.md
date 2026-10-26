# Third-party notices

PitchPerfect includes or depends on the third-party software below. Each is used under its own
license, reproduced here.

## Motion Primitives

- Source: https://github.com/ibelick/motion-primitives (commit 120f64f)
- License: MIT
- Used for: `apps/web/components/motion/in-view.tsx` and `apps/web/components/motion/text-effect.tsx`, adapted from `components/core/in-view.tsx` and `components/core/text-effect.tsx`. Each file keeps this notice in its header and lists what was changed.

```
MIT License

Copyright (c) 2024 ibelick

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
```

The adapted components depend on `motion` 14.4.0 (MIT, https://github.com/motiondivision/motion), installed from npm.

## email-providers

- Package: `email-providers`, version 2.27.0
- Source: https://github.com/derhuerst/email-providers (its list is built from https://github.com/goware/emailproviders)
- License: ISC
- Used for: the free mail domains that never verify a company (`apps/api/src/services/company-verification.ts`). The package is installed from npm and not modified.

```
Copyright (c) 2025, Jannis R

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## disposable-email-domains-js

- Package: `disposable-email-domains-js`, version 1.26.0
- Source: https://github.com/mziyut/disposable-email-domains-js (its list comes from https://github.com/disposable-email-domains/disposable-email-domains)
- License: CC0 1.0 Universal (public domain dedication, https://creativecommons.org/publicdomain/zero/1.0/legalcode); no notice is required, it is listed here for completeness
- Used for: the throwaway mail domains that never verify a company (`apps/api/src/services/company-verification.ts`). The package is installed from npm and not modified.
