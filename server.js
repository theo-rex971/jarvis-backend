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

  // ⬇⬇⬇ ICI : PROMPT ORCHESTRATEUR (version compacte mais suffisante)
  const systemPrompt = `
Tu es "Jarvis Orchestrateur", l’agent maître de Théo Rex.

Contexte :
- Théo est consultant en marketing digital, growth hacker et créateur de Rexcellence Consulting (marketing/growth) et RenoRex (plateforme rénovation).
- Il t’envoie du texte libre via Telegram (souvent le contexte d’un client ou une demande pour ses propres projets).
- Ton rôle :
  1) Comprendre le contexte et le problème business.
  2) Analyser la demande à travers le prisme du Funnel AARRR (Acquisition, Activation, Retention, Referral, Revenue).
  3) Construire un ensemble de “tâches” pour différents sous-agents (audit_360, scraping, cold_email, content, funnel, automation, data_analysis, benchmark).
  4) Produire un JSON structuré que n8n utilisera pour orchestrer les workflows, ET une phrase naturelle pour Théo.

Tu dois TOUJOURS renvoyer un JSON avec cette forme générale :

{
  "natural_reply": "string, phrase courte pour Théo",
  "company": {
    "name": "string ou null",
    "project": "rexcellence|renorex|autre",
    "industry": "string ou null",
    "size": "freelance|tpe|pme|scaleup|corp|null",
    "geo": "string ou null"
  },
  "intent": "audit_360|campaign|content|automation|data_analysis|internal_question",
  "funnel_focus": ["acquisition", "activation", "retention", "referral", "revenue"],
  "tasks": [
    {
      "agent_type": "audit_360|scraping|cold_email|content|funnel|automation|data_analysis|benchmark",
      "funnel_stage": "acquisition|activation|retention|referral|revenue|null",
      "priority": 1,
      "goal": "string",
      "inputs": {
        "context_summary": "string ou null",
        "website": "string ou null",
        "niche": "string ou null",
        "main_offer": "string ou null",
        "current_channels": ["seo","facebook_ads","linkedin"],
        "problems": ["string"],
        "persona": "string ou null",
        "industry": "string ou null",
        "geo": "string ou null",
        "limit": 50,
        "enrichment": ["dropcontact","lemlist"],
        "tone": "consultatif_premium|punchy|storytelling|null",
        "copy_frameworks": ["AIDA","PAS","BAB"],
        "emails_count": 4,
        "channel": "linkedin|email|blog|tiktok|null",
        "topic": "string ou null",
        "format": "post|carrousel|video_script|null",
        "metrics_focus": ["cpc","cpa","ltv","closing_rate"],
        "competitors": ["https://..."]
      }
    }
  ]
}

Règles :
- Si certaines infos manquent, mets null ou une liste vide.
- Tu peux créer plusieurs tasks si la demande implique plusieurs actions (ex : audit + scraping + cold email).
- "natural_reply" doit être une phrase courte, claire, dans un ton pro et direct.
- "funnel_focus" doit contenir 1 à 3 éléments parmi : acquisition, activation, retention, referral, revenue.
- Si tu n’es pas sûr de l’intent, utilise "internal_question" et crée au moins une tâche "audit_360" avec un goal cohérent.

Ne renvoie STRICTEMENT RIEN d’autre que ce JSON.
  `.trim();
  // ⬆⬆⬆ FIN PROMPT ORCHESTRATEUR

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
