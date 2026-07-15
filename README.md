# CreoOS

CreoOS is a creator-business operating system that brings content, tasks, courses, sponsors, affiliates, analytics, and team operations into one workspace with role-aware access and InsForge-backed authentication.

## Highlights

- Creator workspace dashboard with modular navigation
- Email/password authentication, password reset, and onboarding
- Role-aware team access and protected workspace routes
- Content, tasks, courses, sponsors, affiliates, analytics, and settings modules
- InsForge SDK integration for auth, database access, and server-side sessions
- Security headers and a production-ready Next.js build for Vercel

## Screenshots

These screenshots were captured from the running app and are stored in `docs/screenshots/`.

![CreoOS sign-in screen](docs/screenshots/sign-in.png)

![CreoOS sign-up screen](docs/screenshots/sign-up.png)

## Local Setup

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
```

Fill in the public InsForge values in `.env.local`, then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

`.env*` files are ignored by Git. Keep the InsForge admin API key server-only and out of GitHub, Vercel client variables, screenshots, logs, and documentation.

See [.env.example](.env.example) for the required variable names.

If you need local-only server tooling, add `INSFORGE_URL` and `INSFORGE_API_KEY` to `.env.local` and keep that file untracked.

## Verification

```bash
npm run lint
npm run build
```

Vercel should use these environment variables for Preview and Production:

- `NEXT_PUBLIC_INSFORGE_URL`
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`

## Deployment

Import the repository into Vercel, add the environment variables above in Project Settings, and deploy. Vercel automatically detects the Next.js build.

For production, keep the GitHub `main` branch as the auto-deploy branch and avoid committing secrets or local environment files.

## Tech Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS · InsForge · Radix UI
