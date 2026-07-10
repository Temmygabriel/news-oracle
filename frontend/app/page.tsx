import { NewsQuery } from '@/components/NewsQuery';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-gray-300">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-100 mb-2">
            News Oracle
          </h1>
          <p className="text-gray-500 text-sm">
            On-chain news summarization via Ritual Chain. HTTP + LLM precompiles.
          </p>
          <div className="mt-3 flex gap-4 text-xs text-gray-600 font-mono">
            <span>Chain ID: 1979</span>
            <span>HTTP: 0x0801</span>
            <span>LLM: 0x0802</span>
          </div>
        </div>

        <div className="border border-gray-800 rounded-xl p-6 bg-gray-950">
          <NewsQuery />
        </div>

        <p className="mt-8 text-xs text-gray-700 text-center">
          Testnet - all tokens have no real value
        </p>
      </div>
    </main>
  );
}
