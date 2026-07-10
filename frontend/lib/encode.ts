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

export function encodeLLMRequest(params: {
  executorAddress: Hex;
  encryptedSecrets: Hex[];
  secretSignatures: Hex[];
  systemPrompt: string;
  userMessage: string;
  model?: string;
}): Hex {
  const systemMsg = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }],
    ['system', params.systemPrompt]
  );
  const userMsg = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }],
    ['user', params.userMessage]
  );

  return encodeAbiParameters(
    [
      { type: 'address' }, { type: 'bytes[]' }, { type: 'uint256' },
      { type: 'bytes[]' }, { type: 'bytes' },
      { type: 'string' },   // model
      { type: 'bytes[]' },  // messages
      { type: 'uint256' },  // maxTokens
      { type: 'uint256' },  // temperature * 100
      { type: 'bool' },     // stream
      { type: 'uint256' },  // topP * 100
      { type: 'uint256' },  // frequencyPenalty * 100
      { type: 'uint256' },  // presencePenalty * 100
      { type: 'string[]' }, // stop sequences
      { type: 'bytes' },    // tools (empty)
      { type: 'string' },   // toolChoice
    ],
    [
      params.executorAddress,
      params.encryptedSecrets,
      200n,
      params.secretSignatures,
      '0x',
      params.model ?? 'claude-haiku-4-5-20251001',
      [systemMsg, userMsg],
      512n,
      70n,
      false,
      100n,
      0n,
      0n,
      [],
      '0x',
      '',
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
