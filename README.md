# coursekiya-backend (Vercel-ready)

This backend is a small Express app adapted for Vercel serverless deployment.
It connects to Supabase to serve `courses` and `instructors`.

## Setup

1. Copy `.env.example` to `.env` and fill in your Supabase values:
   - SUPABASE_URL
   - SUPABASE_KEY

2. Install deps:
   ```
   npm install
   ```

3. Run locally (dev):
   ```
   npm run dev
   ```

4. Deploy:
   - Push to GitHub and import the repo on Vercel.
   - Set environment variables in Vercel dashboard and deploy.

## API Endpoints
- `GET /api/courses` — list courses with instructor
- `GET /api/courses/:id` — single course

