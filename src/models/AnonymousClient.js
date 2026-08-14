import mongoose from "mongoose";
import crypto from "node:crypto";

// L'identifiant doit etre impossible a deviner (§37).
// On remplace donc l'ObjectId par un UUID v4 : un ObjectId Mongo encode un
// horodatage et un compteur, il est partiellement previsible.
const anonymousClientSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },

    // Informations techniques uniquement (§7) : securite, anti-spam, analyse.
    // L'IP ne sert JAMAIS d'identite : elle change, elle est partagee (NAT,
    // reseau mobile, VPN).
    derniereIp: String,
    dernierUserAgent: String,
    vuLe: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const AnonymousClient = mongoose.model(
  "AnonymousClient",
  anonymousClientSchema,
);
