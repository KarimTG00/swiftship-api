import { Router } from "express";
import rateLimit from "express-rate-limit";
import { User } from "../models/User.js";
import { verifier, verifierLeurre } from "../services/motDePasse.js";
import { exigerAuth, serialiserUtilisateur } from "../middlewares/auth.js";

const router = Router();

// Limite specifique et bien plus stricte que celle de /api : la connexion est
// la cible naturelle des attaques par force brute.
const limiteConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true, // seules les tentatives ratees comptent
  message: { erreur: "Trop de tentatives de connexion. Reessaie plus tard." },
});

router.post("/login", limiteConnexion, async (req, res) => {
  const { email, motDePasse } = req.body ?? {};

  if (typeof email !== "string" || typeof motDePasse !== "string") {
    return res.status(400).json({ erreur: "Email et mot de passe requis" });
  }

  const utilisateur = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+passwordHash");

  // Meme message et meme temps de reponse dans tous les cas d'echec : sinon on
  // peut deviner quels emails existent (§37).
  const valide = utilisateur
    ? await verifier(motDePasse, utilisateur.passwordHash)
    : await verifierLeurre();

  if (!valide || !utilisateur.actif) {
    return res.status(401).json({ erreur: "Identifiants invalides" });
  }

  // Regeneration de l'identifiant de session a la connexion : sans ca, un
  // identifiant obtenu avant l'authentification resterait valable apres
  // (fixation de session).
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ erreur: "Erreur serveur" });

    req.session.utilisateurId = utilisateur._id.toString();
    req.session.save((err2) => {
      if (err2) return res.status(500).json({ erreur: "Erreur serveur" });
      res.json({ utilisateur: serialiserUtilisateur(utilisateur) });
    });
  });
});

router.post("/logout", (req, res) => {
  if (!req.session) return res.status(204).end();

  req.session.destroy(() => {
    res.clearCookie("swiftshipe.sid");
    res.status(204).end();
  });
});

router.get("/me", exigerAuth, (req, res) => {
  res.json({ utilisateur: serialiserUtilisateur(req.utilisateur) });
});

export default router;
