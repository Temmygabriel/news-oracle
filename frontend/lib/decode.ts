export interface NewsApiArticle {
  title: string;
  description: string | null;
}

/**
 * NewsAPI.org returns { status, totalResults, articles: [...] }.
 * The contract stores the raw HTTP response body as a string, so we parse
 * it defensively here - a bad API key, rate limit, or empty result set can
 * all produce a body that isn't the shape we expect.
 */
export function parseNewsApiResponse(raw: string): NewsApiArticle[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.articles)) return [];
    return parsed.articles.map((a: { title?: string; description?: string | null }) => ({
      title: a.title ?? '(untitled)',
      description: a.description ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Turns parsed articles into a plain-text block suitable for handing to the
 * LLM as context, or falls back to the raw string if parsing failed.
 */
export function articlesToPromptText(raw: string): string {
  const articles = parseNewsApiResponse(raw);
  if (articles.length === 0) return raw;
  return articles.map(a => `- ${a.title}${a.description ? `: ${a.description}` : ''}`).join('\n');
}
