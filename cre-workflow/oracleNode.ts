import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { run } from './resolveMarket';

dotenv.config();

// Your live Sepolia TrigslinkVault contract
const VAULT_ADDRESS = "0xaB9612273273Ca9AA61C35125E99C840651AA7E9";

// This ABI matches your TrigslinkVault.sol exactly
const VAULT_ABI = [
    "event SettlementRequested(string indexed marketId, string question, string dataSource)",
    "function onReport(bytes calldata metadata, bytes calldata report) external"
];

async function startCRENode() {
    console.log("🟢 Booting up live Trigslink CRE Node on Sepolia...");

    // Connect to Sepolia and your Node Wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY!, provider);
    const vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

    console.log(`📡 Listening for events on Vault: ${VAULT_ADDRESS}`);
    console.log(`🔑 Node Wallet Address: ${wallet.address}`);
    console.log(`⚠️ (Ensure this exact wallet address was set as the chainlinkForwarder during deployment!)\n`);

    // Listen for the SettlementRequested event
    vaultContract.on("SettlementRequested", async (marketId, question, dataSource, event) => {
        console.log(`\n🔔 SETTLEMENT WAKE-UP CALL! Market ID: ${marketId}`);
        console.log(`Question: "${question}"`);
        
        try {
            // 1. Run the Decentralized AI Consensus
            const consensusData = { marketId, question, dataSource };
            const result = await run(consensusData);
            
            console.log(`\n[Trigslink CRE] ✍️ Packing data for the EVM...`);
            
            // 2. Encode the string and uint8 into bytes so the contract can decode it
            const abiCoder = ethers.AbiCoder.defaultAbiCoder();
            const encodedReport = abiCoder.encode(
                ["string", "uint8"], 
                [result.marketId, result.outcome]
            );
            
            // We pass "0x" for the metadata, and the encoded data for the report
            const emptyMetadata = "0x";

            // 3. Fire the transaction to Sepolia!
            console.log(`[Trigslink CRE] 🚀 Firing onReport transaction to the blockchain...`);
            const tx = await vaultContract.onReport(emptyMetadata, encodedReport);
            
            console.log(`⏳ Waiting for block confirmation... Tx Hash: ${tx.hash}`);
            await tx.wait();
            
            console.log(`✅ SUCCESS! Market ${marketId} resolved on-chain to Outcome ${result.outcome}!`);

        } catch (error: any) {
            console.error(`❌ Node failed to resolve Market ${marketId}:`, error.message);
        }
    });
}

startCRENode().catch(console.error);