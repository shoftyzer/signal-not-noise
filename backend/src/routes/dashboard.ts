import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getDb();

    const totalResult = await pool.query('SELECT COUNT(*) as count FROM signals');
    const totalSignals = parseInt(totalResult.rows[0].count, 10);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekResult = await pool.query(
      'SELECT COUNT(*) as count FROM signals WHERE created_at >= $1',
      [oneWeekAgo.toISOString()]
    );
    const newThisWeek = parseInt(weekResult.rows[0].count, 10);

    const byStatusResult = await pool.query(
      'SELECT status, COUNT(*) as count FROM signals GROUP BY status'
    );
    const byStatus = byStatusResult.rows.map(r => ({ status: r.status, count: parseInt(r.count, 10) }));

    const byTopicResult = await pool.query(
      'SELECT topic_area, COUNT(*) as count FROM signals WHERE topic_area IS NOT NULL GROUP BY topic_area ORDER BY count DESC LIMIT 10'
    );
    const byTopicArea = byTopicResult.rows.map(r => ({ topic_area: r.topic_area, count: parseInt(r.count, 10) }));

    const byTechResult = await pool.query(
      'SELECT technology_area, COUNT(*) as count FROM signals WHERE technology_area IS NOT NULL GROUP BY technology_area ORDER BY count DESC LIMIT 10'
    );
    const byTechnologyArea = byTechResult.rows.map(r => ({ technology_area: r.technology_area, count: parseInt(r.count, 10) }));

    const bySourceResult = await pool.query(
      'SELECT source_type, COUNT(*) as count FROM signals WHERE source_type IS NOT NULL GROUP BY source_type ORDER BY count DESC'
    );
    const bySourceType = bySourceResult.rows.map(r => ({ source_type: r.source_type, count: parseInt(r.count, 10) }));

    const weeksData: { month: string; signal_type: string; topic_area: string; count: number }[] = [];
    const overTimeResult = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', publication_date::date), 'YYYY-MM') AS month,
        COALESCE(signal_type, 'unknown') AS signal_type,
        COALESCE(topic_area, 'Unknown') AS topic_area,
        COUNT(*)::int AS count
      FROM signals
      WHERE publication_date IS NOT NULL
        AND publication_date::date >= (NOW() - INTERVAL '2 years')
      GROUP BY month, signal_type, topic_area
      ORDER BY month ASC
    `);
    weeksData.push(...overTimeResult.rows);

    const recentResult = await pool.query(
      'SELECT id, title, status, topic_area, signal_type, created_at FROM signals ORDER BY created_at DESC LIMIT 5'
    );

    const publishedCount = byStatus.find(s => s.status === 'published')?.count || 0;
    const underReviewCount = byStatus.find(s => s.status === 'under_review')?.count || 0;

    res.json({
      summary: { totalSignals, newThisWeek, published: publishedCount, underReview: underReviewCount },
      byStatus,
      byTopicArea,
      byTechnologyArea,
      bySourceType,
      signalsOverTime: weeksData,
      recentSignals: recentResult.rows
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

export default router;
