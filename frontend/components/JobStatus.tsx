import type { OracleStatus } from '@/hooks/useNewsOracle';

const STATUS_LABELS: Record<OracleStatus, string> = {
  idle:                 'Ready',
  'finding-executor':   'Finding TEE executor...',
  encrypting:           'Encrypting API keys...',
  'fetching-headlines': 'Submitting headline fetch...',
  'waiting-headlines':  'Waiting for headlines (up to 2 min)...',
  summarizing:          'Submitting to LLM...',
  'waiting-summary':    'Waiting for AI summary (up to 2 min)...',
  done:                 'Done',
  error:                'Error',
};

const ACTIVE_STATES: OracleStatus[] = [
  'finding-executor', 'encrypting', 'fetching-headlines',
  'waiting-headlines', 'summarizing', 'waiting-summary',
];

export function JobStatus({ status, error }: { status: OracleStatus; error: string | null }) {
  const isActive = ACTIVE_STATES.includes(status);

  if (status === 'idle') return null;

  return (
    <div className="mt-4 p-4 rounded-lg border border-gray-700 bg-gray-900">
      <div className="flex items-center gap-3">
        {isActive && (
          <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
        )}
        {status === 'done' && (
          <div className="w-3 h-3 rounded-full bg-green-400" />
        )}
        {status === 'error' && (
          <div className="w-3 h-3 rounded-full bg-red-400" />
        )}
        <span className="text-sm text-gray-300">{STATUS_LABELS[status]}</span>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
