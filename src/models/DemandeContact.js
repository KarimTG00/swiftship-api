import mongoose from "mongoose";

// Modale de contact du site public : une personne qui souhaite ENVOYER un
// colis contacte directement l'agence (§3.1).
//
// A ne pas confondre avec le chat client : ce n'est pas une conversation, il
// n'y a pas d'identite anonyme derriere, et il n'y a pas de reponse en ligne.
const demandeContactSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    traiteeLe: Date,

    // Informations techniques (anti-spam), jamais une identite.
    ip: String,
    userAgent: String,
  },
  { timestamps: true },
);

demandeContactSchema.index({ createdAt: -1 });

export const DemandeContact = mongoose.model(
  "DemandeContact",
  demandeContactSchema,
);
