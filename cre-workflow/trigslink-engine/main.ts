import { EVMClient, handler, Runner, type Runtime, type EVMLog, hexToBase64, HTTPClient, getNetwork, type HTTPSendRequester, consensusIdenticalAggregation } from '@chainlink/cre-sdk';
import { keccak256, toBytes, decodeAbiParameters, parseAbiParameters, bytesToHex } from 'viem';

type Config = {};

// 🧠 Universal Helper for Groq and OpenRouter
function fetchStandardNode(sendRequester: HTTPSendRequester, args: { url: string, model: string, apiKey: string, prompt: string }): string {
    if (!args.apiKey) return "FAILED";
    try {
        const response = sendRequester.sendRequest({
            url: args.url,
            method: "POST",
            body: JSON.stringify({ // <-- FIX: Removed Buffer.from()
                model: args.model,
                messages: [{ role: "user", content: args.prompt }],
                temperature: 0.1
            }),
            headers: { 'Authorization': `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' }
        }).result();

        const bodyStr = new TextDecoder().decode(response.body);
        const content = JSON.parse(bodyStr).choices?.[0]?.message?.content;
        return content ? content.toUpperCase() : "ERROR";
    } catch (e) {
        return "FAILED";
    }
}

// 🧠 Gemini Helper
function fetchGemini(sendRequester: HTTPSendRequester, args: { apiKey: string, prompt: string }): string {
    if (!args.apiKey) return "FAILED";
    try {
        const response = sendRequester.sendRequest({
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${args.apiKey}`,
            method: "POST",
            body: JSON.stringify({ // <-- FIX: Removed Buffer.from()
                contents: [{ parts: [{ text: args.prompt }] }]
            }),
            headers: { 'Content-Type': 'application/json' }
        }).result();

        const bodyStr = new TextDecoder().decode(response.body);
        const content = JSON.parse(bodyStr).candidates?.[0]?.content?.parts?.[0]?.text;
        return content ? content.toUpperCase() : "ERROR";
    } catch (e) {
        return "FAILED";
    }
}

// 🕸️ Live Web Scraper
function fetchJina(sendRequester: HTTPSendRequester, url: string): string {
    try {
        const response = sendRequester.sendRequest({
            url: `https://r.jina.ai/${url}`,
            method: "GET",
            headers: { 'Accept': 'text/plain' }
        }).result();
        return new TextDecoder().decode(response.body).substring(0, 3000); 
    } catch (e) {
        return "NO DATA SCRAPED";
    }
}

const initWorkflow = (config: Config) => {
  // 1. Initialize directly. Skip getNetwork() to avoid WASM memory panics.
  const evmClient = new EVMClient(11155111n);
  const httpClient = new HTTPClient();

    // =====================================================================
    // 🛡️ PHASE 1: THE GATEKEEPER
    // ===========================================a==========================
    const spamTopic = keccak256(
      toBytes("ProposalCreated(uint256,string,address,string,string,uint256)")
    );
    const spamTrigger = evmClient.logTrigger({
        addresses: [hexToBase64("0xa3c6e2b06b3c511d52e7682ba0aec234f2ba692a")], // <-- UPDATE THIS LATER
        topics: [{ values: [spamTopic] }]
    });

    const onSpamTrigger = (runtime: Runtime<Config>, log: EVMLog) => {
        runtime.log("🛡️ [Gatekeeper] Proposal Detected. Decoding Live Event...");

        const rawHexData = bytesToHex(log.data);
        const decoded = decodeAbiParameters(
            parseAbiParameters('uint256 proposalId, string marketId, address creator, string question, string dataSource, uint256 endTime'),
            rawHexData
        );
        
        const proposalId = decoded[0].toString();
        const question = decoded[3];
        const dataSource = decoded[4];
        const endTime = Number(decoded[5]);

        runtime.log(`Analyzing Proposal ${proposalId}: "${question}"`);

        const currentDate = new Date().toUTCString();
        const marketEndDate = new Date(endTime * 1000).toUTCString();

        const geminiSecret = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();
        const geminiKey = geminiSecret ? geminiSecret.value : "";
        
        const groqSecret = runtime.getSecret({ id: "GROQ_API_KEY" }).result();
        const groqKey = groqSecret ? groqSecret.value : "";
        
        const openRouterSecret = runtime.getSecret({ id: "OPENROUTER_API_KEY" }).result();
        const openRouterKey = openRouterSecret ? openRouterSecret.value : "";

        const prompt = `You are a strict, objective auditor for a decentralized prediction market.
    
        CONTEXT:
        - The current real-world date and time is: ${currentDate}
        - The creator has set this market to close and resolve on: ${marketEndDate}
        
        MARKET DETAILS:
        - QUESTION: "${question}"
        - RESOLUTION RULES: "${dataSource}"
        
        A valid prediction market MUST meet ALL of these criteria:
        1. Future Event: The event must NOT have already occurred. Retroactive betting is fraud/spam.
        2. Logical Timeline: The market end date must logically occur AFTER the event is actually supposed to finish.
        3. Objective: Entirely objective and factually verifiable via the provided rules/source.
        4. No Paradoxes: It must not reference its own market state (e.g., "Will this market resolve to YES?").
        5. Clean: Clearly written and not gibberish.
        
        Step 1: Briefly analyze if the proposal meets ALL FIVE criteria. Pay strict attention to the dates.
        Step 2: Provide your final ruling.
        
        You MUST conclude your response with a new line containing exactly:
        FINAL ANSWER: VALID
        or
        FINAL ANSWER: SPAM`;

        const vote1 = httpClient.sendRequest(runtime, fetchGemini, consensusIdenticalAggregation<string>())(
            { apiKey: geminiKey, prompt }
        ).result();

        const vote2 = httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
            { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', apiKey: groqKey, prompt }
        ).result();

        const vote3 = httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
            { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3-8b-instruct:free', apiKey: openRouterKey, prompt }
        ).result();

        let validVotes = 0;
        if (vote1.includes("VALID")) validVotes++;
        if (vote2.includes("VALID")) validVotes++;
        if (vote3.includes("VALID")) validVotes++;

        const isSpam = validVotes < 2;
        runtime.log(`Gatekeeper Verdict: ${isSpam ? "SPAM 🛑" : "VALID ✅"} (Score: ${validVotes}/3)`);

        return { proposalId, isSpam };
    };

    // =====================================================================
    // ⚖️ PHASE 2: THE TRUTH ENGINE
    // =====================================================================
    const resolutionTopic = keccak256(
      toBytes("ResolutionRequested(string,string,string)")
    );
    const resolutionTrigger = evmClient.logTrigger({
        addresses: [hexToBase64("b989aaB780ae15E3820f8d97aE84D1bBB91914D2")], // <-- UPDATE THIS LATER
        topics: [{ values: [resolutionTopic] }]
    });

    const onResolutionTrigger = (runtime: Runtime<Config>, log: EVMLog) => {
        runtime.log("⚖️ [Truth Engine] Settlement Requested. Decoding Live Event...");

        const rawHexData = bytesToHex(log.data);
        const decoded = decodeAbiParameters(
            parseAbiParameters('string marketId, string question, string dataSource'),
            rawHexData
        );
        const marketId = decoded[0];
        const question = decoded[1];
        const dataSourceUrl = decoded[2];

        runtime.log(`Resolving Market ${marketId}: "${question}"`);

        const geminiSecret = runtime.getSecret({ id: "GEMINI_API_KEY" }).result();
        const geminiKey = geminiSecret ? geminiSecret.value : "";
        
        const groqSecret = runtime.getSecret({ id: "GROQ_API_KEY" }).result();
        const groqKey = groqSecret ? groqSecret.value : "";
        
        const openRouterSecret = runtime.getSecret({ id: "OPENROUTER_API_KEY" }).result();
        const openRouterKey = openRouterSecret ? openRouterSecret.value : "";
        
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = dataSourceUrl.match(urlRegex);
        
        const liveEvidence = urls 
            ? httpClient.sendRequest(runtime, fetchJina, consensusIdenticalAggregation<string>())(urls[0]).result() 
            : "NO URL PROVIDED";

        const prompt = `You are the Oracle for a decentralized prediction market. Your job is to resolve a market based STRICTLY on the live scraped evidence provided below. Do NOT use your internal training data.
    
        MARKET QUESTION: "${question}"
        
        LIVE SCRAPED EVIDENCE FROM THE DATA SOURCE:
        """
        ${liveEvidence}
        """
        
        INSTRUCTIONS:
        1. Does the scraped evidence definitively prove the event happened?
        2. If YES, reply ONLY with: FINAL VERDICT: YES
        3. If NO or it proves the opposite, reply ONLY with: FINAL VERDICT: NO
        4. If the evidence is broken or inconclusive, reply ONLY with: FINAL VERDICT: UNDECIDED`;

        runtime.log("Initiating Phase 1 (Initial 5-Node Mesh)...");

        const phase1Votes = [
            httpClient.sendRequest(runtime, fetchGemini, consensusIdenticalAggregation<string>())(
                { apiKey: geminiKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', apiKey: groqKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'mixtral-8x7b-32768', apiKey: groqKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'mistralai/mistral-7b-instruct:free', apiKey: openRouterKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemma-2-9b-it:free', apiKey: openRouterKey, prompt }
            ).result()
        ];

        let yesVotes = phase1Votes.filter(v => v.includes("YES")).length;
        let noVotes = phase1Votes.filter(v => v.includes("NO")).length;

        if (yesVotes >= 4) {
            runtime.log(`🏆 Phase 1 Consensus Reached: YES (${yesVotes}/5)`);
            return { marketId, outcome: 1 };
        } else if (noVotes >= 4) {
            runtime.log(`🛑 Phase 1 Consensus Reached: NO (${noVotes}/5)`);
            return { marketId, outcome: 2 };
        }

        runtime.log(`⚠️ Phase 1 Failed (YES: ${yesVotes}, NO: ${noVotes}). Escalating to Phase 2 (10 Nodes)...`);

        const phase2Votes = [
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'gemma2-9b-it', apiKey: groqKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant', apiKey: groqKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'microsoft/phi-3-mini-128k-instruct:free', apiKey: openRouterKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'qwen/qwen-2-7b-instruct:free', apiKey: openRouterKey, prompt }
            ).result(),
            httpClient.sendRequest(runtime, fetchStandardNode, consensusIdenticalAggregation<string>())(
                { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3-8b-instruct:free', apiKey: openRouterKey, prompt }
            ).result()
        ];

        yesVotes += phase2Votes.filter(v => v.includes("YES")).length;
        noVotes += phase2Votes.filter(v => v.includes("NO")).length;

        let finalOutcome = 0; 
        if (yesVotes >= 7) {
            finalOutcome = 1;
            runtime.log(`🏆 Phase 2 Consensus Reached: YES (${yesVotes}/10)`);
        } else if (noVotes >= 7) {
            finalOutcome = 2;
            runtime.log(`🛑 Phase 2 Consensus Reached: NO (${noVotes}/10)`);
        } else {
            runtime.log(`⏳ Total consensus failure. Market is highly ambiguous. UNDECIDED.`);
        }
        
        return { marketId, outcome: finalOutcome };
    };

    return [
        handler(spamTrigger, onSpamTrigger),
        handler(resolutionTrigger, onResolutionTrigger)
    ];
};

export async function main() {
    const runner = await Runner.newRunner<Config>();
    await runner.run(initWorkflow);
}