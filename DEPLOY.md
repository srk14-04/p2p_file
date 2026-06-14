# Deployment Guide — P2P Web Share

This app has **two parts that must be deployed separately**:

| Part | Folder | Host | Why |
| --- | --- | --- | --- |
| Frontend (React/Vite) | `client/` | **Vercel** (or Netlify) | Static files, served from a CDN |
| Signaling server (Node + Socket.io) | `server/` | **Render** (or Railway) | Long-running process holding live WebSocket connections — cannot run on Vercel's serverless functions |

> A share link only works across the internet once **both** parts are on public URLs.
> While running on `localhost`, links only work on your own machine.

Deploy the **backend first** so you have its URL to give the frontend.

---

## 1. Backend → Render

### Option A: Blueprint (one click)
This repo includes [`render.yaml`](render.yaml).
1. Push the repo to GitHub.
2. Render Dashboard → **New** → **Blueprint** → pick your repo.
3. When prompted, set the `CLIENT_URL` env var (see below). You can use a placeholder for now and update it after the frontend is deployed.

### Option B: Manual Web Service
1. Render Dashboard → **New** → **Web Service** → connect your GitHub repo.
2. Settings:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (fine for a demo)
3. **Environment Variables:**
   - `CLIENT_URL` = your frontend URL, e.g. `https://your-app.vercel.app`
     (You can list several comma-separated, e.g. `http://localhost:5173,https://your-app.vercel.app`, to test locally and in prod against the same server.)
   - *(Do **not** set `PORT` — Render injects it automatically and the server already reads `process.env.PORT`.)*
4. Deploy. Copy the public URL, e.g. `https://p2p-webshare.onrender.com`.

> **Free-tier note:** Render's free instances sleep after ~15 min idle. The first
> connection after a nap takes ~30–50s to wake up — normal, not a bug.

---

## 2. Frontend → Vercel

1. Edit [`client/.env.production`](client/.env.production):
   ```
   VITE_SIGNALING_URL=https://p2p-webshare.onrender.com   # your Render URL from step 1
   ```
2. Vercel Dashboard → **Add New** → **Project** → import your repo.
   - **Root Directory:** `client`
   - Framework preset: **Vite** (auto-detected)
   - Build Command: `npm run build` · Output Directory: `dist` (defaults are correct)
3. Deploy. Copy the public URL, e.g. `https://your-app.vercel.app`.
4. Go back to Render → update `CLIENT_URL` to this Vercel URL → let it redeploy
   (this is required for CORS — the server rejects origins not in `CLIENT_URL`).

`client/vercel.json` already rewrites all routes to `index.html`, so deep links
like `/room/<id>` work on refresh.

---

## 3. TURN server (so "different city" actually connects)

WebRTC needs to punch through both peers' routers/firewalls.

- **STUN** (already configured) works when at least one peer is on a friendly NAT.
- **TURN** is needed when peers are on networks that block direct P2P — common
  with mobile data, office/campus Wi-Fi, and symmetric NAT. Without TURN, those
  transfers **never connect** and the receiver gets nothing.

By default the app falls back to a **free public TURN relay** (Open Relay), which
is fine for a demo. For reliability, get your own credentials:

1. Sign up free at <https://dashboard.metered.ca/> → create a TURN app → copy the
   credentials (or use Twilio / self-host coturn).
2. Add to `client/.env.production` and redeploy the frontend:
   ```
   VITE_TURN_URL=turn:your-turn-host:443
   VITE_TURN_USERNAME=your-username
   VITE_TURN_CREDENTIAL=your-credential
   ```

---

## 4. Verify

1. Open `https://your-app.vercel.app`, drop a file, copy the share link.
2. Open the link on **another device / network** (e.g. your phone on mobile data).
3. Watch progress reach 100% → click **Save File to Device** → the file downloads.

If it connects on the same Wi-Fi but not across networks, that's the TURN step (#3).
If nothing connects at all, check the browser console for the signaling URL and
confirm `CLIENT_URL` on Render matches your Vercel domain exactly (no trailing slash).
