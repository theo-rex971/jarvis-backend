// server.js
// Backend "Jarvis" : Telegram + OpenAI + n8n

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
    hasOpenAIKey: Boolean(OPENAI_API_KEY),
    hasTelegramToken: Boolean(TELEGRAM_BOT_TOKEN),
    hasN8NWebhook: Boolean(N8N_WEBHOOK_URL),
    timestamp: new Date().toISOString(),
  });
});

// 🧩 Helper : appel OpenAI (Chat Completions)
async function generateJarvisReply(userMessage) {
  if (!OPENAI_API_KEY) {
    return "Je n'ai pas encore de clé OpenAI configurée sur le serveur.";
  }

  try {
    const url = "https://api.openai.com/v1/chat/completions";

    const body = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es Jarvis, l'assistant personnel de Théo Rex. " +
            "Tu réponds en français, de manière courte, claire, utile et concrète. " +
            "Tu es spécialisé en growth hacking, marketing digital, automation, n8n, Rexcellence Consulting et RenoRex.",
        },
        {
          role: "user",
          content: userMessage || "",
        },
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
      const errorText = await response.text();
      console.error("Erreur OpenAI:", errorText);
      return "Je rencontre un problème avec le moteur d'IA, réessaie dans quelques minutes.";
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return reply || "Je n'ai pas réussi à générer une réponse utile cette fois.";
  } catch (error) {
    console.error("Exception OpenAI:", error);
    return "Une erreur est survenue côté IA, je n'ai pas pu répondre correctement.";
  }
}

// 🧩 Helper : envoyer un message à Telegram
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN manquant, impossible de répondre.");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const body = {
      chat_id: chatId,
      text: text || "Je n'ai rien à répondre pour le moment.",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("Erreur sendMessage Telegram:", await response.text());
    }
  } catch (err) {
    console.error("Exception lors de l'envoi Telegram:", err);
  }
}

// 🧩 Helper : envoyer les infos vers n8n (log / automation)
async function sendToN8n(payload) {
  if (!N8N_WEBHOOK_URL) {
    return;
  }

  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Erreur lors de l'envoi vers n8n:", err);
  }
}

// 🔔 Webhook Telegram : quand quelqu'un parle à ton bot, ça arrive ici
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;

    // Vérif basique : on ne traite que les messages texte
    if (!update || !update.message) {
      return res.sendStatus(200);
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || "";
    const username = message.from?.username || "";
    const firstName = message.from?.first_name || "";

    console.log("📩 Message Telegram reçu:", {
      chatId,
      username,
      text,
    });

    // 1) Générer la réponse avec OpenAI (Jarvis)
    const aiReply = await generateJarvisReply(text);

    // 2) Répondre à l'utilisateur dans Telegram
    await sendTelegramMessage(chatId, aiReply);

    // 3) Push vers n8n pour logs / automatisations
    await sendToN8n({
      source: "telegram",
      chatId,
      username,
      firstName,
      userMessage: text,
      aiReply,
      timestamp: new Date().toISOString(),
    });

    // Toujours répondre 200 à Telegram pour indiquer que le webhook est OK
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erreur dans /telegram-webhook:", error);
    // On renvoie tout de même 200 pour éviter que Telegram spamme le webhook
    res.status(200).json({ ok: false });
  }
});

// (Optionnel) Route principale Jarvis pour d'autres clients HTTP (future /jarvis si tu veux)
// Tu pourras ajouter ici des actions spécifiques plus tard.

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
