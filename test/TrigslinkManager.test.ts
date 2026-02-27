import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Trigslink Ecosystem Integration", function () {
  async function deployEcosystemFixture() {
    const [deployer, mockChainlinkRouter, user1] = await ethers.getSigners();

    // 1. THE TRICK: Predict the Manager's address before deploying it!
    const deployerNonce = await deployer.getNonce();
    const predictedManagerAddress = ethers.getCreateAddress({
      from: deployer.address,
      nonce: deployerNonce + 1, // The Manager will be deployed on the next transaction
    });

    // 2. Deploy the Vault using the predicted Manager address
    const Vault = await ethers.getContractFactory("TrigslinkVault");
    const vault = await Vault.deploy(predictedManagerAddress);
    await vault.waitForDeployment();

    // 3. Deploy the Manager, passing it the freshly deployed Vault's address
    const Manager = await ethers.getContractFactory("TrigslinkManager");
    const donId = ethers.encodeBytes32String("fun-ethereum-mainnet-1"); // Standard Chainlink DON ID
    const manager = await Manager.deploy(
      mockChainlinkRouter.address,
      donId,
      1, // Mock Subscription ID
      await vault.getAddress()
    );
    await manager.waitForDeployment();

    return { vault, manager, deployer, mockChainlinkRouter, user1 };
  }

  describe("System Wiring", function () {
    it("Should link the Vault and the Manager together perfectly", async function () {
      const { vault, manager } = await loadFixture(deployEcosystemFixture);

      // Verify the Vault trusts the Manager
      expect(await vault.trigslinkManager()).to.equal(await manager.getAddress());

      // Verify the Manager controls the right Vault
      expect(await manager.vault()).to.equal(await vault.getAddress());
      
      console.log("✅ Brain and Vault successfully linked!");
    });
  });

  describe("AI Trigger Execution", function () {
    it("Should allow a user to trigger an AI resolution request", async function () {
      const { manager, user1 } = await loadFixture(deployEcosystemFixture);

      const marketId = "BTC_100K";
      const promptArgs = ["Check official news wires for BTC price crossing 100k"];

      // THE FIX: Give the Manager some dummy JavaScript code to run before triggering it
      const dummyJavaScript = "return Functions.encodeUint256(1);";
      await manager.setAiVerificationSource(dummyJavaScript);

      // Verify that calling the trigger correctly formats the request and emits the event
      await expect(manager.connect(user1).triggerMarketResolution(marketId, promptArgs))
        .to.emit(manager, "ResolutionTriggered");
    });
  });
});