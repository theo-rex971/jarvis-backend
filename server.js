// server.js
// Backend "Jarvis" : Telegram + Orchestrateur OpenAI + n8n

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// 🔑 Variables d'environnement
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY n'est pas configurée !");
}
if (!TELEGRAM_BOT_TOKEN) {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN n'est pas configuré !");
}
if (!N8N_WEBHOOK_URL) {
  console.warn("⚠️ N8N_WEBHOOK_URL n'est pas configurée !");
}

// Middlewares
app.use(express.json());

// Route de test simple
app.get("/", (req, res) => {
  res.send("Jarvis backend est en ligne ✅");
});

// Route de santé
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Jarvis backend fonctionne",
    timestamp: new Date().toISOString(),
  });
});

// 🧩 Helper : envoyer un message à Telegram
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN manquant, impossible de répondre.");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("Erreur sendMessage Telegram:", await response.text());
  }
}

// 🧩 Helper : envoyer des données vers n8n
async function sendToN8n(payload) {
  if (!N8N_WEBHOOK_URL) {
    console.warn("N8N_WEBHOOK_URL non défini, je ne peux pas appeler n8n.");
    return;
  }

  try {
    console.log("🚀 Envoi vers n8n :", N8N_WEBHOOK_URL);

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("❌ Réponse n8n non OK :", await response.text());
    } else {
      console.log("✅ Appel n8n réussi");
    }
  } catch (err) {
    console.error("Erreur lors de l'envoi vers n8n:", err);
  }
}

// 🧠 Orchestrateur : analyse le message et renvoie un JSON de tâches
async function analyzeWithAgent(userMessage) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante pour l'orchestrateur.");
  }

  const url = "https://api.openai.com/v1/chat/completions";


  const systemPrompt = `
const systemPrompt = `
Tu es “Jarvis Orchestrateur”, l’IA maître de Théo Rex (consultant marketing, growth hacker, automatisation, contenu, ads, funnel, data, B2B/B2C, RenoRex & Rexcellence Consulting).

OBJECTIF :
Tu reçois un message libre via Telegram.  
Tu dois analyser le besoin, comprendre le contexte, et produire un JSON propre que n8n utilisera pour activer des sous-agents.

RÈGLES :
- Analyse toujours via le modèle AARRR : acquisition, activation, rétention, referral, revenu.
- Si infos manquent → mets null ou [].
- Si demande floue → crée au moins : audit_360 + growth_strategy.
- Retourne UNIQUEMENT un JSON valide. Jamais de texte hors JSON.

SOUS-AGENTS DISPONIBLES :
1) audit_360 → analyse complète (site, offre, persona, concurrents, AARRR, messages, canaux, prix, objections, opportunités).
2) growth_strategy → stratégie globale (leviers, priorités, quickwins, ads, contenus, SEO, messages, conversions).
3) scraping → LinkedIn (gratuit), Sales Navigator (si fourni), Webscraper.io, Pages Jaunes, Societe.com, annuaires, recherche Google ; enrichissement low cost : Dropcontact, Lemlist.
4) cold_email → séquence courte (AIDA/PAS/BAB/5W2H), approches, angles, variables, CTA.
5) content → posts (LinkedIn, Insta, Facebook, YouTube, TikTok, Pinterest, Google), scripts vidéo, carrousels, landing pages, ton : consultatif/premium/friendly/catchy.
6) ads → Meta Ads, Google Ads, TikTok Ads, Pinterest Ads ; recommandations audiences, créas, événements clé.
7) data_analysis → GA4, GTM, Meta Ads events : clics, conversions, tracking, anomalies.
8) automation → n8n/Make/Zapier ; mapping input→output, triggers, séquences.
9) rag_memory → stockage Supabase pour historique (id, project, entity_type, tags…).

FORMAT JSON À PRODUIRE :
{
  "natural_reply": "phrase courte destinée à Théo",
  "company": {
    "name": "string|null",
    "project": "rexcellence|renorex|autre|null",
    "industry": "string|null",
    "size": "freelance|tpe|pme|scaleup|corp|null",
    "geo": "string|null"
  },
  "intent": "audit_360|growth_strategy|scraping|content|cold_email|ads|automation|data_analysis|rag_memory|internal_question",
  "funnel_focus": ["acquisition","activation","retention","referral","revenue"],
  "tasks": [
    {
      "agent_type": "audit_360|growth_strategy|scraping|content|cold_email|ads|automation|data_analysis|rag_memory",
      "funnel_stage": "acquisition|activation|retention|referral|revenue|null",
      "priority": 1,
      "details": {
        "persona": "string|null",
        "topics": ["string"],
        "problems": ["string"],
        "channels": ["linkedin","instagram","facebook","youtube","tiktok","pinterest","google"],
        "tone": "consultatif|premium|friendly|punchy|catchy|storytelling|null",
        "competitors": ["https://..."],
        "metrics_focus": ["cpc","cpa","ltv","closing_rate"],
        "format": "post|carrousel|landing_page|video_script|null",
        "enrichment": ["dropcontact","lemlist"],
        "emails_count": 4
      }
    }
  ]
}
`.trim();


  const body = {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage || "" },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("Erreur OpenAI orchestrateur:", await response.text());
    throw new Error("Erreur lors de l'appel à l'orchestrateur.");
  }

  const data = await response.json();

  let parsed;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    console.error("JSON orchestrateur invalide:", data);
    throw new Error("Réponse JSON invalide de l'orchestrateur.");
  }

  return parsed; // { natural_reply, company, intent, funnel_focus, tasks: [...] }
}

// 🔔 Webhook Telegram : reçoit les messages et passe par l'orchestrateur
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;

    if (!update || !update.message) {
      return res.sendStatus(200);
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const username = message.from?.username || "";
    const firstName = message.from?.first_name || "";

    console.log("📩 Message Telegram reçu:", { chatId, username, text });

    // 1) Analyse via l'orchestrateur (OpenAI)
    const analysis = await analyzeWithAgent(text);

    // 2) Réponse "humaine" pour toi dans Telegram
    const naturalReply =
      analysis.natural_reply ||
      "C'est noté, je commence à analyser et à préparer les prochaines étapes.";
    await sendTelegramMessage(chatId, naturalReply);

    // 3) Envoi vers n8n du JSON complet pour orchestration
    await sendToN8n({
      source: "telegram_orchestrator",
      chatId,
      username,
      firstName,
      userMessage: text,
      analysis,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erreur dans /telegram-webhook:", error);
    // On répond quand même 200 à Telegram pour éviter des retries en boucle
    res.status(200).json({ ok: false });
  }
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
