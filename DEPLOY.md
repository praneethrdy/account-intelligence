# Deploying: Vercel (frontend) + Render (backend)

Once deployed, both run 24/7 on the providers' servers. You don't need your
computer on. Every `git push` to `main` redeploys both automatically.

```
Browser ──► Vercel (React static site) ──► Render (FastAPI + SQLite) ──► OpenRouter
                                          VITE_API_BASE_URL      key stays on Render
```

Order matters: **GitHub → Render → Vercel → back to Render** (to allow the
Vercel URL).

---

## Step 1: Push the code to GitHub

1. Go to https://github.com/new, name it `account-intelligence`, and choose
   **Private** or Public. **Don't** add a README, .gitignore or license
   (the repo already has them). Click **Create repository**.
2. In a terminal:
   ```powershell
   cd C:\Users\ADMIN\account-intelligence
   git remote add origin https://github.com/<your-username>/account-intelligence.git
   git push -u origin main
   ```
   Git will open a browser window to sign in the first time.

`.env`, the virtual environment, `node_modules` and the local database are
git-ignored. Your OpenRouter key is **not** in the repository.

## Step 2: Deploy the backend on Render

1. Sign up at https://render.com with your GitHub account.
2. Click **New → Blueprint** and pick the `account-intelligence` repo. Render
   reads `render.yaml` automatically.
3. It will ask for the secret values:
   - `OPENROUTER_API_KEY`: your OpenRouter key
   - `CORS_ORIGINS` and `APP_URL`: leave empty for now (you'll fill them in
     step 4)
4. Click **Apply**. The first build takes a few minutes.
5. Copy your service URL, e.g. `https://account-intelligence-api.onrender.com`.
6. Check it: open `https://<your-render-url>/api/health` in a browser. You
   should see `{"status":"ok","aiConfigured":true,...}`.

## Step 3: Deploy the frontend on Vercel

1. Sign up at https://vercel.com with your GitHub account.
2. Click **Add New → Project** and import the `account-intelligence` repo.
3. Set **Root Directory** to `frontend` (click *Edit* next to it). Vercel
   detects Vite; `vercel.json` handles the rest.
4. Under **Environment Variables** add:
   - `VITE_API_BASE_URL` = your Render URL from step 2, **without** a
     trailing slash, e.g. `https://account-intelligence-api.onrender.com`
5. Click **Deploy**. Copy your site URL, e.g.
   `https://account-intelligence.vercel.app`.

## Step 4: Allow the frontend to call the backend

Back in Render → your service → **Environment**:
- `CORS_ORIGINS` = your Vercel URL, e.g. `https://account-intelligence.vercel.app`
- `APP_URL` = the same URL

Save. Render redeploys automatically (about a minute). Open your Vercel URL.
It works.

> If you later add a custom domain or use Vercel preview URLs, add them to
> `CORS_ORIGINS` separated by commas.

---

## What to know about the free tiers

- **Cold starts.** Render's free backend sleeps after ~15 minutes idle. The
  first request after that takes **30–60 seconds** while it wakes up. Before
  an interview or demo, open the site a minute early (or hit
  `/api/health`) to wake it.
- **Demo data resets on each restart.** The free plan has no persistent disk,
  so `AUTO_SEED=true` reloads the 15 demo accounts every time the backend
  starts. Timestamps are relative to that moment, so "today" and "yesterday"
  are always correct. Signals you log with **Log a signal** last only until
  the next restart. That's fine for a demo. For persistence, use Render's
  paid disk or a hosted Postgres.
- **Free AI models vary.** `openrouter/free` picks whichever free model is
  available, so AI analysis can take anywhere from a few seconds to ~40
  seconds. If it fails, the app shows its graceful fallback.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site loads but shows "Cannot reach the API server" | Backend is waking up: wait 30–60 s and retry. Otherwise check `VITE_API_BASE_URL` on Vercel (no trailing slash), then **Redeploy** (Vite env vars are baked in at build time). |
| Browser console shows a CORS error | `CORS_ORIGINS` on Render must exactly match the Vercel URL, including `https://` and no trailing slash. |
| Header says "AI not configured" | `OPENROUTER_API_KEY` is missing on Render → Environment. |
| Refreshing `/accounts/1` gives a 404 | Make sure Vercel's Root Directory is `frontend` so `vercel.json` is used. |
