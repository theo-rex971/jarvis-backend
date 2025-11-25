// server.js
// Backend "Jarvis" : Telegram + Orchestrateur OpenAI + n8n + RAG Supabase

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// 🔑 Variables d'environnement
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; // webhook n8n
const SUPABASE_URL = process.env.SUPABASE_URL; // ex: https://xxxx.supabase.co
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // clé service role

if (!OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY n'est pas configurée");
}
if (!TELEGRAM_BOT_TOKEN) {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN n'est pas configuré");
}

// Middleware
app.use(express.json());

// ----------------------------------------
// 1. Helpers génériques
// ----------------------------------------

// Envoi de message Telegram
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      console.error("Erreur sendMessage Telegram:", await res.text());
    }
  } catch (err) {
    console.error("Erreur réseau Telegram:", err.message);
  }
}

// Envoi vers n8n (logging / actions)
async function sendToN8n(payload) {
  if (!N8N_WEBHOOK_URL) return;
  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Erreur lors de l'envoi vers n8n:", err.message);
  }
}

// Sauvegarde mémoire dans Supabase (RAG)
async function saveMemoryToSupabase(memory) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  try {
    const url = `${SUPABASE_URL}/rest/v1/ai_memory`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(memory),
    });

    if (!res.ok) {
      console.error("Erreur Supabase:", await res.text());
    }
  } catch (err) {
    console.error("Erreur réseau Supabase:", err.message);
  }
}

// ----------------------------------------
// 2. Orchestrateur OpenAI (Jarvis maître)
// ----------------------------------------

const ORCHESTRATOR_SYSTEM_PROMPT = `
Tu es "Jarvis Orchestrateur", l’agent maître de Théo Rex.

Contexte :
- Théo est consultant en marketing digital, growth hacker, créateur de Rexcellence Consulting (marketing/growth) et RenoRex (plateforme de rénovation).
- Il t’envoie du texte libre via Telegram (souvent le contexte d’un client ou une demande pour ses propres projets).

Ton rôle :
1) Comprendre le contexte, le marché (B2B & B2C) et le vrai problème business.
2) Analyser la demande à travers le prisme du funnel AARRR :
   - Acquisition
   - Activation
   - Rétention
   - Référentiel / Référencement
   - Revenu
3) Construire un ensemble de "tâches" pour différents sous-agents :
   - audit_360 (diagnostic global + funnel, concurrence incluse)
   - growth_strategy (stratégie growth globale, pas seulement acquisition)
   - scraping (priorité outils gratuits / low-cost : WebScraper, annuaires, Pages Jaunes, Societe.com, etc.)
   - cold_email (séquences email & outils type Lemlist / Dropcontact)
   - content (calendrier + contenus multi-plateformes : LinkedIn, Instagram, Facebook, TikTok, Pinterest, YouTube, Google Business Profile, Google Ads, landing pages, scripts vidéos, etc. incl. usage de Canva & CapCut)
   - automation (idées d’automatisation / n8n / no-code)
   - data_analysis (GTM, GA4, Meta Ads, tracking, conversions)
   - rag_memory (quelles infos archiver dans la base mémoire Supabase)
4) Produire :
   - une phrase de réponse courte et naturelle pour Théo (en français)
   - un JSON structuré que n8n pourra exploiter pour lancer ou paramétrer les workflows.

Tu dois TOUJOURS renvoyer un JSON avec cette forme générale :

{
  "natural_reply": "string, phrase courte pour Théo",
  "company": {
    "name": "string ou null",
    "project": "rexcellence|renorex|autre",
    "industry": "string ou null",
    "size": "freelance|tpe|pme|scaleup|corp|null",
    "geo": "string ou null",
    "persona": "string ou null"
  },
  "funnel_focus": ["acquisition", "activation", "retention", "referral", "revenue"],
  "intent": "audit_360|growth_strategy|scraping|cold_email|content|automation|data_analysis|internal_question",
  "tasks": [
    {
      "agent_type": "audit_360|growth_strategy|scraping|cold_email|content|automation|data_analysis|rag_memory",
      "priority": 1,
      "funnel_stage": ["acquisition","activation","retention","referral","revenue"],
      "goal": "string (objectif clair)",
      "inputs": {
        "scraping": {
          "targets": ["linkedin","sales_navigator","pages_jaunes","societe.com","annuaires","sites concurrents"],
          "keywords": ["string"],
          "geo": "string ou null",
          "notes": "string ou null",
          "budget_tools": "free_first|minimum_paid|null"
        },
        "cold_email": {
          "persona": "string ou null",
          "offer": "string ou null",
          "tone": "consultatif|friendly|catchy|storytelling",
          "frameworks": ["AIDA","PAS","BAB","5W2H"],
          "tools": ["lemlist","gmail","autre|null"]
        },
        "content": {
          "channels": ["linkedin","instagram","facebook","tiktok","pinterest","youtube","google_business","google_ads","landing_page"],
          "topic": "string ou null",
          "format": ["post","carousel","video_script","shorts","reel","newsletter","landing_page"],
          "tone": "consultatif_premium|friendly|catchy|accrocheur|storytelling",
          "use_tools": ["canva","capcut","autre|null"],
          "kpi": ["reach","engagement","clicks","leads","sales"]
        },
        "growth_strategy": {
          "hypotheses": ["string"],
          "levers": ["ads","seo","content","referral","email","product","pricing"],
          "constraints": ["budget","deadline","resources"]
        },
        "audit_360": {
          "scope": ["brand","funnel","ads","content","website","crm","data","competition"],
          "competitors": ["https://..."],
          "need_funnel_audit": true
        },
        "data_analysis": {
          "stack": ["gtm","ga4","meta_ads"],
          "events": ["click","view","form_submit","purchase"],
          "questions": ["string"]
        },
        "rag_memory": {
          "save": true,
          "summary": "string à stocker",
          "tags": ["rexcellence","audit_360","architectes","acquisition"],
          "table": "ai_memory",
          "schema_hint": ["id","project","entity_type","tags","content","created_at"]
        }
      }
    }
  ]
}

Règles :
1) Si certaines informations manquent, mets null ou des listes vides.
2) Tu peux créer plusieurs tâches si la demande implique plusieurs axes (ex : audit_360 + scraping + content + rag_memory).
3) "natural_reply" doit être une phrase courte, claire, friendly, avec une suggestion d’action.
4) "funnel_focus" DOIT contenir entre 1 et 3 étapes parmi : acquisition, activation, retention, referral, revenue.
5) Si tu n’es pas sûr de l’intention, utilise "internal_question" mais propose quand même au moins une tâche "audit_360" + éventuellement "growth_strategy".
6) Le JSON doit être parfaitement valide. AUCUN texte en dehors de l’objet JSON.
7) Tu ne renvoies STRICTEMENT RIEN d’autre que ce JSON.
`.trim();

