# TrigslinkVault: Autonomous Prediction Market Infrastructure

TrigslinkVault is the core financial engine of the Trigslink Protocol. It provides a deterministic, machine-verified settlement layer for prediction markets, completely eliminating the 24-48 hour "Zombie Period" inherent in legacy Optimistic Oracles.

By offloading market resolution to an autonomous Chainlink Runtime Environment (CRE), this vault achieves finality in approximately 15 seconds (the next block).

## Core Architecture

Unlike traditional prediction markets that rely on human governance and subjective debate, TrigslinkVault operates on **Deterministic Logic**.

1. **No Human Owner:** The contract is governed exclusively by the `trigslinkManager` address, which is linked to our decentralized verification nodes.
2. **Proportional Payouts:** Liquidity is aggregated into a single event pool. Payouts are calculated proportionally based on the user's share of the winning outcome pool.
3. **Instant Claiming:** The moment the autonomous nodes reach consensus and trigger `resolveMarket`, users can immediately call `claimWinnings` to recycle their capital.

---

## Smart Contract Functions

### `constructor(address _manager)`
Deploys the vault and permanently sets the `trigslinkManager`. This ensures that only the autonomous verifiable code can resolve markets, making human manipulation mathematically and economically irrational.

### `placeBet(string memory _marketId, uint8 _outcome)`
Allows users to deposit ETH and take a position on a market.
- `_marketId`: The unique identifier for the event.
- `_outcome`: Must be `1` (YES) or `2` (NO).
- **Note:** Reverts if the market is already settled or if the bet amount is 0.

### `resolveMarket(string memory _marketId, uint8 _outcome)`
Locks the market and sets the final outcome.
- **Security:** This function is strictly locked down using `require(msg.sender == trigslinkManager)`. No human actor, not even the protocol deployer, can trigger this function.

### `claimWinnings(string memory _marketId)`
Calculates and distributes the winnings to users who predicted the correct outcome.
- **Math:** `(User Bet / Total Winning Pool) * Total Market Pool`
- **Security:** State updates (`userBets = 0`) happen *before* the external ETH transfer to prevent reentrancy attacks. Reverts if the user did not win or already claimed.

---

## Local Development

This repository uses Hardhat v2.22.17 for an ultra-stable, CommonJS-compatible development environment.

### Compile the Contract
Generate the latest ABIs and TypeChain typings:
```bash
npx hardhat compile
```

### Run the Test Suite
Execute the automated tests to verify the Manager constraints and payout math:
```bash
npx hardhat test
```

## Roadmap: Universal Liquidity Rails (ULR)

This vault serves as the foundational layer. In Phase 2, TrigslinkVault will be integrated with Chainlink CCIP to enable **Universal Liquidity Rails (ULR)** , allowing users on L2s (like Base) to seamlessly bet against liquidity held on Ethereum or Solana.
