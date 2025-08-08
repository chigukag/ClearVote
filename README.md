# ClearVote

A simple, secure, and transparent blockchain voting platform built with **Clarity**. ClearVote uses a small set of composable smart contracts (3–5) to run verifiable elections for institutions, universities, cooperatives, and organizations while preserving voter privacy and auditability.

---

## Overview

ClearVote is designed to be minimal and practical — a production-minded voting stack that balances privacy, verifiability, and deployability on a Clarity-compatible chain.

Core design goals:

* **Verifiable**: anyone can audit votes and results on-chain.
* **Private**: votes are stored so that ballots cannot be linked to voters (commit-reveal flow).
* **Accessible**: voters can use web wallets or custodial options.
* **Composable**: contracts are small, single-responsibility, and can be reused across elections.

---

## Main Smart Contracts (3–5)

1. **VoterRegistry.clar** — *(optional but recommended)*

   * Registers eligible voters (addresses or off-chain identities mapped to on-chain IDs).
   * Supports role-based administration (admin, registrar).
   * Allows batch registration and revocation.
   * Stores a Merkle root or simple mapping used by ballots to verify eligibility.

2. **BallotFactory.clar**

   * Creates and tracks Ballot instances (one Ballot per election).
   * Stores ballot metadata (name, start/end timestamps, options, quorum rules).
   * Deploys or initializes Ballot contracts with parameters.

3. **Ballot.clar**

   * Implements the **commit–reveal** voting flow:

     * `commit-vote` — voter submits a hash(commitment) of their vote + nonce.
     * `reveal-vote` — voter reveals vote and nonce during reveal period.
   * Enforces timing (commit period, reveal period) and eligibility checks via VoterRegistry.
   * Stores commitments and revealed votes on-chain.

4. **Tally.clar**

   * Tallying logic and result publication.
   * Verifies reveals against commitments, counts votes, enforces quorum and thresholds.
   * Publishes final results and produces a signed result record (on-chain event/state) for auditors.

5. **OracleBridge.clar** — *optional*

   * Integrates off-chain data (time signals, registrar confirmations, KYC/eligibility oracle).
   * Accepts signed attestation to finalize contested ballots or handle external triggers.

> **Note:** You can run a minimal ClearVote deployment with only **BallotFactory + Ballot + Tally** (3 contracts). Add **VoterRegistry** and **OracleBridge** if your election requires registered electorates or external attestations.

---

## Features

* **Commit–Reveal scheme** to prevent early vote exposure.
* **On-chain eligibility checks** via registry or Merkle proofs.
* **Configurable election rules**: quorum, majority, weighted voting, multiple-choice, ranked-choice-ready (off-chain aggregator).
* **Transparent audit trail**: every action recorded on-chain for public verification.
* **Small contract surface**: focused contracts to simplify audits and lower attack surface.

---

## Smart Contract Summaries

### VoterRegistry.clar

* `register-voter` (admin) — adds voter principal or leaf to registry
* `revoke-voter` (admin) — removes voter
* `is-eligible` — query for Ballot contracts
* `set-merkle-root` — optional batch eligibility via Merkle root

### BallotFactory.clar

* `create-ballot` — create and configure a new Ballot (start, commit-window, reveal-window, options)
* `get-ballots` — list active/past ballots
* `set-default-registry` — link to a VoterRegistry instance

### Ballot.clar

* `commit-vote` — stores commitment hash (H(vote || nonce)) during commit window
* `reveal-vote` — reveals vote and nonce during reveal window; verifies hash matches
* `cancel-commit` — (optional) allow voters to replace commitments before commit window ends
* `get-status` — returns status (commit open, reveal open, tallying, closed)

### Tally.clar

* `tally` — tallies revealed votes, verifies commitments, updates result state
* `get-results` — read final counts and metadata
* `challenge-reveal` — allow any observer to challenge misrevealed votes (optional dispute flow)

### OracleBridge.clar

* `submit-attestation` — submit signed off-chain attestations
* `get-attestation` — read attestation data used to finalize ballots

---

## Security & Privacy Considerations

* **Commit–Reveal Limitations**: commit–reveal protects against vote exposure during the commit phase, but requires correct timing windows and voter coordination.
* **Sybil Resistance**: combine the VoterRegistry (with KYC or off-chain verification) and on-chain attestations for high-stakes elections.
* **Replay & Front-running**: commitments are hashes — include a unique nonce and ballot ID to prevent replay.
* **Auditability**: keep logs concise and explicit (commitments, reveals, tallies). Consider adding on-chain proofs or Merkle roots for large electorates.
* **Gas & Storage**: Clarity-based chains have different execution/storage costs — prefer storing commitments and minimal reveal data on-chain; archive verbose logs off-chain with a content-addressed hash stored on-chain.

---

## Installation

1. Install Clarinet CLI and toolchain (see Clarity / Clarinet docs):

   ```bash
   npm install -g @hirosystems/clarinet
   ```
2. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/clearvote.git
   cd clearvote
   ```
3. Run tests:

   ```bash
   clarinet test
   ```
4. Deploy local:

   ```bash
   clarinet deploy
   ```

---

## Usage Examples (Clarity function calls)

### Create a ballot (via BallotFactory)

```clar
(try! (contract-call? .ballot-factory create-ballot "School Board Election" 1650000000 1650003600 1650007200 ["Alice" "Bob" "Abstain"]))
```

### Commit a vote (via Ballot)

```clar
;; precomputed commitment = sha256(concat(vote, nonce, tx-sender))
(try! (contract-call? .ballot commit-vote "0x<commitment-hash>"))
```

### Reveal a vote (via Ballot)

```clar
(try! (contract-call? .ballot reveal-vote "Alice" "0x<nonce>"))
```

### Tally (via Tally contract)

```clar
(try! (contract-call? .tally tally <ballot-id>))
```

---

## Testing

* Unit tests for each contract in `tests/`.
* Integration tests to simulate the full commit–reveal and tally flow.
* Security tests to cover replay, double-reveal, and eligibility attacks.

Example test command:

```bash
clarinet test
```

---

## Deployment

* Use `clarinet deploy` for local development.
* For staging/mainnet, follow your chain provider's deployment guide (set appropriate network configs and private keys in `Clarinet.toml`).

---

## Extensibility

* **Weighted Voting**: link VoterRegistry to staked token balances for token-weighted votes.
* **Ranked-Choice**: support off-chain ranked aggregation and on-chain proof publication.
* **Privacy Enhancements**: integrate zk proofs or mixnets (off-chain) and publish proofs on-chain.

---

## Contributing

Contributions welcome — open issues, submit PRs, and add tests. Please follow the code-of-conduct and include unit tests for new features.

---

## License

MIT License