// Appel OpenAI
async function callOrchestrator(userMessage) {
  if (!OPENAI_API_KEY) {
    return {
      natural_reply:
        "Je n’ai pas encore de clé OpenAI côté serveur, je ne peux pas orchestrer pour le moment.",
      tasks: [],
    };
  }

  try {
    const url = "https://api.openai.com/v1/chat/completions";

    const body = {
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
        { role: "user", content: userMessage || "" },
      ],
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Erreur OpenAI:", txt);
      return {
        natural_reply:
          "Je rencontre un problème avec le moteur d’IA, réessaie dans quelques minutes.",
        tasks: [],
      };
    }

    const data = await res.json();
    const content =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    let parsed;
    try {
      parsed = content ? JSON.parse(content) : {};
    } catch (e) {
      console.error("JSON orchestrateur invalide:", e);
      parsed = {};
    }

    return parsed;
  } catch (err) {
    console.error("Erreur réseau OpenAI:", err.message);
    return {
      natural_reply:
        "Je rencontre un problème réseau avec l’IA, réessaie un peu plus tard.",
      tasks: [],
    };
  }
}

// ----------------------------------------
// 3. Routes
// ----------------------------------------

// Ping simple
app.get("/", (req, res) => {
  res.send("Jarvis backend est en ligne ✅");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Jarvis backend fonctionne",
    timestamp: new Date().toISOString(),
  });
});

// Webhook Telegram
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body || {};

    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    const chatId = msg.chat && msg.chat.id;
    const text = msg.text || "";
    const firstName = (msg.from && msg.from.first_name) || "";

    console.log("📩 Message Telegram reçu:", { chatId, text });

    // 1) Appel orchestrateur
    const orchestration = await callOrchestrator(text);

    const replyText =
      orchestration.natural_reply ||
      "OK, j’ai bien reçu ta demande, je commence à analyser tout ça.";

    // 2) Réponse à l’utilisateur
    if (chatId) {
      await sendTelegramMessage(chatId, replyText);
    }

    // 3) Sauvegarde RAG si demandé
    if (
      orchestration.tasks &&
      Array.isArray(orchestration.tasks)
    ) {
      const ragTask = orchestration.tasks.find(
        (t) => t.agent_type === "rag_memory"
      );

      if (ragTask && ragTask.inputs && ragTask.inputs.rag_memory) {
        const m = ragTask.inputs.rag_memory;
        if (m.save && m.summary) {
          await saveMemoryToSupabase({
            project:
              (orchestration.company && orchestration.company.project) ||
              "unknown",
            entity_type: "conversation",
            tags: m.tags || [],
            content: m.summary,
          });
        }
      }
    }

    // 4) Envoi brut vers n8n pour exploitation
    await sendToN8n({
      source: "telegram_orchestrator",
      chatId,
      userFirstName: firstName,
      userMessage: text,
      orchestration,
      time: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erreur /telegram-webhook:", err);
    return res.status(200).json({ ok: false });
  }
});

// ----------------------------------------
// 4. Lancement serveur
// ----------------------------------------

app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
