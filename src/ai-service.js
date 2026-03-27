import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { readData } from './json-db.js';

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
You are a senior YouTube growth strategist, CTR optimization expert, and viral content specialist.

Your goal is to generate HIGH-PERFORMANCE YouTube metadata that maximizes:
- Click Through Rate (CTR)
- Search Ranking (YouTube SEO)
- Watch Time & Retention Relevance

VIDEO CONTEXT:
- Niche: ${niche}
- Topic/File Name: ${niche}
- Reference Title (if any): ${referenceTitle || 'None'}
- Target Country: ${country || 'Global'}
- Category ID: ${category || '22'}

---

### 🎯 STRATEGY GUIDELINES:

- Prioritize HUMAN psychology over keyword stuffing
- Use proven viral title structures:
  • Curiosity gap
  • Emotional trigger (nostalgia, love, mystery, relaxation)
  • Clear benefit/outcome
  • Pattern interrupt (LIVE, Late Night, 24/7, etc.)

- Avoid robotic or repetitive phrasing
- Make content feel like a "must-click experience"
- Titles must feel organic, not spammy

---

### 1. TITLE (CRITICAL FOR CTR)
- Max 60–70 characters
- Must include primary keyword naturally
- Use power words (nostalgic, late night, emotional, timeless, etc.)
- Add context enhancer (LIVE, Playlist, Radio, Mix, etc. if relevant)
- Avoid ALL CAPS spam

---

### 2. DESCRIPTION (OPTIMIZED FOR RETENTION + SEO)
STRUCTURE:
- Line 1–2: Strong emotional hook (make people feel something)
- Line 3–5: What viewers will experience / value
- Middle: Natural keyword placement (SEO without stuffing)
- CTA: Subscribe / Like / Comment (soft, not aggressive)
- End: Hashtags

INCLUDE:
- 5–10 hashtags
- Mix of global + localized hashtags
- Relevant keywords woven naturally

---

### 3. TAGS (SEO BOOST)
- 12–15 tags
- Mix:
  • High volume keywords
  • Long-tail keywords
  • Niche-specific phrases
- Avoid irrelevant tags

---

### 4. CULTURAL ADAPTATION
- If Indonesia → use Bahasa Indonesia + local vibe (e.g. “lagu nostalgia”, “teman malam”, “musik santai”)
- If Global → use natural fluent English
- Match tone with audience behavior (chill, romantic, late-night listeners, etc.)

---

### ⚠️ IMPORTANT RULES:
- DO NOT repeat the same phrases
- DO NOT overstuff keywords
- DO NOT sound AI-generated
- Make it feel like a real viral video

---

### OUTPUT FORMAT (STRICT JSON ONLY):
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
                title: (referenceTitle || niche).replace(/\.[^/.]+$/, "").substring(0, 100),
                description: `Automatically uploaded video: ${niche}\nTarget: ${country}`,
                tags: [niche, 'youtube', 'shorts'],
                category: "22"
            };
        }
    }

    async callGemini(prompt) {
        try {
            const ai = new GoogleGenAI({ apiKey: this.geminiKey });
            const result = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt
            });

            const text = result.text;
            if (!text) {
                console.error('[Gemini] Empty response received.');
                throw new Error('AI returned empty response');
            }

            console.log('[DEBUG] AI Raw Response:', text.substring(0, 100) + '...');
            return this.parseJSON(text);
        } catch (err) {
            console.error('[Gemini Error]', err.message);
            throw err; // Propagate to generation handler for fallback
        }
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

export default new AIService();
