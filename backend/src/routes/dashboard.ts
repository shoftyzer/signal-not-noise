import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const totalSignals = (db.prepare('SELECT COUNT(*) as count FROM signals').get() as { count: number }).count;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const newThisWeek = (db.prepare(
      "SELECT COUNT(*) as count FROM signals WHERE created_at >= ?"
    ).get(oneWeekAgo.toISOString()) as { count: number }).count;

    const byStatus = db.prepare(
      "SELECT status, COUNT(*) as count FROM signals GROUP BY status"
    ).all() as { status: string; count: number }[];

    const byTopicArea = db.prepare(
      "SELECT topic_area, COUNT(*) as count FROM signals WHERE topic_area IS NOT NULL GROUP BY topic_area ORDER BY count DESC LIMIT 10"
    ).all() as { topic_area: string; count: number }[];

    const byTechnologyArea = db.prepare(
      "SELECT technology_area, COUNT(*) as count FROM signals WHERE technology_area IS NOT NULL GROUP BY technology_area ORDER BY count DESC LIMIT 10"
    ).all() as { technology_area: string; count: number }[];

    const bySourceType = db.prepare(
      "SELECT source_type, COUNT(*) as count FROM signals WHERE source_type IS NOT NULL GROUP BY source_type ORDER BY count DESC"
    ).all() as { source_type: string; count: number }[];

    const weeksData: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const count = (db.prepare(
        "SELECT COUNT(*) as count FROM signals WHERE created_at >= ? AND created_at < ?"
      ).get(weekStart.toISOString(), weekEnd.toISOString()) as { count: number }).count;

      weeksData.push({
        week: weekStart.toISOString().split('T')[0],
        count
      });
    }

    const recentSignals = db.prepare(
      "SELECT id, title, status, topic_area, signal_type, created_at FROM signals ORDER BY created_at DESC LIMIT 5"
    ).all();

    const publishedCount = byStatus.find(s => s.status === 'published')?.count || 0;
    const underReviewCount = byStatus.find(s => s.status === 'under_review')?.count || 0;

    res.json({
      summary: {
        totalSignals,
        newThisWeek,
        published: publishedCount,
        underReview: underReviewCount
      },
      byStatus,
      byTopicArea,
      byTechnologyArea,
      bySourceType,
      signalsOverTime: weeksData,
      recentSignals
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

export default router;
