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
    timestamp: new Date().toISOString(),
  });
});

// 🧩 Helpers ------------------------------------------------------

// Appel OpenAI (Chat Completions)
async function generateJarvisReply(userMessage) {
  if (!OPENAI_API_KEY) {
    return "Je n'ai pas de clé OpenAI configurée pour le moment.";
  }

  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model: "gpt-4o-mini", // modèle rapide & pas cher
    messages: [
      {
        role: "system",
        content:
          "Tu es Jarvis, l'assistant personnel de Théo Rex. " +
          "Tu réponds de manière courte, claire, utile et concrète. " +
          "Tu peux parler de growth hacking, marketing, automation et des projets Rexcellence Consulting / RenoRex.",
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
    console.error("Erreur OpenAI:", await response.text());
    return "Je rencontre un problème pour générer une réponse avec l'IA.";
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();

  return reply || "Je n'ai pas réussi à générer une réponse.";
}

// Envoi d'un message à Telegram
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

// Envoi vers n8n (pour logs ou commandes)
async function sendToN8n(payload) {
  if (!N8N_WEBHOOK_URL) return;

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

// Détecter si le message est une commande n8n
function isN8nCommand(text) {
  return text.startsWith("/n8n");
}

// Gérer une commande Telegram → n8n
async function handleTelegramCommand({ text, chatId, username, firstName }) {
  if (!N8N_WEBHOOK_URL) {
    await sendTelegramMessage(
      chatId,
      "Je ne peux pas lancer n8n : aucun webhook N8N_WEBHOOK_URL n'est configuré."
    );
    return;
  }

  const command = text.split(" ")[0]; // /n8n
  const args = text.slice(command.length).trim(); // tout ce qu'il y a après

  // Envoi vers n8n
  await sendToN8n({
    source: "telegram",
    mode: "command",
    command,
    args,
    chatId,
    username,
    firstName,
    timestamp: new Date().toISOString(),
  });

  // Feedback utilisateur
  await sendTelegramMessage(
    chatId,
    `✅ Workflow n8n lancé avec la commande : ${command}${
      args ? " " + args : ""
    }`
  );
}

// 🔔 Webhook Telegram ---------------------------------------------
app.post("/telegram-webhook", async (req, res) => {
  try {
    const update = req.body;

    // Sécurité basique : vérifier que c'est bien un message
    if (!update || !update.message) {
      return res.sendStatus(200);
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const username = message.from?.username || "";
    const firstName = message.from?.first_name || "";

    console.log("📩 Message Telegram reçu:", {
      chatId,
      username,
      text,
    });

    // 1) Si c'est une commande n8n => on déclenche n8n et on s'arrête là
    if (isN8nCommand(text)) {
      await handleTelegramCommand({ text, chatId, username, firstName });
      return res.status(200).json({ ok: true });
    }

    // 2) Sinon, on passe par l'IA (chat classique)
    const aiReply = await generateJarvisReply(text);

    // Répondre à l'utilisateur sur Telegram
    await sendTelegramMessage(chatId, aiReply);

    // Envoyer les infos vers n8n juste pour logs / analyse (optionnel)
    await sendToN8n({
      source: "telegram",
      mode: "chat",
      chatId,
      username,
      firstName,
      userMessage: text,
      aiReply,
      timestamp: new Date().toISOString(),
    });

    // Réponse au webhook Telegram (important)
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erreur dans /telegram-webhook:", error);
    res.status(200).json({ ok: false });
  }
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
