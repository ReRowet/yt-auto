const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const { readData } = require('./json-db');

/**
 * Unified AI Service for Gemini and Groq (v2 - Targeted)
 */
class AIService {
    constructor() {
        this.updateConfig();
    }

    updateConfig() {
        const settings = readData('settings.json');
        this.provider = settings.preferredProvider || 'gemini';
        this.geminiKey = settings.geminiApiKey;
        this.groqKey = settings.groqApiKey;
    }

    /**
     * Generate YouTube Metadata using the preferred AI provider (V2.5)
     * @param {object} options { niche, referenceTitle, country, fileName, category }
     * @returns {Promise<object>}
     */
    async generateMetadata(options) {
        const { niche, referenceTitle, country, fileName, category } = options;
        this.updateConfig();
        
        const prompt = `
You are a senior YouTube growth strategist, SEO expert, and viral content specialist.

Your task is to generate highly optimized YouTube metadata that maximizes:
- Click-through rate (CTR)
- Search ranking (SEO)
- Audience retention relevance

Video Context:
- Niche: ${niche}
- Filename/Subject: ${fileName}
- Reference/Inspiration Title: ${referenceTitle || 'No reference'}
- Target Country: ${country || 'Global'}
- YouTube Category ID: ${category || '22'}

Instructions:

1. Title:
- Create a highly clickable, emotionally engaging title
- Use proven viral patterns (curiosity, benefit, emotion, numbers if relevant)
- Keep it natural (not clickbait spam)
- Optimize for YouTube SEO using primary keywords
- Max 60–70 characters if possible
- Adapt language and tone to the target country

2. Description:
- First 2 lines must hook the viewer (important for CTR)
- Include main keywords naturally (no keyword stuffing)
- Add a short value proposition (what viewers get)
- Include a call-to-action (subscribe / comment / like)
- Add 5–10 relevant hashtags
- Include localized hashtags for ${country || 'Global'}
- Make it readable and engaging (not robotic)

3. Tags:
- Provide 10–15 tags
- Mix of:
  - High volume keywords
  - Long-tail keywords
  - Niche-specific tags
- Keep them relevant to the video topic

4. Cultural Optimization:
- Adapt wording, tone, and hashtags to ${country || 'Global'}
- If country is Indonesia → use Bahasa Indonesia + local trends
- If Global → use neutral English

5. Output Rules:
- Return ONLY valid JSON
- No explanation, no extra text
- Make sure formatting is correct

Output format:
{
    "title": "...",
    "description": "...",
    "tags": ["...", "..."],
    "category": "${category || '22'}"
}
        `;

        try {
            if (this.provider === 'groq' && this.groqKey) {
                return await this.callGroq(prompt);
            } else if (this.geminiKey) {
                return await this.callGemini(prompt);
            } else {
                throw new Error('No AI Provider API key configured');
            }
        } catch (err) {
            console.error('AI Generation Error:', err.message);
            return {
                title: (referenceTitle || fileName).replace(/\.[^/.]+$/, "").substring(0, 100),
                description: `Automatically uploaded video: ${fileName}\nTarget: ${country}`,
                tags: [niche, 'youtube', 'shorts'],
                category: "22"
            };
        }
    }

    async callGemini(prompt) {
        const genAI = new GoogleGenerativeAI(this.geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return this.parseJSON(text);
    }

    async callGroq(prompt) {
        const groq = new Groq({ apiKey: this.groqKey });
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-8b-8192",
            response_format: { type: "json_object" }
        });
        return JSON.parse(chatCompletion.choices[0].message.content);
    }

    parseJSON(text) {
        try {
            const clean = text.replace(/```json|```/g, '').trim();
            return JSON.parse(clean);
        } catch (e) {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                return JSON.parse(text.substring(firstBrace, lastBrace + 1));
            }
            throw e;
        }
    }
}

module.exports = new AIService();
