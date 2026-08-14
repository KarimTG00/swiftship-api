import mongoose from "mongoose";

export const TYPES_CONVERSATION = ["CLIENT", "INTERNE"];

const conversationSchema = new mongoose.Schema(
  {
    // CLIENT  : client anonyme <-> agence
    // INTERNE : agence <-> livreur. Un client ne doit JAMAIS y acceder (§10).
    type: {
      type: String,
      enum: TYPES_CONVERSATION,
      required: true,
      index: true,
    },

    anonymousClientId: {
      type: String,
      ref: "AnonymousClient",
      index: true,
    },

    // Nullable, et c'est essentiel : le client peut ecrire AVANT d'avoir
    // communique son numero de tracking (§9). Le vendeur rattache ensuite la
    // conversation a l'expedition.
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipment",
      default: null,
      index: true,
    },

    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    dernierMessageLe: Date,
    nonLusAgence: { type: Number, default: 0, min: 0 },
    nonLusClient: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Liste des conversations du dashboard : les plus actives d'abord.
conversationSchema.index({ dernierMessageLe: -1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
