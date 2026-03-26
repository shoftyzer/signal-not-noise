import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/schema';
import signalsRouter from './routes/signals';
import dashboardRouter from './routes/dashboard';
import ingestRouter from './routes/ingest';
import watchlistRouter from './routes/watchlist';
import newsSearchRouter from './routes/newsSearch';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', apiLimiter);
app.use(express.urlencoded({ extended: true }));

app.use('/api/signals', signalsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/news', newsSearchRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDb();

app.listen(PORT, () => {
  console.log(`Signal Scanner API running on http://localhost:${PORT}`);
});

export default app;
