import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// Helper for Gemini
async function queryGemini(prompt: string): Promise<number> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }]
    });
    const content = response.data.candidates[0].content.parts[0].text;
    
    console.log(`\n[RAW Gemini]\n${content}\n`);
    
    // Smart Parsing: Look specifically for "FINAL ANSWER: YES" or "FINAL ANSWER: NO"
    const match = content.match(/FINAL ANSWER:\s*(YES|NO)/i);
    return (match && match[1].toUpperCase() === "YES") ? 1 : 2;
}

// Universal helper for Groq, Mistral, and OpenRouter
async function queryStandardNode(url: string, model: string, apiKey: string | undefined, prompt: string): Promise<number> {
    if (!apiKey) throw new Error(`Missing API Key for ${model}`);
    
    const response = await axios.post(url, {
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1 
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });
    const content = response.data.choices[0].message.content;
    
    console.log(`\n[RAW ${model}]\n${content}\n`);
    
    // Smart Parsing: Look specifically for "FINAL ANSWER: YES" or "FINAL ANSWER: NO"
    const match = content.match(/FINAL ANSWER:\s*(YES|NO)/i);
    return (match && match[1].toUpperCase() === "YES") ? 1 : 2;
}

export async function run(eventParams: any) {
    const { marketId, question } = eventParams;

    console.log(`\n--- [Trigslink CRE] Decentralized Settlement Initiated ---`);
    console.log(`Market ID: ${marketId}`);
    console.log(`Question: "${question}"\n`);

    // The Chain of Thought Prompt: Let them think first!
    const prompt = `You are a strict, objective market settlement oracle.
    Resolve this prediction market using your internal verified knowledge:
    Question: "${question}"
    
    Step 1: Briefly state the known historical facts regarding this specific question.
    Step 2: Based on those facts, provide your final settlement.
    
    You MUST conclude your response with a new line containing exactly:
    FINAL ANSWER: YES
    or
    FINAL ANSWER: NO`;

    console.log(`[Trigslink CRE] Querying 5 distinct AI networks...`);

    const nodeRequests = [
        queryGemini(prompt),
        queryStandardNode('https://api.groq.com/openai/v1/chat/completions', 'llama-3.1-8b-instant', process.env.GROQ_API_KEY, prompt),
        queryStandardNode('https://openrouter.ai/api/v1/chat/completions', 'openrouter/free', process.env.OPENROUTER_API_KEY, prompt),
        queryStandardNode('https://api.mistral.ai/v1/chat/completions', 'mistral-small-latest', process.env.MISTRAL_API_KEY, prompt),
        queryStandardNode('https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile', process.env.GROQ_API_KEY, prompt)
    ];

    const results = await Promise.allSettled(nodeRequests);

    let yesVotes = 0, noVotes = 0, failedNodes = 0;
    const modelNames = ["Google Gemini", "Groq (Llama 3.1)", "OpenRouter (Auto-Free)", "Mistral AI", "Groq (Llama 3.3)"];

    console.log(`\n--- Tallying Votes ---`);
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const vote = result.value;
            if (vote === 1) yesVotes++;
            else if (vote === 2) noVotes++;
            console.log(`[Node ${index + 1}] ${modelNames[index]} processed as: ${vote === 1 ? 'YES' : 'NO'}`);
        } else {
            failedNodes++;
            const errorMsg = result.reason?.response?.data?.error?.message || result.reason?.message || "Unknown error";
            console.log(`[Node ${index + 1}] ${modelNames[index]} FAILED. Reason: ${errorMsg}`);
        }
    });

    console.log(`\n--- Consensus Tally ---`);
    console.log(`YES: ${yesVotes} | NO: ${noVotes} | FAILED: ${failedNodes}`);

    if (yesVotes >= 4) {
        console.log(`[Trigslink CRE] ✅ >80% Consensus Reached: YES (1)`);
        return { marketId, outcome: 1 };
    } 
    
    if (noVotes >= 4) {
        console.log(`[Trigslink CRE] ✅ >80% Consensus Reached: NO (2)`);
        return { marketId, outcome: 2 };
    }

    console.log(`[Trigslink CRE] ⚠️ Consensus Failed. Triggering Phase 2...`);
    throw new Error("CONSENSUS_FAILED_PHASE_2_REQUIRED");
}