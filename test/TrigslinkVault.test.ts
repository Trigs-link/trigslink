import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TrigslinkVault", function () {
  // --- FIXTURE: Deploys the contract and creates a snapshot ---
  async function deployVaultFixture() {
    // Get multiple signers to simulate different roles
    const [deployer, trigslinkManager, user1, user2] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("TrigslinkVault");
    // Deploying with the Manager address as the constructor argument
    const vault = await Vault.deploy(trigslinkManager.address);

    return { vault, deployer, trigslinkManager, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set the correct TrigslinkManager address", async function () {
      const { vault, trigslinkManager } = await loadFixture(deployVaultFixture);
      expect(await vault.trigslinkManager()).to.equal(trigslinkManager.address);
    });
  });

  describe("Placing Bets", function () {
    it("Should update the total pool and emit a BetPlaced event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const marketId = "BTC_100K_MAY";
      const betAmount = ethers.parseEther("1.5");

      // Place bet and check for the event emission
      await expect(vault.connect(user1).placeBet(marketId, { value: betAmount }))
        .to.emit(vault, "BetPlaced")
        .withArgs(marketId, user1.address, betAmount);

      // Verify the total pool was updated
      const market = await vault.markets(marketId);
      expect(market.totalPool).to.equal(betAmount);
    });

    it("Should track individual user bets correctly", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);
      const marketId = "ETH_10K_DEC";
      const betAmount1 = ethers.parseEther("2.0");
      const betAmount2 = ethers.parseEther("3.0");

      await vault.connect(user1).placeBet(marketId, { value: betAmount1 });
      await vault.connect(user2).placeBet(marketId, { value: betAmount2 });

      // Assuming your userBets mapping is structured as: mapping(string => mapping(address => uint256))
      // Note: Nested mappings can't be fetched directly in one call via ethers without a getter function, 
      // but the total pool should equal the sum.
      const market = await vault.markets(marketId);
      expect(market.totalPool).to.equal(betAmount1 + betAmount2);
    });
  });

  describe("Autonomous Resolution", function () {
    it("Should allow the TrigslinkManager to resolve the market", async function () {
      const { vault, trigslinkManager } = await loadFixture(deployVaultFixture);
      const marketId = "BTC_100K_MAY";
      const OUTCOME_YES = 1;

      await expect(vault.connect(trigslinkManager).resolveMarket(marketId, OUTCOME_YES))
        .to.emit(vault, "MarketResolved")
        .withArgs(marketId, OUTCOME_YES);

      const market = await vault.markets(marketId);
      expect(market.resolved).to.be.true;
      expect(market.finalOutcome).to.equal(OUTCOME_YES);
    });

    it("Should REVERT if anyone other than the Manager tries to resolve", async function () {
      const { vault, deployer, user1 } = await loadFixture(deployVaultFixture);
      const marketId = "BTC_100K_MAY";
      const OUTCOME_YES = 1;

      // The original deployer should fail
      await expect(vault.connect(deployer).resolveMarket(marketId, OUTCOME_YES))
        .to.be.revertedWith("Only the Trigslink Manager can resolve");

      // A random user should fail
      await expect(vault.connect(user1).resolveMarket(marketId, OUTCOME_YES))
        .to.be.revertedWith("Only the Trigslink Manager can resolve");
    });
  });
});