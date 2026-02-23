import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TrigslinkVault", function () {
  // --- FIXTURE: Deploys the contract once and snapshots the state ---
  async function deployVaultFixture() {
    const [deployer, trigslinkManager, user1, user2] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("TrigslinkVault");
    // Pass the Manager address to the constructor
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
    it("Should allow a user to bet on YES (Outcome 1) and update pools", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const marketId = "ETH_ETF_APPROVAL";
      const betAmount = ethers.parseEther("1.0");

      // Place bet on outcome 1
      await expect(vault.connect(user1).placeBet(marketId, 1, { value: betAmount }))
        .to.emit(vault, "BetPlaced")
        .withArgs(marketId, user1.address, 1, betAmount);

      const market = await vault.markets(marketId);
      expect(market.totalPool).to.equal(betAmount);
      expect(market.outcome1Pool).to.equal(betAmount);
      expect(market.outcome2Pool).to.equal(0n);
    });

    it("Should reject bets with invalid outcomes", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const marketId = "ETH_ETF_APPROVAL";
      const betAmount = ethers.parseEther("1.0");

      // Attempting to bet on outcome '3' should fail
      await expect(vault.connect(user1).placeBet(marketId, 3, { value: betAmount }))
        .to.be.revertedWith("Invalid outcome. Use 1 or 2.");
    });
  });

  describe("Autonomous Resolution & Payouts", function () {
    it("Should allow ONLY the Manager to resolve the market", async function () {
      const { vault, deployer, trigslinkManager } = await loadFixture(deployVaultFixture);
      const marketId = "AI_BILL_PASS";
      
      // Original deployer (human) tries and fails
      await expect(vault.connect(deployer).resolveMarket(marketId, 1))
        .to.be.revertedWith("Only Trigslink Manager can resolve");

      // The autonomous Manager succeeds
      await expect(vault.connect(trigslinkManager).resolveMarket(marketId, 1))
        .to.emit(vault, "MarketResolved")
        .withArgs(marketId, 1);
    });

    it("Should calculate and distribute winnings proportionally", async function () {
      const { vault, trigslinkManager, user1, user2 } = await loadFixture(deployVaultFixture);
      const marketId = "SOL_BREAKS_300";
      
      // Setup the pool
      // User 1 bets 1 ETH on YES (1)
      await vault.connect(user1).placeBet(marketId, 1, { value: ethers.parseEther("1.0") });
      // User 2 bets 3 ETH on NO (2)
      await vault.connect(user2).placeBet(marketId, 2, { value: ethers.parseEther("3.0") });

      // Total Pool is now 4 ETH. 
      // Manager resolves the market as YES (1).
      await vault.connect(trigslinkManager).resolveMarket(marketId, 1);

      // User 1 claims their winnings. Since they were the ONLY winner, 
      // they should receive the entire 4 ETH pool.
      await expect(vault.connect(user1).claimWinnings(marketId))
        .to.changeEtherBalances(
          [vault, user1],
          [-ethers.parseEther("4.0"), ethers.parseEther("4.0")]
        );
    });

    it("Should prevent losers from claiming payouts", async function () {
      const { vault, trigslinkManager, user1, user2 } = await loadFixture(deployVaultFixture);
      const marketId = "SOL_BREAKS_300";
      
      await vault.connect(user1).placeBet(marketId, 1, { value: ethers.parseEther("1.0") });
      await vault.connect(user2).placeBet(marketId, 2, { value: ethers.parseEther("1.0") });

      // Manager resolves as YES (1)
      await vault.connect(trigslinkManager).resolveMarket(marketId, 1);

      // User 2 (who bet NO) tries to claim and is rightfully rejected
      await expect(vault.connect(user2).claimWinnings(marketId))
        .to.be.revertedWith("No winning bets to claim");
    });
  });
});