'use client';
import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { encodeFunctionData, hexToBytes, parseEventLogs } from 'viem';
import type { Hex } from 'viem';
import {
  TEE_REGISTRY_ABI, NEWS_ORACLE_ABI,
  encryptSecret, encodeHTTPRequest, encodeLLMRequest,
} from '@/lib/encode';
import { articlesToPromptText } from '@/lib/decode';
import { CONTRACT_ADDRESS, TEE_REGISTRY } from '@/lib/addresses';

export type OracleStatus =
  | 'idle'
  | 'finding-executor'
  | 'encrypting'
  | 'fetching-headlines'
  | 'waiting-headlines'
  | 'summarizing'
  | 'waiting-summary'
  | 'done'
  | 'error';

export function useNewsOracle() {
  const [status, setStatus] = useState<OracleStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [queryId, setQueryId] = useState<Hex | null>(null);
  const [headlines, setHeadlines] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const query = useCallback(async (topic: string) => {
    if (!walletClient || !address || !publicClient) {
      setError('Wallet not connected — check MetaMask is unlocked and on the Ritual network (Chain ID 1979)');
      setStatus('error');
      return;
    }

    setError(null);
    setSummary(null);
    setHeadlines(null);
    setQueryId(null);

    try {
      // 1. Find an executor that can serve HTTP calls
      setStatus('finding-executor');
      const services = await publicClient.readContract({
        address: TEE_REGISTRY,
        abi: TEE_REGISTRY_ABI,
        functionName: 'getServicesByCapability',
        args: [0, true], // 0 = HTTP_CALL capability
      });

      if (!services.length) throw new Error('No HTTP executors available right now');

      const executorAddress = services[0].node.teeAddress;
      const executorPublicKey = services[0].node.publicKey as Hex;

      // The LLM precompile needs an executor registered for LLM specifically -
      // Capability.LLM = 1, different from HTTP's capability 0. Reusing the
      // HTTP executor here causes an on-chain revert ("has capability HttpCall,
      // required Llm").
      const llmServices = await publicClient.readContract({
        address: TEE_REGISTRY,
        abi: TEE_REGISTRY_ABI,
        functionName: 'getServicesByCapability',
        args: [1, true], // 1 = LLM capability
      });

      if (!llmServices.length) throw new Error('No LLM executors available right now');

      const llmExecutorAddress = llmServices[0].node.teeAddress;

      // 2. Encrypt the NewsAPI key for that executor
      setStatus('encrypting');
      const newsApiKey = process.env.NEXT_PUBLIC_NEWS_API_KEY!;

      const encryptedNewsKey = encryptSecret(
        JSON.stringify({ NEWSAPI_KEY: newsApiKey }),
        executorPublicKey
      );
      const newsKeySig = await walletClient.signMessage({
        message: { raw: hexToBytes(encryptedNewsKey) },
      });

      // 3. Build the news URL - NEWSAPI_KEY gets swapped in by the executor
      const encodedTopic = encodeURIComponent(topic);
      const newsUrl = `https://newsapi.org/v2/everything?q=${encodedTopic}&pageSize=5&apiKey=NEWSAPI_KEY&language=en&sortBy=publishedAt`;

      const httpEncoded = encodeHTTPRequest({
        executorAddress,
        url: newsUrl,
        encryptedSecrets: [encryptedNewsKey],
        secretSignatures: [newsKeySig],
      });

      // 4. Submit the headline fetch transaction
      setStatus('fetching-headlines');
      const fetchData = encodeFunctionData({
        abi: NEWS_ORACLE_ABI,
        functionName: 'fetchHeadlines',
        args: [topic, httpEncoded],
      });

      const fetchHash = await walletClient.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: fetchData,
        gas: 8_000_000n,
        maxFeePerGas: 20_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
      });

      setStatus('waiting-headlines');
      const fetchReceipt = await publicClient.waitForTransactionReceipt({ hash: fetchHash });

      if (fetchReceipt.status !== 'success') throw new Error('Headline fetch transaction failed');

      // The contract computes queryId as keccak256(topic, block.number, queryCount++) -
      // it is NOT the transaction hash. Pull the real value out of the
      // QuerySubmitted event log instead of guessing at it.
      const submittedLogs = parseEventLogs({
        abi: NEWS_ORACLE_ABI,
        eventName: 'QuerySubmitted',
        logs: fetchReceipt.logs,
      });
      if (!submittedLogs.length) throw new Error('QuerySubmitted event not found in receipt');
      const resolvedQueryId = submittedLogs[0].args.queryId as Hex;
      setQueryId(resolvedQueryId);

      // Read the headlines back off-chain via the contract
      const latestResult = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NEWS_ORACLE_ABI,
        functionName: 'getLatestResult',
        args: [topic],
      });

      const headlineText = latestResult.rawHeadlines;
      if (!headlineText) throw new Error('No headlines returned from API - check your NewsAPI key/quota');
      setHeadlines(headlineText);

      const headlineSummary = articlesToPromptText(headlineText);

      // 5. Build the LLM request. The LLM precompile runs a self-hosted
      // model inside the TEE - no external API key needed here.
      const llmEncoded = encodeLLMRequest({
        executorAddress: llmExecutorAddress,
        systemPrompt: 'You are a concise news analyst. Summarize the provided headlines in 3-4 sentences, highlighting the most important developments.',
        userMessage: `Please summarize these recent news headlines about "${topic}":\n\n${headlineSummary}`,
      });

      // 6. Submit the summarize transaction using the REAL queryId
      setStatus('summarizing');
      const summarizeData = encodeFunctionData({
        abi: NEWS_ORACLE_ABI,
        functionName: 'summarizeHeadlines',
        args: [resolvedQueryId, llmEncoded],
      });

      const summarizeHash = await walletClient.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: summarizeData,
        gas: 8_000_000n,
        maxFeePerGas: 20_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
      });

      setStatus('waiting-summary');
      const summarizeReceipt = await publicClient.waitForTransactionReceipt({ hash: summarizeHash });

      if (summarizeReceipt.status !== 'success') throw new Error('Summary transaction failed');

      // Read final result
      const finalResult = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NEWS_ORACLE_ABI,
        functionName: 'getLatestResult',
        args: [topic],
      });

      setSummary(finalResult.summary || 'Summary complete - check contract for result');
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [walletClient, address, publicClient]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setQueryId(null);
    setHeadlines(null);
    setSummary(null);
  }, []);

  return { status, error, queryId, headlines, summary, query, reset };
}
