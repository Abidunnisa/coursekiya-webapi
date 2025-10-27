import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load .env when running locally via npm run dev
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('SUPABASE_URL or SUPABASE_KEY not set. Set them in .env or Vercel environment variables.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/categories', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('categories')
      .select('*')
      .order("category_id", { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/courses', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('courses')
      .select('*, instructors(*)')
      .order("course_id", { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/webinars', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('webinars')
      .select('*, instructors(*)')
      .order("webinar_id", { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/courses/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('courses')
      .select('*, instructors(*)')
      .eq('course_id', id)
      .single();
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/webinars/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('webinars')
      .select('*, instructors(*)')
      .eq('webinar_id', id)
      .single();
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

if (process.env.NODE_ENV !== 'production' && require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Dev server listening on http://localhost:${port}`));
}

export default app;
