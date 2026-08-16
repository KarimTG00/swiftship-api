import { Router } from "express";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { AnonymousClient } from "../models/AnonymousClient.js";
import { exigerAuth, exigerRole } from "../middlewares/auth.js";

const router = Router();

// Espace agence : toutes ces routes sont protegees.
router.use(exigerAuth, exigerRole("ADMIN", "VENDEUR"));

router.get("/", async (req, res) => {
  // Les conversations INTERNES (vendeur <-> livreur) ne sont pas concernees
  // ici : cette liste ne contient que les fils clients (§10).
  const conversations = await Conversation.find({ type: "CLIENT" })
    .sort({ dernierMessageLe: -1, createdAt: -1 })
    .limit(200)
    .lean();

  const identifiants = conversations.map((c) => c.anonymousClientId);
  const clients = await AnonymousClient.find({ _id: { $in: identifiants } })
    .select("email nom createdAt")
    .lean();

  const parId = new Map(clients.map((c) => [c._id, c]));

  const dernierParConversation = new Map();
  for (const conversation of conversations) {
    const dernier = await Message.findOne({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .select("corps auteurType createdAt")
      .lean();
    if (dernier) dernierParConversation.set(String(conversation._id), dernier);
  }

  res.json({
    conversations: conversations.map((c) => {
      const client = parId.get(c.anonymousClientId);
      const dernier = dernierParConversation.get(String(c._id));

      return {
        id: c._id.toString(),
        // Sans email, le visiteur reste anonyme : c'est le cas normal tant
        // qu'il n'a pas rempli le formulaire de contact (§32).
        client: {
          email: client?.email ?? null,
          nom: client?.nom ?? null,
          identifie: Boolean(client?.email),
        },
        shipmentId: c.shipmentId,
        nonLus: c.nonLusAgence ?? 0,
        dernierMessage: dernier
          ? {
              corps: dernier.corps,
              auteurType: dernier.auteurType,
              envoyeLe: dernier.createdAt,
            }
          : null,
        dernierMessageLe: c.dernierMessageLe ?? c.createdAt,
      };
    }),
  });
});

router.get("/:id/messages", async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).lean();
  if (!conversation || conversation.type !== "CLIENT") {
    return res.status(404).json({ erreur: "Conversation introuvable" });
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  // Ouvrir le fil vaut lecture : le compteur de non-lus retombe a zero.
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { nonLusAgence: 0 } },
  );

  const client = await AnonymousClient.findById(conversation.anonymousClientId)
    .select("email nom createdAt vuLe")
    .lean();

  res.json({
    conversation: {
      id: conversation._id.toString(),
      client: {
        email: client?.email ?? null,
        nom: client?.nom ?? null,
        identifie: Boolean(client?.email),
        premiereVisite: client?.createdAt ?? null,
        derniereVisite: client?.vuLe ?? null,
      },
    },
    messages: messages.map((m) => ({
      id: m._id.toString(),
      auteurType: m.auteurType,
      corps: m.corps,
      envoyeLe: m.createdAt,
    })),
  });
});

export default router;
