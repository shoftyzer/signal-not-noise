import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db/schema';
import signalsRouter from './routes/signals';
import dashboardRouter from './routes/dashboard';
import ingestRouter from './routes/ingest';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/signals', signalsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/ingest', ingestRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDb();

app.listen(PORT, () => {
  console.log(`Signal Scanner API running on http://localhost:${PORT}`);
});

export default app;
