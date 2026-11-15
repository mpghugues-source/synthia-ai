import axios from 'axios';

export interface TrendingTopic {
  title: string;
  approxTraffic: string;
  articleTitle?: string;
}

/**
 * Tendances de recherche réelles du jour, par marché (flux RSS public Google
 * Trends — pas d'API officielle, mais ce flux est public et sans clé requise).
 * `geo` est un code pays ISO 3166-1 alpha-2 (US, FR, GB, CD...).
 */
export async function getTrendingTopics(geo: string): Promise<TrendingTopic[]> {
  const { data } = await axios.get<string>('https://trends.google.com/trending/rss', {
    params: { geo: geo.toUpperCase() },
    timeout: 10_000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SynthiaAI/1.0)' },
  });

  const items: TrendingTopic[] = [];
  const itemBlocks = data.split('<item>').slice(1);

  for (const block of itemBlocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
    if (!title) continue;

    const approxTraffic = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1]?.trim() ?? '';
    const articleTitle = block.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/)?.[1]?.trim();

    items.push({ title: decodeEntities(title), approxTraffic, articleTitle: articleTitle ? decodeEntities(articleTitle) : undefined });
  }

  return items;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
