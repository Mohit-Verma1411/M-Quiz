# 🎯 M-Quiz — Ultimate Quiz Competition Platform

A modern, real-time online quiz competition website for **college events, coding competitions, GK quizzes and tech fests**.

Built with **Node.js + Express + SQLite (better-sqlite3) + Socket.io**, with a glassmorphism dark UI.

---

## ✨ Features

| Area | Highlights |
|------|-----------|
| **Home** | Hero section, glassmorphism cards, animated gradients, fully responsive |
| **Auth** | Signup / login / logout with bcrypt-hashed passwords + JWT cookies; roles: `admin` & `participant`; optional guest participation |
| **Admin** | Create/edit/delete quizzes, bulk question editor, publish/unpublish, live leaderboards, results, CSV export, winner announcement (with 🎤 voice!) |
| **Participant** | Join via 6-char quiz code, instructions flow, live countdown timer, one-question-at-a-time, change answers, auto-submit on timeout |
| **Leaderboard** | Real-time via Socket.io; ranked by **highest score**, then **lower time taken**; polling fallback every 5s; live-update indicator; duplicate submissions blocked via `UNIQUE` + `BEGIN IMMEDIATE` transactions |
| **Extra** | Profile page, 404/error pages, toasts, loading states, empty states, dark theme by default |

---

## 🛠 Tech Stack

- **Frontend:** EJS server-rendered pages + vanilla JS, custom CSS design system (no build step)
- **Backend:** Node.js, Express 4
- **Database:** SQLite via `better-sqlite3` (file: `quiz.db`)
- **Realtime:** Socket.io
- **Auth:** JWT (httpOnly cookie) + bcryptjs
- **Styling:** Hand-crafted CSS (`public/css/styles.css`)

---

## 📁 Project Structure

```
M-Quiz/
├── package.json
├── server.js                 # Express app + Socket.io wiring
├── seed.js                   # Sample data (admin, players, quizzes, attempts)
├── quiz.db                   # SQLite database (auto-created)
├── config/
│   └── database.js           # DB init + full schema
├── middleware/
│   └── auth.js               # JWT sign/verify, attachUser, requireAuth, requireAdmin
├── routes/
│   ├── auth.js               # signup / login / me / logout
│   ├── quizzes.js            # quiz CRUD + questions + join-by-code
│   ├── attempts.js           # start / submit / result (transactional)
│   ├── leaderboard.js        # GET leaderboard (polling fallback endpoint)
│   ├── admin.js              # dashboard / quizzes / results / CSV export
│   └── pages.js              # server-rendered HTML pages
├── services/
│   ├── attempt-service.js    # shared scoring + transactional submit (REST + socket)
│   ├── leaderboard.js        # ranking + refresh
│   └── realtime.js           # Socket.io hub (broadcast leaderboard)
├── views/                    # EJS templates
│   ├── partials/             # header / footer
│   ├── admin/                # dashboard, create/edit quiz, quizzes, results, live board
│   ├── participant/          # join, live quiz, result
│   └── home / login / signup / leaderboard / profile / error
└── public/
    ├── css/styles.css        # design system
    └── js/                   # main, quiz, leaderboard, admin, question-manager
```

---

## 🚀 Run Locally

Requires **Node.js 18+**.

```bash
# 1. install dependencies
npm install

# 2. (optional) create the database + default admin accounts
npm run seed        # creates quiz.db + organizer and admin accounts

# 3. start the server
npm start
```

Then open **http://localhost:3000**

> Without seeding, `npm start` still creates the empty DB (via `config/database.js`)
> and you can create a quiz after logging in.

---

## 🚀 Deploy on Render (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Mohit-Verma1411/M-Quiz)

Clicking the button above takes you to Render (free, no credit card required) and
deploys the `render.yaml` blueprint automatically:

- **Runtime:** Node 20 · **Free plan** · auto-deploy on pushes to `master`
- **AUTO_SEED=true** — a fresh/empty database is seeded with the default admins on boot
- **JWT_SECRET** auto-generated per deploy
- **Health check** at `/health`

> ⚠️ Render's free tier has **ephemeral storage**: the SQLite file (`quiz.db`)
> resets on redeploys. `AUTO_SEED` restores the admin accounts, so the app is
> always usable — but for durable data, add Render's **Persistent Disk** (paid)
> and set `DB_PATH` to it, or switch to a managed DB.

---

## ▲ Deploy on Vercel

The repo also ships with `vercel.json` + `api/index.js`, so it deploys as-is:

```bash
npx vercel --prod
```

On Vercel, `DB_PATH` defaults to `/tmp/quiz.db` (the only writable location in
a serverless function) and the default admins are auto-seeded on a cold start.

> ⚠️ Vercel has no persistent disk and no long-lived Socket.io connections:
> - Data written to `/tmp` is per-instance and can reset on a cold start.
> - The leaderboard automatically falls back to **5-second polling**; live
>   socket pushes are disabled. For a long-running event, use Render with a
>   persistent disk or a managed database.

---

## 🔑 Default Accounts (after `npm run seed`)

| Role | Email | Password |
|------|-------|----------|
| **Organizer** | `admin@quiz.com` | `Mohit@141106` |
| **Admin** | `admin@uiet.com` | `Uiet@123` |

Sign in as one of these accounts and create your first quiz from the admin
dashboard. Quiz codes are generated automatically for each quiz.

---

## 📡 Socket.io Events

**Client → Server**

| Event | Payload | Purpose |
|-------|---------|---------|
| `joinQuizRoom` | `{ quizId }` | Join a quiz's live room |
| `submitQuiz` | `{ quizId, userId, answers, timeTaken }` | Submit an attempt in real time |

**Server → Client**

| Event | Payload | Purpose |
|-------|---------|---------|
| `leaderboardUpdated` | `{ quizId, leaderboard }` | Live board refresh |
| `quizSubmitted` | `{ quizId, message }` | New submission confirmation |
| `error` | `{ message }` | Error reporting |

**Fallback:** if the socket connection drops or fails, the leaderboard page automatically polls `GET /api/leaderboard/:quizId` every 5 seconds.

---

## 🗄 Database Tables

`users`, `quizzes`, `questions`, `attempts`, `answers`, `leaderboard` — schema is defined in `config/database.js` exactly as specified.

Key integrity protections:
- `attempts.UNIQUE(user_id, quiz_id)` prevents duplicate submissions
- Submissions run inside a `BEGIN IMMEDIATE` transaction (exclusive write lock)
- `questions`/`answers` use `ON DELETE CASCADE` from their parents

---

## ⚠️ Notes for Production

- Change `JWT_SECRET` via the `JWT_SECRET` env var (defaults to a dev secret).
- The demo admin account is created by `seed.js` only; remove it before public deployment.
- For heavy concurrent play, consider `.env` and DB backups; WAL mode is already enabled.
- GIF-quality fonts are loaded from Google Fonts — swap to self-hosted if offline events.

MIT · Made for the arena. 🏆