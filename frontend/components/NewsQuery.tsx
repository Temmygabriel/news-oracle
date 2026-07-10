'use client';
import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useNewsOracle } from '@/hooks/useNewsOracle';
import { JobStatus } from './JobStatus';
import { ResultCard } from './ResultCard';

const EXAMPLE_TOPICS = ['Bitcoin', 'AI regulation', 'Nigerian tech', 'Ethereum', 'OpenAI'];

export function NewsQuery() {
  const [topic, setTopic] = useState('');
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { status, error, headlines, summary, query, reset } = useNewsOracle();

  const isRunning = !['idle', 'done', 'error'].includes(status);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim()) query(topic.trim());
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">Connect your wallet to query the oracle</p>
        <button
          onClick={() => connect({ connector: injected() })}
          className="px-6 py-3 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 transition-colors"
        >
          Connect MetaMask
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs font-mono text-gray-500">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
        <button onClick={() => disconnect()} className="text-xs text-gray-600 hover:text-gray-400">
          Disconnect
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Bitcoin, AI regulation, climate change"
            disabled={isRunning}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-600 disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_TOPICS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              disabled={isRunning}
              className="text-xs px-3 py-1 border border-gray-700 text-gray-500 rounded hover:border-gray-500 hover:text-gray-300 disabled:opacity-40"
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!topic.trim() || isRunning}
            className="flex-1 py-3 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {isRunning ? 'Running...' : 'Query Oracle'}
          </button>

          {(status === 'done' || status === 'error') && (
            <button
              type="button"
              onClick={reset}
              className="px-4 py-3 border border-gray-700 text-gray-400 rounded-lg hover:border-gray-500 text-sm"
            >
              Reset
            </button>
          )}
        </div>
      </form>

      <JobStatus status={status} error={error} />
      <ResultCard headlines={headlines} summary={summary} />
    </div>
  );
}
