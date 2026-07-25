# LinuxAI — Learn Linux with an AI tutor


A web app (single HTML file) for learning Linux from scratch: conversational AI tutor (Gemini), a **simulated** Linux terminal for practicing real commands risk-free, progressive lessons, verifiable exercises, and a gamification system with XP, streak, and achievements.

## How to try it locally

No installation or build needed. Just open `index.html` in any browser, or serve it with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```


## Gemini API key (optional but recommended)

The AI tutor works in demo mode without configuration (basic predefined responses), but for the full tutor:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and generate a free API key.
2. Inside the app, in the **AI Tutor** tab, paste the key and click "Save".
3. The key is saved only in each user's browser (localStorage) — it's never sent to any server of ours, it goes directly from your browser to Google's API.


## How it's built

- `index.html` — structure and styles (single stylesheet with CSS variables, no frameworks).
- `app.js` — all the logic: simulated filesystem, command interpreter, terminal engine, Gemini API calls, lesson curriculum, exercise bank with automatic verification, XP/levels/streak/achievements, all persisted in `localStorage`.
- No external dependencies, no build step — one file, open and it works.

