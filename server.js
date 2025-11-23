// server.js
// Petit backend "Jarvis" en Node + Express

const express = require("express");
const app = express();

// Render te donnera un PORT automatiquement.
// En local, on utilisera 3000.
const PORT = process.env.PORT || 3000;

// Pour lire le JSON envoyé dans les requêtes POST
app.use(express.json());

// Route de test simple : racine "/"
app.get("/", (req, res) => {
  res.send("Jarvis backend est en ligne ✅");
});

// Route de santé : "/health"
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Jarvis backend fonctionne",
    timestamp: new Date().toISOString(),
  });
});

// Route "/jarvis" qui recevra plus tard les ordres et parlera à ChatGPT + n8n.
// Pour l'instant, elle fait juste écho de ce qu'on lui envoie.
app.post("/jarvis", (req, res) => {
  console.log("Requête reçue sur /jarvis :", req.body);

  res.json({
    message: "Jarvis backend a bien reçu ta demande",
    received: req.body,
  });
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Jarvis backend écoute sur le port ${PORT}`);
});
