import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Trigslink Governance & Execution Flow", function () {
  let trigsToken: any;
  let vault: any;
  let governance: any;
  let owner: any;
  let alice: any; // Proposer
  let bob: any;   // Voter
  let treasury: any;
  let mockChainlinkForwarder: any;

  const STAKE_AMOUNT = ethers.parseEther("0.01"); // 0.01 ETH

  beforeEach(async function () {
    [owner, alice, bob, treasury] = await ethers.getSigners();

    // 1. Deploy the $TRIGS Token
    const Token = await ethers.getContractFactory("TrigsToken");
    trigsToken = await Token.deploy();

    // 2. Deploy the Vault
    const Vault = await ethers.getContractFactory("TrigslinkVault");
    vault = await Vault.deploy(owner.address);

    // 3. Deploy Governance
    const Governance = await ethers.getContractFactory("TrigslinkGovernance");
    governance = await Governance.deploy(
      await trigsToken.getAddress(),
      await vault.getAddress(),
      treasury.address,
      STAKE_AMOUNT
    );
  });

  it("Full Lifecycle: Propose, Vote YES, Fast-Forward, and Execute", async function () {
    const marketId = "ETH_10K_2026";
    const question = "Will Ethereum hit $10k by 2026?";
    const dataSource = "https://coingecko.com";

    // ==========================================
    // STEP 1: Alice proposes a market (Stakes ETH)
    // ==========================================
    const aliceBalBefore = await ethers.provider.getBalance(alice.address);
    
    await governance.connect(alice).proposeMarket(marketId, question, dataSource, {
      value: STAKE_AMOUNT
    });

    const proposal = await governance.proposals(1);
    expect(proposal.question).to.equal(question);
    
    // Check that the contract holds the ETH stake
    const govEthBalance = await ethers.provider.getBalance(await governance.getAddress());
    expect(govEthBalance).to.equal(STAKE_AMOUNT);

    // ==========================================
    // STEP 2: Bob gets $TRIGS and votes YES
    // ==========================================
    // Bob uses the faucet to get 1,000 TRIGS
    await trigsToken.connect(bob).mintTestTokens();
    const bobTrigsBal = await trigsToken.balanceOf(bob.address);
    expect(bobTrigsBal).to.be.gt(0);

    // Bob votes YES (true) on Proposal #1
    await governance.connect(bob).vote(1, true);

    const updatedProposal = await governance.proposals(1);
    expect(updatedProposal.yesVotes).to.equal(bobTrigsBal); // 1000 tokens = 1000 votes

    // ==========================================
    // STEP 3: Time Travel
    // ==========================================
    // We fast forward the blockchain by 24 hours and 1 second
    await time.increase(24 * 60 * 60 + 1);

    // ==========================================
    // STEP 4: Execute the Proposal
    // ==========================================
    // Anyone can call execute. Let's have Bob do it.
    await governance.connect(bob).executeProposal(1);

    // Verify Alice got her ETH refunded (minus the gas she paid earlier)
    const aliceBalAfter = await ethers.provider.getBalance(alice.address);
    expect(aliceBalAfter).to.be.gt(aliceBalBefore - STAKE_AMOUNT);

    // Verify the proposal is marked as executed
    const finalProposal = await governance.proposals(1);
    expect(finalProposal.executed).to.be.true;
    expect(finalProposal.spam).to.be.false;

    // (Optional) If your Vault has a getter for markets, you can verify it's there
    // const vaultMarket = await vault.markets(marketId);
    // expect(vaultMarket.question).to.equal(question);
  });

  it("Should slash ETH and send to Treasury if voted NO (Spam)", async function () {
    // Alice Proposes
    await governance.connect(alice).proposeMarket("SPAM_MKT", "Spam?", "url", { value: STAKE_AMOUNT });

    // Bob mints TRIGS and votes NO (false)
    await trigsToken.connect(bob).mintTestTokens();
    await governance.connect(bob).vote(1, false);

    // Fast forward 24 hours
    await time.increase(24 * 60 * 60 + 1);

    const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);

    // Execute
    await governance.connect(bob).executeProposal(1);

    // Treasury should have received the slashed ETH
    const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryBalAfter - treasuryBalBefore).to.equal(STAKE_AMOUNT);

    const finalProposal = await governance.proposals(1);
    expect(finalProposal.spam).to.be.true; // Tagged as spam!
  });
});