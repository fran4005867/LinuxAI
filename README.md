# LinuxAI — Learn Linux with an AI tutor

Project for the **TKS Prompt to Product Challenge**.

A web app (single HTML file) for learning Linux from scratch: conversational AI tutor (Gemini), a **simulated** Linux terminal for practicing real commands risk-free, progressive lessons, verifiable exercises, and a gamification system with XP, streak, and achievements.

**Why it exists:** almost all good Linux documentation and tutorials are in English. For someone just starting out, adding a language barrier to the technical barrier means many people never even try. LinuxAI teaches Linux in English, with a tutor that explains at each person's level and a terminal where there's no fear of "breaking something" — because it's not a real terminal, it's a sandbox.

## How to try it locally

No installation or build needed. Just open `index.html` in any browser, or serve it with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## How to publish it on GitHub Pages (for the submission link)

1. Create a new repo on GitHub (public), for example `linuxai`.
2. Upload `index.html` and `app.js` to the root of the repo:
   ```bash
   cd linux-ai
   git init
   git add index.html app.js README.md
   git commit -m "LinuxAI - TKS Prompt to Product Challenge"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/linuxai.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.
4. In a couple of minutes your link will be at `https://YOUR-USERNAME.github.io/linuxai/` — that's the link you paste in the submission form.

## Gemini API key (optional but recommended)

The AI tutor works in demo mode without configuration (basic predefined responses), but for the full tutor:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and generate a free API key.
2. Inside the app, in the **AI Tutor** tab, paste the key and click "Save".
3. The key is saved only in each user's browser (localStorage) — it's never sent to any server of ours, it goes directly from your browser to Google's API.

**Important for the demo/pitch:** if you're going to record the video showing the tutor responding with real AI, load your key before recording. If not, the rest of the app (terminal, lessons, exercises, progress) works 100% without a key.

## How it's built

- `index.html` — structure and styles (single stylesheet with CSS variables, no frameworks).
- `app.js` — all the logic: simulated filesystem, command interpreter, terminal engine, Gemini API calls, lesson curriculum, exercise bank with automatic verification, XP/levels/streak/achievements, all persisted in `localStorage`.
- No external dependencies, no build step — one file, open and it works.

## Quick pitch guide (2 minutes)

**What did you build?** An app for learning Linux with an AI tutor and a simulated terminal, in English.

**Why?** Because the language barrier + the technical barrier make learning Linux harder than it should be for so many English-speaking people. [Here you can add your own real experience: you worked with Termux, Arch Linux, Raspberry Pi — share a concrete anecdote of when something in Linux was hard due to lack of resources.]

**How did you build it with AI and prompting?** Describe the process: you started from a product plan (features, screens, phases), and used iterative prompting to build each piece — the terminal simulator with its own fake filesystem, the command engine, the Gemini API integration for the tutor, the lesson curriculum, the exercises with automatic verification, and the gamification system — all in a single self-contained HTML file for trivial publishing.

**Live demo (30-40 sec):** show the onboarding, type 2-3 commands in the terminal, solve an exercise, show the tutor answering a question.

**Future potential:** more languages, specialized learning paths (Linux for DevOps, for Raspberry Pi, for security), more complete terminal simulator (pipes, redirection), multiplayer/leaderboard with friends.
