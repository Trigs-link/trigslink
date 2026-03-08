import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { evaluateSpam } from './checkSpam';

// Look one directory up for the master .env file
dotenv.config({ path: '../.env' });

// Your fresh V2 Governance Contract on Sepolia
const GOVERNANCE_ADDRESS = "0xcacF8A1be612231414941023Db6D09Dc43d98291";

const GOVERNANCE_ABI = [
    "event MarketProposed(uint256 indexed proposalId, string marketId, address indexed creator, string question, uint256 stakeAmount, uint256 marketEndTime)",
    "function submitSpamCheck(uint256 _proposalId, bool _isSpam) external"
];

async function startAuditNode() {
    console.log("🛡️ Booting up Trigslink CRE Audit Node (Front Door)...");

    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.CRE_NODE_PRIVATE_KEY!, provider);
    const governanceContract = new ethers.Contract(GOVERNANCE_ADDRESS, GOVERNANCE_ABI, wallet);

    console.log(`📡 Listening for proposed markets on: ${GOVERNANCE_ADDRESS}`);
    console.log(`🔑 AI Worker Wallet: ${wallet.address}\n`);

    governanceContract.on("MarketProposed", async (proposalId, marketId, creator, question, stakeAmount, marketEndTime, event) => {
        console.log(`\n🚨 NEW MARKET PROPOSED! Proposal ID: ${proposalId.toString()}`);
        console.log(`Question: "${question}"`);
        
        try {
            console.log(`🧠 Running 5-Node AI Spam Audit...`);
            
            // 1. Run the 5-Node Consensus!
            const isSpam = await evaluateSpam(question);

            console.log(`\n[Result] Writing verdict to blockchain. Is Spam? ${isSpam}`);
            
            // 2. Fire the transaction back to Sepolia
            const tx = await governanceContract.submitSpamCheck(proposalId, isSpam);
            
            console.log(`⏳ Waiting for confirmation... Tx Hash: ${tx.hash}`);
            await tx.wait();
            
            console.log(`✅ SUCCESS! Proposal ${proposalId.toString()} checked and verified on-chain.`);

        } catch (error: any) {
            console.error(`❌ Node failed to verify market:`, error.message);
        }
    });
}

startAuditNode().catch(console.error);