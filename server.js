// server.js
// Backend "Jarvis" en Node + Express

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// Variables d'environnement
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
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
    timestamp: new Date().toISOString(),
  });
});

/**
 * Route principale Jarvis pour n8n
 */
app.post("/jarvis", async (req, res) => {
  const body = req.body || {};
  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ error: "Aucune action fournie." });
  }

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

  return res.status(400).json({
    error: "Action inconnue.",
    receivedAction: action,
    payload,
  });
});

/**
 * Webhook Telegram
 * Telegram envoie ici toutes les updates du bot
 */
app.post("/telegram-webhook", async (req, res) => {
  try {
    console.log("Webhook Telegram reçu :", JSON.stringify(req.body, null, 2));

    const update = req.body;
    const message = update.message || update.edited_message;

    // Si ce n'est pas un message texte, on répond juste 200
    if (!message || !message.chat || !message.chat.id) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text = message.text || "";

    // Réponse très simple pour le test
    const replyText = `Tu as dit : ${text}`;

    if (!TELEGRAM_BOT_TOKEN) {
      console.error("TELEGRAM_BOT_TOKEN manquant dans les variables d'environnement");
      // On renvoie quand même 200 pour éviter que Telegram continue de retenter
      return res.sendStatus(200);
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
      }),
    });

    // Très important : toujours répondre 200 à Telegram
    res.sendStatus(200);
  } catch (err) {
    console.error("Erreur dans /telegram-webhook :", err);
    // On renvoie tout de même 200 pour que Telegram ne spamme pas
    res.sendStatus(200);
  }
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
