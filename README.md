# TrigslinkVault
### Autonomous Prediction Market Infrastructure

TrigslinkVault serves as the core financial engine of the Trigslink Protocol—a deterministic, machine-verified settlement layer that revolutionizes how prediction markets operate. By eliminating the 24-48 hour "Zombie Period" inherent in legacy Optimistic Oracles, this vault achieves finality in approximately **15 seconds** through autonomous Chainlink Runtime Environment (CRE) integration.

---

## 📋 Table of Contents
- [The Problem We Solve](#-the-problem-we-solve)
- [Core Architecture](#-core-architecture)
- [Smart Contract Interface](#-smart-contract-interface)
- [Getting Started](#-getting-started)
- [Development](#-development)
- [Roadmap](#-roadmap)

---

## ⚡ The Problem We Solve

Traditional prediction markets suffer from critical delays:
- **24-48 hour waiting periods** for market resolution
- **Human-dependent governance** prone to manipulation
- **Capital inefficiency** from locked funds

TrigslinkVault transforms this paradigm through automation and deterministic logic.

---

## 🏗️ Core Architecture

Unlike conventional markets that rely on subjective human debate, our infrastructure operates on three foundational principles:

### 🤖 **No Human Owner**
The contract is governed exclusively by the `trigslinkManager` address—a decentralized network of verification nodes. No single entity possesses control.

### 📊 **Proportional Payouts**
Liquidity flows into unified event pools. When markets resolve, payouts distribute proportionally based on each user's share of the winning outcome pool.

### ⚡ **Instant Claiming**
The moment autonomous nodes reach consensus and trigger `resolveMarket`, users gain immediate access to claim their winnings—recycling capital at blockchain speed.

---

## 📝 Smart Contract Interface

### Constructor

#### `constructor(address _manager)`
Initializes the vault with permanent, immutable governance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `_manager` | `address` | The autonomous manager contract address |

**Security Note:** This setting is permanent—only the designated manager can resolve markets, making human manipulation mathematically and economically impossible.

---

### Core Functions

#### `placeBet(string memory _marketId, uint8 _outcome)`
Allows users to deposit ETH and establish positions on market outcomes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `_marketId` | `string` | Unique identifier for the target event |
| `_outcome` | `uint8` | Position: `1` (YES) or `2` (NO) |

**Requirements:**
- Market must remain unsettled
- Bet amount must exceed zero

---

#### `resolveMarket(string memory _marketId, uint8 _outcome)`
Locks the market and establishes the final winning outcome.

| Parameter | Type | Description |
|-----------|------|-------------|
| `_marketId` | `string` | Target market identifier |
| `_outcome` | `uint8` | Winning outcome: `1` (YES) or `2` (NO) |

**Access Control:** 🔒 `msg.sender == trigslinkManager` (strict enforcement)

---

#### `claimWinnings(string memory _marketId)`
Calculates and distributes rewards to users who predicted correctly.

| Parameter | Type | Description |
|-----------|------|-------------|
| `_marketId` | `string` | Market from which to claim |

**Payout Formula:**
```
(User Bet ÷ Total Winning Pool) × Total Market Pool
```

**Security Implementation:**
- State updates precede ETH transfers (reentrancy prevention)
- Automatic reversion for non-winners or duplicate claims

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Basic familiarity with Hardhat

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/trigslink-contract.git

# Navigate to project directory
cd trigslink-contract

# Install dependencies
npm install
```

---

## 💻 Development

This repository leverages **Hardhat v2.22.17** for a stable, CommonJS-compatible development environment.

### Compile Contract

Generate ABIs and TypeChain typings:

```bash
npx hardhat compile
```

**Expected Output:**
```
Compiled 1 Solidity file successfully
Artifacts generated in ./artifacts
TypeChain typings generated in ./typechain-types
```

### Run Tests

Execute the comprehensive test suite to verify manager constraints and payout mathematics:

```bash
npx hardhat test
```

**Test Coverage Includes:**
- ✅ Manager-only resolution enforcement
- ✅ Proportional payout calculations
- ✅ Reentrancy protection
- ✅ Edge case handling

---

## 🗺️ Roadmap: Universal Liquidity Rails (ULR)

The current vault establishes our foundation. **Phase 2** introduces cross-chain expansion through Chainlink CCIP integration:

### 🌉 Universal Liquidity Rails

| Feature | Description |
|---------|-------------|
| **L2 Compatibility** | Users on Base, Arbitrum, and Optimism can participate |
| **Cross-Chain Liquidity** | Bet against pools on Ethereum or Solana |
| **Unified Experience** | Seamless interface across ecosystems |

---

## 📄 License

This project is licensed under the MIT License—see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

We welcome contributions from the community. Please review our contribution guidelines before submitting pull requests.

---

## ⚠️ Security Considerations

- **Manager Address:** This immutable reference must point to trusted, verified autonomous code
- **Market Resolution:** Only the manager can resolve markets—no backdoors exist
- **Reentrancy Protection:** State updates consistently precede external calls

---

## 📬 Contact & Support

- **Documentation:** [docs.trigslink.io](https://docs.trigslink.io)
- **Discord:** [Join our community](https://discord.gg/trigslink)
- **Twitter:** [@Trigslink](https://twitter.com/Trigslink)

---

*Built for the autonomous future of finance.*