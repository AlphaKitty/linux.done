# Open Source Package Layout

This folder is the **complete, self-contained** Chrome extension source for
**linux.done**. Publish *this directory* as the GitHub repository root.

```
linux.done/                     ← repository root after export
├── LICENSE                     MIT
├── README.md                   User-facing documentation (ZH + EN)
├── PUBLISH.md                  Maintainer release checklist
├── .gitignore                  node_modules, secrets, logs, packs
├── package.json                Metadata + icon/pack scripts
├── manifest.json               Chrome MV3 manifest (load this folder)
├── background.js               Service worker
├── content.js                  Page proxy / extraction (no visual mods)
├── content.css                 Reserved (empty)
├── lib/
│   ├── storage.js
│   ├── discourse.js
│   ├── matcher.js
│   ├── i18n.js
│   └── analytics.js            GA optional; API_SECRET empty by default
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── wechat-pay.png          Donation QR (options page)
│   ├── 赞赏码.png              Donation QR (README)
│   ├── 赞赏码1.png             Donation QR alt
│   └── generate-icons.cjs
└── scripts/
    └── export-clean.sh         Copy clean tree for a new git repo
```

## Do not publish from parent monorepo

The parent workspace may still track unrelated projects, `node_modules`,
Playwright dumps, or internal docs. Always export this folder first:

```bash
./scripts/export-clean.sh ../linux.done-oss
cd ../linux.done-oss
git init && git add . && git commit -m "chore: initial open-source release"
```

See [PUBLISH.md](./PUBLISH.md) for the full checklist.
