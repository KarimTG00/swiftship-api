import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { AnonymousClient } from "../models/AnonymousClient.js";
import { identiteAnonyme } from "../middlewares/identiteAnonyme.js";

const router = Router();

// Routes PUBLIQUES : aucune authentification, l'identite vient du cookie.
router.use(identiteAnonyme);

// Un formulaire public ouvert est une cible a spam : limite serree.
const limiteEnvoi = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erreur: "Trop de messages envoyes. Patiente un instant." },
});

const MAX_CORPS = 5000;

function serialiserMessage(message) {
  return {
    id: message._id.toString(),
    auteurType: message.auteurType,
    corps: message.corps,
    envoyeLe: message.createdAt,
  };
}

// Une seule conversation par visiteur dans ce modele simplifie : pas de fil
// par expedition, le vendeur rattache manuellement si besoin (§9).
async function conversationDu(client) {
  const existante = await Conversation.findOne({
    type: "CLIENT",
    anonymousClientId: client._id,
  });
  if (existante) return existante;

  return Conversation.create({
    type: "CLIENT",
    anonymousClientId: client._id,
  });
}

router.get("/conversation", async (req, res) => {
  const conversation = await conversationDu(req.clientAnonyme);

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  res.json({
    // Le client n'a pas besoin de connaitre son identifiant anonyme : le
    // cookie suffit, et l'exposer inviterait a le manipuler.
    emailRenseigne: Boolean(req.clientAnonyme.email),
    messages: messages.map((m) => ({
      id: m._id.toString(),
      auteurType: m.auteurType,
      corps: m.corps,
      envoyeLe: m.createdAt,
    })),
  });
});

router.post("/messages", limiteEnvoi, async (req, res) => {
  const corps = typeof req.body?.corps === "string" ? req.body.corps.trim() : "";

  if (!corps) {
    return res.status(400).json({ erreur: "Le message est vide." });
  }
  if (corps.length > MAX_CORPS) {
    return res.status(400).json({ erreur: "Le message est trop long." });
  }

  const conversation = await conversationDu(req.clientAnonyme);

  const message = await Message.create({
    conversationId: conversation._id,
    auteurType: "CLIENT",
    corps,
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: { dernierMessageLe: message.createdAt },
      $inc: { nonLusAgence: 1 },
    },
  );

  res.status(201).json({
    message: serialiserMessage(message),
    // Tant que l'email manque, le widget affiche le formulaire de contact.
    emailRenseigne: Boolean(req.clientAnonyme.email),
  });
});

router.post("/contact", limiteEnvoi, async (req, res) => {
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const nom = typeof req.body?.nom === "string" ? req.body.nom.trim() : "";

  // Validation volontairement souple : le but est de pouvoir repondre, pas de
  // rejeter une adresse au format inhabituel.
  if (!email || !email.includes("@") || email.length > 320) {
    return res.status(400).json({ erreur: "Adresse email invalide." });
  }

  await AnonymousClient.updateOne(
    { _id: req.clientAnonyme._id },
    { $set: { email, ...(nom ? { nom } : {}) } },
  );

  res.json({ emailRenseigne: true });
});

export default router;
