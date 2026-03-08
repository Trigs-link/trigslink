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
    
    // Smart Parsing: Look specifically for "FINAL ANSWER: SPAM" or "FINAL ANSWER: VALID"
    const match = content.match(/FINAL ANSWER:\s*(SPAM|VALID)/i);
    return (match && match[1].toUpperCase() === "SPAM") ? 1 : 2;
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
    
    const match = content.match(/FINAL ANSWER:\s*(SPAM|VALID)/i);
    return (match && match[1].toUpperCase() === "SPAM") ? 1 : 2;
}

export async function evaluateSpam(question: string): Promise<boolean> {
    console.log(`\n--- [Trigslink CRE] Front-Door Spam Audit Initiated ---`);
    console.log(`Question to audit: "${question}"\n`);

    // The Chain of Thought Prompt: Strict Auditor Persona
    const prompt = `You are a strict, objective auditor for a decentralized prediction market.
    Review this proposed market question: "${question}"
    
    A valid prediction market question MUST be:
    1. Entirely objective (no opinions).
    2. Factually verifiable by a specific date.
    3. Clearly written and not gibberish or spam.
    
    Step 1: Briefly analyze if the question meets all three criteria.
    Step 2: Provide your final ruling.
    
    You MUST conclude your response with a new line containing exactly:
    FINAL ANSWER: VALID
    or
    FINAL ANSWER: SPAM`;

    console.log(`[Trigslink CRE] Querying the 5-Node Security Mesh...`);

    const nodeRequests = [
        queryGemini(prompt),
        queryStandardNode('https://api.groq.com/openai/v1/chat/completions', 'llama-3.1-8b-instant', process.env.GROQ_API_KEY, prompt),
        queryStandardNode('https://openrouter.ai/api/v1/chat/completions', 'openrouter/free', process.env.OPENROUTER_API_KEY, prompt),
        queryStandardNode('https://api.mistral.ai/v1/chat/completions', 'mistral-small-latest', process.env.MISTRAL_API_KEY, prompt),
        queryStandardNode('https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile', process.env.GROQ_API_KEY, prompt)
    ];

    const results = await Promise.allSettled(nodeRequests);

    let spamVotes = 0, validVotes = 0, failedNodes = 0;
    const modelNames = ["Google Gemini", "Groq (Llama 3.1)", "OpenRouter", "Mistral AI", "Groq (Llama 3.3)"];

    console.log(`\n--- Spam Audit Tally ---`);
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const vote = result.value;
            if (vote === 1) spamVotes++;
            else if (vote === 2) validVotes++;
            console.log(`[Node ${index + 1}] ${modelNames[index]} processed as: ${vote === 1 ? 'SPAM' : 'VALID'}`);
        } else {
            failedNodes++;
            console.log(`[Node ${index + 1}] ${modelNames[index]} FAILED to respond.`);
        }
    });

    console.log(`\n--- Security Consensus ---`);
    console.log(`SPAM: ${spamVotes} | VALID: ${validVotes} | FAILED: ${failedNodes}`);

    // If 4 out of 5 agree it's clean, let it through. 
    if (validVotes >= 4) {
        console.log(`[Trigslink CRE] ✅ >80% Consensus Reached: Market is VALID.`);
        return false; // isSpam = false
    } 
    
    // Otherwise, protocol safety first. Block it.
    console.log(`[Trigslink CRE] 🛑 Consensus failed or flagged as SPAM. Blocking market.`);
    return true; // isSpam = true
}