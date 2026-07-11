import { encodeAbiParameters, toHex } from 'viem';
import { encrypt, ECIES_CONFIG } from 'eciesjs';
import type { Hex } from 'viem';

// MANDATORY - must be set before any encrypt() call.
// eciesjs / eciespy default to a 16-byte nonce; the Ritual TEE expects 12,
// or decryption silently fails inside the enclave.
ECIES_CONFIG.symmetricNonceLength = 12;

export const TEE_REGISTRY_ABI = [{
  name: 'getServicesByCapability',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [{ name: 'capability', type: 'uint8' }, { name: 'checkValidity', type: 'bool' }],
  outputs: [{ type: 'tuple[]', components: [
    { name: 'node', type: 'tuple', components: [
      { name: 'paymentAddress', type: 'address' },
      { name: 'teeAddress', type: 'address' },
      { name: 'teeType', type: 'uint8' },
      { name: 'publicKey', type: 'bytes' },
      { name: 'endpoint', type: 'string' },
      { name: 'certPubKeyHash', type: 'bytes32' },
      { name: 'capability', type: 'uint8' },
    ]},
    { name: 'isValid', type: 'bool' },
    { name: 'workloadId', type: 'bytes32' },
  ]}],
}] as const;

export function encryptSecret(secretJson: string, executorPublicKey: Hex): Hex {
  const pubKeyBytes = Buffer.from(executorPublicKey.slice(2), 'hex');
  const encrypted = encrypt(pubKeyBytes, Buffer.from(secretJson));
  return toHex(encrypted);
}

export function encodeHTTPRequest(params: {
  executorAddress: Hex;
  url: string;
  headerKeys?: string[];
  headerValues?: string[];
  encryptedSecrets?: Hex[];
  secretSignatures?: Hex[];
}): Hex {
  return encodeAbiParameters(
    [
      { type: 'address' }, { type: 'bytes[]' }, { type: 'uint256' },
      { type: 'bytes[]' }, { type: 'bytes' },
      { type: 'string' }, { type: 'uint8' },
      { type: 'string[]' }, { type: 'string[]' }, { type: 'bytes' },
      { type: 'uint256' }, { type: 'uint8' }, { type: 'bool' },
    ],
    [
      params.executorAddress,
      params.encryptedSecrets ?? [],
      100n,
      params.secretSignatures ?? [],
      '0x',
      params.url,
      1, // GET
      params.headerKeys ?? ['Accept'],
      params.headerValues ?? ['application/json'],
      '0x',
      0n, 0, false,
    ]
  );
}

// The LLM precompile (0x0802) runs a self-hosted open-weight model
// (zai-org/GLM-4.7-FP8) directly inside the TEE fleet - no external API
// key is needed, unlike the HTTP precompile which really does call out to
// a third-party service (NewsAPI) using a real secret.
export function encodeLLMRequest(params: {
  executorAddress: Hex;
  systemPrompt: string;
  userMessage: string;
  model?: string;
}): Hex {
  const messagesJson = JSON.stringify([
    { role: 'system', content: params.systemPrompt },
    { role: 'user', content: params.userMessage },
  ]);

  return encodeAbiParameters(
    [
      { type: 'address' },   // 0: executor
      { type: 'bytes[]' },   // 1: secrets
      { type: 'uint256' },   // 2: ttl
      { type: 'bytes[]' },   // 3: sigs
      { type: 'bytes' },     // 4: pubkey
      { type: 'string' },    // 5: messagesJson
      { type: 'string' },    // 6: model
      { type: 'int256' },    // 7: frequencyPenalty
      { type: 'string' },    // 8: logitBias
      { type: 'bool' },      // 9: logprobs
      { type: 'int256' },    // 10: maxTokens
      { type: 'string' },    // 11: metadata
      { type: 'string' },    // 12: modalities
      { type: 'uint256' },   // 13: n
      { type: 'bool' },      // 14: parallelTools
      { type: 'int256' },    // 15: presencePenalty
      { type: 'string' },    // 16: reasoning
      { type: 'bytes' },     // 17: responseFormat
      { type: 'int256' },    // 18: seed
      { type: 'string' },    // 19: serviceTier
      { type: 'string' },    // 20: stop
      { type: 'bool' },      // 21: stream
      { type: 'int256' },    // 22: temperature (x1000)
      { type: 'bytes' },     // 23: toolChoice
      { type: 'bytes' },     // 24: tools
      { type: 'int256' },    // 25: topLogprobs
      { type: 'int256' },    // 26: topP (x1000)
      { type: 'string' },    // 27: user
      { type: 'bool' },      // 28: piiEnabled
      { type: 'tuple', components: [{ type: 'string' }, { type: 'string' }, { type: 'string' }] }, // 29: convoHistory
    ],
    [
      params.executorAddress,
      [], 300n, [], '0x',
      messagesJson,
      params.model ?? 'zai-org/GLM-4.7-FP8',
      0n, '', false, 4096n,
      '', '', 1n, true,
      0n, 'medium', '0x', -1n,
      'auto', '',
      false,
      700n,
      '0x', '0x',
      -1n, 1000n,
      '', false,
      ['', '', ''],
    ]
  );
}

// Function ABI + event ABI. The events matter: the frontend needs them to
// decode the real queryId out of the transaction receipt logs, since the
// contract computes queryId as keccak256(topic, block.number, queryCount++)
// - it is NOT the transaction hash.
export const NEWS_ORACLE_ABI = [
  {
    name: 'fetchHeadlines',
    type: 'function' as const,
    inputs: [
      { name: 'topic', type: 'string' },
      { name: 'encodedHTTPRequest', type: 'bytes' },
    ],
    outputs: [{ name: 'queryId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'summarizeHeadlines',
    type: 'function' as const,
    inputs: [
      { name: 'queryId', type: 'bytes32' },
      { name: 'encodedLLMRequest', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getLatestResult',
    type: 'function' as const,
    inputs: [{ name: 'topic', type: 'string' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'topic', type: 'string' },
        { name: 'rawHeadlines', type: 'string' },
        { name: 'summary', type: 'string' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'hasSummary', type: 'bool' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    name: 'depositFees',
    type: 'function' as const,
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    name: 'QuerySubmitted',
    type: 'event' as const,
    inputs: [
      { name: 'queryId', type: 'bytes32', indexed: true },
      { name: 'topic', type: 'string', indexed: false },
    ],
  },
  {
    name: 'HeadlinesFetched',
    type: 'event' as const,
    inputs: [
      { name: 'queryId', type: 'bytes32', indexed: true },
      { name: 'topic', type: 'string', indexed: false },
      { name: 'headlines', type: 'string', indexed: false },
    ],
  },
  {
    name: 'SummaryReady',
    type: 'event' as const,
    inputs: [
      { name: 'queryId', type: 'bytes32', indexed: true },
      { name: 'topic', type: 'string', indexed: false },
      { name: 'summary', type: 'string', indexed: false },
    ],
  },
] as const;
