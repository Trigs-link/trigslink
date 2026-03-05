import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TrigslinkVault - CRE Autonomous Execution", function () {
  const DUMMY_URL = "https://api.trigslink.com/v1/source";

  // We use a fixture to deploy the contract once and reset the state instantly between tests
  async function deployVaultFixture() {
    const [deployer, user1, user2, mockChainlinkForwarder] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("TrigslinkVault");
    // We pass the mock forwarder's address to simulate the Chainlink Network
    const vault = await Vault.deploy(mockChainlinkForwarder.address);

    return { vault, deployer, user1, user2, mockChainlinkForwarder };
  }

  describe("1. Market Creation & Safety", function () {
    it("Should successfully create a market and log the AI question", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      
      const marketId = "ETH_5K_2026";
      const question = "Will Ethereum's price exceed $5,000 on Jan 1st, 2026?";

      // Updated to include 3 arguments and check 3 args in event
      await expect(vault.createMarket(marketId, question, DUMMY_URL))
        .to.emit(vault, "MarketCreated")
        .withArgs(marketId, question, DUMMY_URL);

      const market = await vault.markets(marketId);
      expect(market.question).to.equal(question);
      expect(market.dataSource).to.equal(DUMMY_URL); // Verify state storage
    });

    it("Should REJECT bets on ghost markets (The Vulnerability Patch)", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      
      const betAmount = ethers.parseEther("1.0");
      // Trying to bet on a market that hasn't been created yet
      await expect(
        vault.connect(user1).placeBet("FAKE_MARKET", 1, { value: betAmount })
      ).to.be.revertedWith("Market does not exist");
    });
  });

  describe("2. Betting & The CRE Trigger", function () {
    it("Should accept valid bets and track the pools accurately", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);
      const marketId = "AI_ACT";
      // Updated to 3 arguments
      await vault.createMarket(marketId, "Will the EU AI Act pass in 2026?", DUMMY_URL);

      const betAmount1 = ethers.parseEther("1.0");
      const betAmount2 = ethers.parseEther("2.0");

      // User 1 bets YES (Outcome 1)
      await vault.connect(user1).placeBet(marketId, 1, { value: betAmount1 });
      // User 2 bets NO (Outcome 2)
      await vault.connect(user2).placeBet(marketId, 2, { value: betAmount2 });

      const market = await vault.markets(marketId);
      expect(market.totalPool).to.equal(ethers.parseEther("3.0"));
      expect(market.outcome1Pool).to.equal(betAmount1);
      expect(market.outcome2Pool).to.equal(betAmount2);
    });

    it("Should emit the SettlementRequested event to wake up the off-chain Chainlink workflow", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const marketId = "AI_ACT";
      const question = "Will the EU AI Act pass in 2026?";
      // Updated to 3 arguments
      await vault.createMarket(marketId, question, DUMMY_URL);

      // Anyone can trigger the settlement request
      // Updated to expect 3 arguments in the event emission
      await expect(vault.connect(user1).requestSettlement(marketId))
        .to.emit(vault, "SettlementRequested")
        .withArgs(marketId, question, DUMMY_URL);
    });
  });

  describe("3. Autonomous Settlement & Winnings", function () {
    it("Should ALLOW the Chainlink Forwarder to push the AI report via onReport", async function () {
      const { vault, mockChainlinkForwarder } = await loadFixture(deployVaultFixture);
      const marketId = "AI_ACT";
      // Updated to 3 arguments
      await vault.createMarket(marketId, "Question?", DUMMY_URL);

      // Simulate the TypeScript CRE workflow formatting the answer (Outcome 1 = YES)
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const reportBytes = abiCoder.encode(["string", "uint8"], [marketId, 1]);
      const emptyMetadata = "0x";

      // The mock forwarder pushes the result
      await expect(
        vault.connect(mockChainlinkForwarder).onReport(emptyMetadata, reportBytes)
      )
        .to.emit(vault, "MarketResolved")
        .withArgs(marketId, 1);

      const market = await vault.markets(marketId);
      expect(market.resolved).to.be.true;
    });

    it("Should REJECT onReport calls from anyone else (Access Control)", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const marketId = "AI_ACT";
      // Updated to 3 arguments
      await vault.createMarket(marketId, "Question?", DUMMY_URL);

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const reportBytes = abiCoder.encode(["string", "uint8"], [marketId, 1]);

      // A random user tries to hack the settlement
      await expect(
        vault.connect(user1).onReport("0x", reportBytes)
      ).to.be.revertedWith("Only Chainlink DON can resolve");
    });

    it("Should correctly calculate and distribute the proportional payouts", async function () {
      const { vault, user1, user2, mockChainlinkForwarder } = await loadFixture(deployVaultFixture);
      const marketId = "AI_ACT";
      // Updated to 3 arguments
      await vault.createMarket(marketId, "Question?", DUMMY_URL);

      // User 1 bets 1 ETH on YES
      await vault.connect(user1).placeBet(marketId, 1, { value: ethers.parseEther("1.0") });
      // User 2 bets 3 ETH on NO
      await vault.connect(user2).placeBet(marketId, 2, { value: ethers.parseEther("3.0") });

      // Total Pool is 4 ETH. 

      // Chainlink DON resolves the market to YES (Outcome 1)
      const reportBytes = ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint8"], [marketId, 1]);
      await vault.connect(mockChainlinkForwarder).onReport("0x", reportBytes);

      // User 1 was the only winner, so they should get the entire 4 ETH pool
      const user1BalanceBefore = await ethers.provider.getBalance(user1.address);
      
      const claimTx = await vault.connect(user1).claimWinnings(marketId);
      const receipt = await claimTx.wait();
      const gasSpent = receipt!.gasUsed * receipt!.gasPrice;

      const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
      
      // Balance After = Balance Before + 4 ETH - Gas Spent
      expect(user1BalanceAfter + gasSpent - user1BalanceBefore).to.equal(ethers.parseEther("4.0"));

      // User 2 (Loser) tries to claim and fails
      await expect(
        vault.connect(user2).claimWinnings(marketId)
      ).to.be.revertedWith("No winning bets to claim");
    });
  });
});