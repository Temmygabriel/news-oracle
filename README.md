# News Oracle — Ritual Chain

An on-chain dApp: type a topic, and a smart contract fetches live headlines
via the HTTP precompile (`0x0801`), summarizes them via the LLM precompile
(`0x0802`), and stores the result on-chain — verified by a TEE.

Two transactions per query, both short-running async (results in under ~2 min).

## What's fixed vs. the original guide

The build guide's frontend hook used the **transaction hash** as the
`queryId` when calling `summarizeHeadlines`. The contract actually computes
`queryId` as `keccak256(topic, block.number, queryCount++)` — a different
value entirely. Left as-is, `summarizeHeadlines` would revert with
`"No headlines to summarize"` on every run, because it'd be looking up an
address that was never populated.

Fixed by:
- Emitting `QuerySubmitted` *before* the external precompile call (cheap safety improvement).
- Decoding the real `queryId` out of the `QuerySubmitted` event log in `fetchReceipt.logs`, via viem's `parseEventLogs`, instead of guessing at it.
- Added the event definitions to `NEWS_ORACLE_ABI` so `parseEventLogs` can decode them.

## Project layout

```
news-oracle/
├── contracts/          # Foundry project
│   ├── src/NewsOracle.sol
│   ├── script/Deploy.s.sol
│   ├── test/NewsOracle.t.sol
│   ├── foundry.toml
│   └── .env.example
└── frontend/            # Next.js app
    ├── app/
    ├── components/
    ├── lib/
    ├── hooks/
    └── .env.local.example
```

## Setup

### 1. Contracts (run in GitHub Codespaces, or any machine with network access)

```bash
cd contracts
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup
forge install foundry-rs/forge-std --no-git   # if not already vendored

cp .env.example .env
# edit .env: paste your funded wallet's PRIVATE_KEY

source .env
forge build
forge test        # runs the local-only tests (ownership, deposits)

forge create src/NewsOracle.sol:NewsOracle \
  --rpc-url $RITUAL_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast

# copy the deployed address from the output, then verify:
forge verify-contract \
  --chain 1979 \
  --watch \
  --verifier custom \
  --verifier-url "$RITUAL_VERIFIER_URL" \
  --verifier-api-key unused \
  <PASTE_ADDRESS_HERE> \
  src/NewsOracle.sol:NewsOracle
```

Save the deployed address — it goes into the frontend's env vars next.

### 2. Frontend

```bash
cd frontend
npm install

cp .env.local.example .env.local
# edit .env.local:
#   NEXT_PUBLIC_NEWS_ORACLE_ADDRESS = the address from step 1
#   NEXT_PUBLIC_NEWS_API_KEY        = your newsapi.org key
#   NEXT_PUBLIC_ANTHROPIC_KEY       = your Anthropic API key

npm run dev   # test locally at localhost:3000
```

Deploy to Vercel:

```bash
npx vercel
npx vercel env add NEXT_PUBLIC_NEWS_ORACLE_ADDRESS
npx vercel env add NEXT_PUBLIC_NEWS_API_KEY
npx vercel env add NEXT_PUBLIC_ANTHROPIC_KEY
npx vercel --prod
```

### 3. Fund and test

1. Get testnet RITUAL from `https://faucet.ritualfoundation.org`.
2. Add Ritual Chain to MetaMask manually: RPC `https://rpc.ritualfoundation.org`, Chain ID `1979`, currency `RITUAL`.
3. Call `depositFees()` on your deployed contract with 2–5 RITUAL (needed for precompile fees — do this from a block explorer's "write contract" tab, or a small cast/viem script).
4. Visit your Vercel URL (or localhost), connect MetaMask, type a topic, hit **Query Oracle**.
5. Watch the status cycle; a summary should land in 2–4 minutes.

## Security note

`NEXT_PUBLIC_*` env vars are bundled into client-side JS — visible to anyone
who opens dev tools. The NewsAPI and Anthropic keys are encrypted client-side
before they touch the chain (the TEE executor decrypts them inside the
enclave), but the *raw* keys sitting in your Vercel env are still exposed in
the browser bundle. Fine for a testnet demo; for anything real, move key
handling to a server-side API route instead of `NEXT_PUBLIC_*`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `"No executors available"` | TEE testnet is quiet — retry in a few minutes, check the explorer |
| Revert on `fetchHeadlines` | RitualWallet deposit is empty — call `depositFees()` |
| Headlines come back empty | NewsAPI free tier hit its 100 req/day cap |
| Summary never appears | Check `SummaryReady` events on the explorer for your contract |
| Wrong chain in MetaMask | Switch to Chain ID `1979`, add manually if missing |
| `npm run build` fails on Vercel | Run it locally first — usually a TS type error |

Faucet: `https://faucet.ritualfoundation.org`
Explorer: `https://explorer.ritualfoundation.org`
