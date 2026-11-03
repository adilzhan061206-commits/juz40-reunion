# 625 сөз · 30 күн

A mobile-first, offline vocabulary trainer: 625 English words in 30 days for the J-1 Work & Travel program, with a Kazakh interface.

- Lives at `/english/` on the deployed site (plain HTML/CSS/JS, no build step needed).
- `words.json` is the only word source and is unchanged from the original file.
- Progress is stored in `localStorage` (`w30.state.v1`); cached photo lookups are stored in `w30.img.v1`.
- `sw.js` caches the app for offline use. Bump `VERSION` in `sw.js` after changing app files.

Run locally: `npm run dev`, then open http://localhost:5173/english/index.html
