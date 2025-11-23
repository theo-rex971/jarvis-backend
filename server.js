// server.js
// Backend "Jarvis" : Express + Telegram + OpenAI + n8n (prêt)

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// Variables d'environnement
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

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

/**
 * Route /jarvis : passerelle vers n8n
 * Attend un body :
 * {
 *   "action": "run_n8n_workflow",
 *   "payload": { ... }
 * }
 */
app.post("/jarvis", async (req, res) => {
  const body = req.body || {};
  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ error: "Aucune action fournie." });
  }

  // Cas : lancer un workflow n8n
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

  // Action inconnue
  return res.status(400).json({
    error: "Action inconnue.",
    receivedAction: action,
    payload,
  });
});

/**
 * Route webhook Telegram
 * Télégram envoie ici tous les messages reçus par ton bot.
 */
app.post("/telegram-webhook", async (req, res) => {
  // Telegram s'attend juste à un 200 rapide
  res.sendStatus(200);

  try {
    if (!TELEGRAM_API) {
      console.error("TELEGRAM_BOT_TOKEN manquant.");
      return;
    }

    const update = req.body;

    // On ne gère que les messages texte pour l'instant
    const message = update.message;
    if (!message || !message.text) {
      return;
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();

    console.log("Message Telegram reçu:", userText);

    // Si pas de clé OpenAI, on répond un message d'erreur
    if (!OPENAI_API_KEY) {
      await sendTelegramMessage(
        chatId,
        "⚠️ OPENAI_API_KEY n'est pas configurée sur le serveur."
      );
      return;
    }

    // Appel à l'API OpenAI pour générer la réponse de Jarvis
    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "Tu es Jarvis, l'assistant growth hacker de Théo Rex. " +
                "Réponds de manière claire, actionnable et moderne. " +
                "Tu peux proposer des idées de workflows n8n, mais pour l'instant tu ne les exécutes pas automatiquement.",
            },
            {
              role: "user",
              content: userText,
            },
          ],
        }),
      }
    );

    const data = await openAiResponse.json();
    const replyText =
      data?.choices?.[0]?.message?.content ||
      "Désolé, je n'ai pas réussi à générer de réponse.";

    await sendTelegramMessage(chatId, replyText);
  } catch (err) {
    console.error("Erreur dans /telegram-webhook:", err.message);
  }
});

/**
 * Fonction utilitaire : envoyer un message à Telegram
 */
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_API) return;

  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("Erreur lors de l'envoi du message Telegram:", err.message);
  }
}

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
