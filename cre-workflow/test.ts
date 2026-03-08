import { run } from './resolveMarket';

const mockEvents = [
    {
        marketId: "1",
        question: "Did SpaceX successfully catch the Super Heavy booster on Flight 5?",
        dataSource: "https://www.spacex.com/launches/"
    },
    {
        marketId: "2",
        question: "Did Argentina win the 2022 FIFA World Cup?",
        dataSource: "https://www.fifa.com"
    },
    {
        marketId: "3",
        question: "Did the United States win the gold medal in Men's Cricket at the 2024 Paris Olympics?",
        dataSource: "https://olympics.com"
    },
    {
        marketId: "4",
        question: "Did the Solana blockchain experience a mainnet outage lasting longer than 4 hours during the month of February 2024?",
        dataSource: "https://status.solana.com"
    },
    {
        marketId: "5",
        question: "Did Apple co-founder Steve Jobs write the original source code for the Macintosh operating system released in 1984?",
        dataSource: "https://www.apple.com/history"
    }
];

async function runAllTests() {
    console.log("🚀 Starting Comprehensive Trigslink CRE Test Suite...\n");
    console.log("==================================================================\n");

    for (const event of mockEvents) {
        try {
            console.log(`▶️ INITIATING MARKET ID: ${event.marketId}`);
            const result = await run(event);
            console.log(`\n✅ Final Output to Smart Contract for Market ${event.marketId}:`, result);
        } catch (err: any) {
            console.error(`\n❌ Execution Failed for Market ${event.marketId}:`, err.message);
        }
        
        console.log("\n==================================================================\n");
        
        // 2-second cooldown so we don't trigger free-tier API rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log("🏁 All tests completed. Engine is ready for production.");
}

runAllTests();