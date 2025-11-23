// server.js
// Backend "Jarvis" en Node + Express

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// Variables d'environnement
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
    hasN8NWebhook: Boolean(N8N_WEBHOOK_URL),
    hasOpenAIKey: Boolean(OPENAI_API_KEY),
    hasTelegramToken: Boolean(TELEGRAM_BOT_TOKEN),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Petite fonction utilitaire : appel à OpenAI
 */
async function askOpenAI(userText) {
  if (!OPENAI_API_KEY) {
    return "Je n'ai pas de clé OpenAI configurée dans le backend.";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Tu es Jarvis, l'assistant growth hacker de Théo Rex. Tu réponds en français, de manière claire, synthétique et actionnable.",
          },
          {
            role: "user",
            content: userText,
          },
        ],
      }),
    });

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je n'ai pas réussi à générer une réponse (aucun contenu retourné).";

    return reply;
  } catch (error) {
    console.error("Erreur OpenAI :", error);
    return "Erreur lors de l'appel à OpenAI.";
  }
}

/**
 * Route principale Jarvis (pour n8n ou autres clients HTTP)
 * Tu lui envoies un JSON du style :
 * {
 *   "action": "run_n8n_workflow",
 *   "payload": { ... n'importe quelles données ... }
 * }
 */
app.post("/jarvis", async (req, res) => {
  const body = req.body || {};
  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ error: "Aucune action fournie." });
  }

  // 1) Cas : on veut lancer un workflow n8n
  if (action === "run_n8n_workflow") {
    if (!N8N_WEBHOOK_URL) {
      return res
        .status(500)
        .json({ error: "N8N_WEBHOOK_URL n'est pas configurée." });
    }

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      return res.json({
        source: "n8n",
        status: response.status,
        data,
      });
    } catch (error) {
      console.error("Erreur lors de l'appel à n8n:", error);
      return res.status(500).json({
        error: "Échec de l'appel au webhook n8n.",
        details: error.message,
      });
    }
  }

  // 2) Action inconnue
  return res.status(400).json({
    error: "Action inconnue.",
    receivedAction: action,
    payload,
  });
});

/**
 * Webhook Telegram : Telegram envoie les messages ici
 */
app.post("/telegram-webhook", async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN manquant.");
    return res.sendStatus(500);
  }

  const update = req.body;

  // On récupère le message texte (message normal ou édité)
  const message = update.message || update.edited_message;
  if (!message || !message.text) {
    // Rien à traiter (stickers, images, etc.)
    return res.sendStatus(200);
  }

  const chatId = message.chat.id;
  const userText = message.text;

  console.log("Message reçu depuis Telegram :", userText);

  // Appel à OpenAI pour générer une réponse
  const replyText = await askOpenAI(userText);

  // Envoi de la réponse vers Telegram
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
        }),
      }
    );
  } catch (error) {
    console.error("Erreur lors de l'envoi de la réponse Telegram :", error);
  }

  // Toujours répondre 200 à Telegram, même si on a eu une erreur après
  res.sendStatus(200);
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
