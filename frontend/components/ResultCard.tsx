import { parseNewsApiResponse } from '@/lib/decode';

export function ResultCard({ headlines, summary }: { headlines: string | null; summary: string | null }) {
  if (!headlines && !summary) return null;

  const articles = headlines ? parseNewsApiResponse(headlines) : [];

  return (
    <div className="mt-6 space-y-4">
      {headlines && (
        <div className="p-4 rounded-lg border border-gray-700 bg-gray-900">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Raw Headlines</p>
          <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
            {articles.length > 0
              ? articles.map((a, i) => <div key={i}>• {a.title}</div>)
              : headlines}
          </div>
        </div>
      )}

      {summary && (
        <div className="p-4 rounded-lg border border-green-800 bg-green-950/30">
          <p className="text-xs text-green-500 uppercase tracking-wider mb-2">◇ AI Summary (on-chain)</p>
          <p className="text-sm text-gray-200 leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
