import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TrigslinkSystemV3", (m) => {
  // ==========================================
  // 🛑 SETUP YOUR ADDRESSES HERE
  // ==========================================
  
  // Wallet 1: The Boss (Pulled automatically from your .env private key)
  const deployerTreasury = m.getAccount(0); 

  // Wallet 2: The AI Worker (Paste the PUBLIC address of your new CRE Node wallet here)
  const creNodeAddress = "0x4beA5fAa1135EDA554A2a16854836022bd51e98A";

  // Your already-deployed $TRIGS Token
  const trigsTokenAddress = "0xc463bB636C67642870e2e82ebAdbd29e2C10eAFa";

  // ==========================================
  // 1. DEPLOY THE VAULT
  // ==========================================
  // Constructor: address _chainlinkForwarder
  const vault = m.contract("TrigslinkVault", [creNodeAddress]);

  // ==========================================
  // 2. DEPLOY GOVERNANCE
  // ==========================================
  // 0.05 ETH Stake, 0.01 ETH Reward
  const stakeRequired = 50_000_000_000_000_000n; 
  const rewardAmount = 10_000_000_000_000_000n;  

  // Constructor: address _trigsToken, address _vault, address _treasury, address _creSpamNode, uint256 _stakeRequired, uint256 _rewardAmount
  const governance = m.contract("TrigslinkGovernance", [
    trigsTokenAddress,
    vault,
    deployerTreasury,  // Treasury receives slashed ETH
    creNodeAddress,    // Spam node verifies questions
    stakeRequired,
    rewardAmount
  ]);

  // ==========================================
  // 3. THE SECURITY HANDSHAKE
  // ==========================================
  // This automatically calls setGovernanceAddress on the Vault right after deployment!
  m.call(vault, "setGovernanceAddress", [governance]);

  return { vault, governance };
});