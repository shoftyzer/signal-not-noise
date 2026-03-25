import { Router, Request, Response } from 'express';
import RSSParser from 'rss-parser';

const router = Router();
const parser = new RSSParser();

router.post('/rss', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const feed = await parser.parseURL(url);

    const candidates = (feed.items || []).slice(0, 20).map((item) => ({
      title: item.title || 'Untitled',
      summary: item.contentSnippet || item.summary || item.content || '',
      source_name: feed.title || new URL(url).hostname,
      source_type: 'article',
      url: item.link || '',
      publication_date: item.pubDate ? new Date(item.pubDate).toISOString().split('T')[0] : null,
      scan_date: new Date().toISOString().split('T')[0],
      status: 'new',
      tags: '[]'
    }));

    res.json({
      feedTitle: feed.title,
      feedUrl: url,
      candidateCount: candidates.length,
      candidates
    });
  } catch (err: unknown) {
    console.error('Error parsing RSS feed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: `Failed to parse RSS feed: ${message}` });
  }
});

export default router;
