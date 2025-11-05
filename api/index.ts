/* Updated api/index.ts
  Includes existing endpoints plus new auth, trending, and progress tracking.
*/
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------------------------------------------------------
// NEW: AUTH & USER MIDDLEWARE
// ----------------------------------------------------------------

// Extend Express Request type to include the user
interface AuthenticatedRequest extends Request {
  user?: any;
}

// Middleware to verify JWT and get user
const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  // Verify token with Supabase
  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    return res.status(401).json({ error: 'Invalid token', details: error.message });
  }

  // Attach user to the request object
  req.user = data.user;
  next();
};

// ----------------------------------------------------------------
// NEW: AUTH ENDPOINTS
// ----------------------------------------------------------------

// User Registration
app.post('/auth/register', async (req, res) => {
  const { email, password, full_name } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password, and full_name are required' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: full_name // This data will be available on the auth.users table
      }
    }
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Also update the 'profiles' table we created
  if (data.user) {
    const { error: profileError } = await supabase
      .schema('coursekiya')
      .from('profiles')
      .update({ full_name: full_name })
      .eq('user_id', data.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      // Non-blocking, but good to log
    }
  }

  return res.status(201).json(data);
});

// User Login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ----------------------------------------------------------------
// NEW: TRENDING & PROGRESS ENDPOINTS
// ----------------------------------------------------------------

// GET Trending Courses
// Defines "trending" as top 4 courses with the most reviews
app.get('/api/courses/trending', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('courses')
      .select('*, instructors(*)')
      .order('review_count', { ascending: false }) // Assuming review_count is a number
      .limit(4);

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

// GET User's Enrolled Courses (Protected)
app.get('/api/my-courses', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user.id;
    console.log(userId)
    // Select courses based on the user's enrollments
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('enrollments')
      .select(`
        courses (
          *,
          instructors (*)
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }

    // The data is nested, so we flat-map it
    const courses = data ? data.map(e => e.courses) : [];
    return res.json(courses);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

// GET User's Progress for a Specific Course (Protected)
app.get('/api/my-progress/:courseId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user.id;
    const { courseId } = req.params;

    // 1. Get all lessons for the course
    const { data: lessons, error: lessonError } = await supabase
      .schema('coursekiya')
      .from('lessons')
      .select('lesson_id, title, lesson_order')
      .eq('course_id', courseId)
      .order('lesson_order', { ascending: true });

    if (lessonError) throw lessonError;

    // 2. Get all completed lessons for this user
    const { data: completed, error: progressError } = await supabase
      .schema('coursekiya')
      .from('user_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .in('lesson_id', lessons.map(l => l.lesson_id)); // Only fetch for this course's lessons

    if (progressError) throw progressError;

    const completedLessonIds = new Set(completed.map(p => p.lesson_id));

    // 3. Combine the data
    const progress = lessons.map(lesson => ({
      ...lesson,
      completed: completedLessonIds.has(lesson.lesson_id)
    }));

    return res.json(progress);

  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// POST Mark a lesson as complete (Protected)
app.post('/api/my-progress/complete', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user.id;
    const { lesson_id } = req.body;

    if (!lesson_id) {
      return res.status(400).json({ error: 'lesson_id is required' });
    }

    const { data, error } = await supabase
      .schema('coursekiya')
      .from('user_progress')
      .insert({
        user_id: userId,
        lesson_id: lesson_id
      })
      .select();

    if (error) {
      // Handle potential unique constraint violation (already completed)
      if (error.code === '23505') {
        return res.status(200).json({ message: 'Lesson already marked as complete' });
      }
      console.error('Supabase error:', error);
      return res.status(500).json({ error });
    }

    return res.status(201).json(data);

  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


// ----------------------------------------------------------------
// EXISTING API ENDPOINTS (from your file)
// ----------------------------------------------------------------

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

app.get('/api/topics', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('topics')
      .select('*')
      .eq('course_id', _req.query['course_id'])
      .order("order_number", { ascending: true });

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

app.get('/api/outcomes', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('outcomes')
      .select('*')
      .eq('course_id', _req.query['course_id'])
      .order("order", { ascending: true });

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

app.get('/api/objectives', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema('coursekiya')
      .from('objectives')
      .select('*')
      .eq('course_id', _req.query['course_id'])
      .order("order", { ascending: true });

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