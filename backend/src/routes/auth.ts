import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    res.status(500).json({ error: 'Auth is not configured on the server' });
    return;
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const usernameMatch = username === adminUsername;
  const passwordMatch = password === adminPassword;

  if (!usernameMatch || !passwordMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ username }, getJwtSecret(), { expiresIn: '8h' });
  res.json({ token, username });
});

// GET /api/auth/me — verify current token
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { username: string };
    res.json({ username: payload.username });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;
