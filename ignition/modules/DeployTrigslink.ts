import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TrigslinkSystem", (m) => {
  // 1. Deploy the $TRIGS Token
  const trigsToken = m.contract("TrigsToken");

  const deployer = m.getAccount(0); 

  // 2. Deploy the Vault (passing your address as the mock forwarder)
  const vault = m.contract("TrigslinkVault", [deployer]);

  // 3. Set Governance Parameters (0.001 Sepolia ETH stake)
  const stakeRequired = 1_000_000_000_000_000n; 

  // 4. Deploy Governance linked to Token and Vault
  const governance = m.contract("TrigslinkGovernance", [
    trigsToken,
    vault,
    deployer,
    stakeRequired
  ]);

  return { trigsToken, vault, governance };
});
