// server.js
// Backend "Jarvis" en Node + Express

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// On récupère les variables d'environnement
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

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
 * Route principale Jarvis
 * Format attendu côté ChatGPT (mode JARVIS) :
 * {
 *   "jarvis_action": "run_n8n_workflow",
 *   "payload": { ... }
 * }
 *
 * On garde aussi la compatibilité avec :
 * {
 *   "action": "run_n8n_workflow",
 *   "payload": { ... }
 * }
 */
app.post("/jarvis", async (req, res) => {
  const body = req.body || {};

  // On accepte soit "jarvis_action", soit "action"
  const action = body.jarvis_action || body.action;
  const payload = body.payload || {};

  console.log("Requête reçue sur /jarvis :", body);

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

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
