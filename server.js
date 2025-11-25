// --------------------------------------------------------------
// Jarvis Backend — Telegram -> Orchestrateur -> n8n
// --------------------------------------------------------------

import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --------------------------------------------------------------
// VARIABLES SECRETES
// --------------------------------------------------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY manquante");
if (!TELEGRAM_BOT_TOKEN) console.warn("⚠️ TELEGRAM_BOT_TOKEN manquant");
if (!N8N_WEBHOOK_URL) console.warn("⚠️ N8N_WEBHOOK_URL manquante");

// --------------------------------------------------------------
// HELPER OPENAI : ORCHESTRATEUR
// --------------------------------------------------------------
async function analyzeWithAgent(userMessage) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante.");
  }

  const url = "https://api.openai.com/v1/chat/completions";

  // ----------------------------------------------------------
  // PROMPT ORCHESTRATEUR – VERSION COMPACTE & ROBUSTE
  // ----------------------------------------------------------
  const systemPrompt = `
Tu es "Jarvis Orchestrateur", l’IA maître de Théo Rex.

Contexte :
- Théo est consultant en marketing digital, growth hacker et créateur de Rexcellence Consulting & RenoRex.
- Il t’envoie des messages libres via Telegram (B2B, B2C, missions clients, projets internes).
- Tu analyses tout via le funnel AARRR : acquisition, activation, rétention, referral, revenue.

Sous-agents disponibles :
- audit_360 (audit complet business + funnel + concurrents)
- growth_strategy (plan d’actions priorisé)
- scraping (annuaire, webscraper.io, PagesJaunes, Societe.com… low-cost)
- cold_email (scripts + séquences Lemlist-ready)
- content (LinkedIn, Instagram, TikTok, YouTube, Pinterest, Facebook,
           Google, Google Ads, landing pages, Canva, CapCut…)
- funnel (pages, tunnel, onboarding, nurturing)
- automation (n8n, Make, Zapier)
- data_analysis (GTM, GA4, Meta Ads, conversions, tracking)
- rag_memory (mémoire persistante via Supabase)
- internal_question (clarification)

Tu renvoies TOUJOURS uniquement un JSON strict :

{
  "natural_reply": "phrase courte friendly pour Théo",
  "company": {
    "name": "string|null",
    "project": "rexcellence|renorex|autre",
    "industry": "string|null",
    "size": "freelance|tpe|pme|scaleup|corp|null",
    "geo": "string|null",
    "b2b_b2c": "b2b|b2c|both|null"
  },
  "intent": "audit_360|growth_strategy|scraping|cold_email|content|funnel|automation|data_analysis|internal_question",
  "funnel_focus": ["acquisition","activation","retention","referral","revenue"],
  "tasks": [
    {
      "agent_type": "audit_360|growth_strategy|scraping|cold_email|content|funnel|automation|data_analysis|rag_memory|internal_question",
      "priority": 1,
      "goal": "string",
      "details": {},
      "funnel_stage": ["acquisition","activation","retention","referral","revenue"]
    }
  ],
  "rag": {
    "should_write": false,
    "summary": "string|null",
    "tags": ["rexcellence","audit_360"],
    "table": "ai_memory"
  }
}

Règles :
- Si un champ manque -> mets null ou liste vide.
- Plusieurs tâches si besoin (ex : audit + scraping + contenu).
- Ne renvoie rien d’autre que l’objet JSON.
`.trim();

  const body = {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage || "" }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    console.error("Erreur OpenAI orchestrateur:", msg);
    throw new Error("Echec de l'appel OpenAI");
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("JSON non parseable:", raw);
    throw err;
  }

  return parsed;
}

// --------------------------------------------------------------
// FONCTION : envoi Telegram
// --------------------------------------------------------------
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// --------------------------------------------------------------
// ROUTE TELEGRAM WEBHOOK
// --------------------------------------------------------------
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;
    if (!update.message) return res.sendStatus(200);

    const chatId = update.message.chat.id;
    const text = update.message.text || "";
    const firstName = update.message.from.first_name || "";

    // 1) Analyse avec OpenAI
    const analysis = await analyzeWithAgent(text);

    // 2) Réponse naturelle vers Telegram
    await sendTelegramMessage(chatId, analysis.natural_reply);

    // 3) Envoi full JSON vers n8n
    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "telegram_orchestrator",
        chatId,
        firstName,
        userMessage: text,
        analysis
      })
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Erreur /telegram-webhook :", err);
    return res.status(200).json({ ok: false });
  }
});

// --------------------------------------------------------------
// TEST : route GET
// --------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Jarvis backend opérationnel ✔️");
});

// --------------------------------------------------------------
// LANCEMENT
// --------------------------------------------------------------
app.listen(PORT, () => {
  console.log("🚀 Serveur lancé sur le port " + PORT);
});
