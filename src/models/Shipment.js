import mongoose from "mongoose";
import { STATUTS, STATUT_INITIAL } from "../domaine/statuts.js";
import { MOTIF_TRACKING } from "../domaine/tracking.js";

export const TYPES_LIVRAISON = [
  "STANDARD",
  "EXPRESS",
  "INTER_VILLE",
  "DOMICILE",
];

// Evenement de la timeline (§12). Embarque dans l'expedition : une ecriture
// sur un seul document est atomique sans transaction, donc il est impossible
// d'avoir un changement de statut sans son evenement d'historique.
const evenementSchema = new mongoose.Schema({
  statut: { type: String, enum: STATUTS, required: true },
  libelle: String,
  commentaire: String, // interne : jamais expose publiquement
  auteurId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // interne
  survenuLe: { type: Date, default: Date.now },
});

const shipmentSchema = new mongoose.Schema(
  {
    // Format SHT-XXXXXXXXXXXX-CARGO, verifie au niveau du schema : un numero
    // malforme ne peut pas etre enregistre, meme par un appel direct au modele.
    trackingNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [MOTIF_TRACKING, "Format de numero de tracking invalide"],
    },

    destinataire: {
      nom: { type: String, required: true, trim: true },
      telephone: { type: String, trim: true },
      adresse: { type: String, trim: true },
      ville: { type: String, trim: true },
    },

    // Point de depart de l'itineraire affiche au client (§11). Rempli par
    // defaut avec ADRESSE_AGENCE a la creation, mais stocke ici pour qu'une
    // ancienne expedition garde son origine si l'agence demenage.
    origine: { type: String, trim: true },

    // Ville ou zone d'arrivee. PUBLIC : alimente la carte du suivi.
    // L'adresse precise du destinataire reste dans destinataire.adresse et
    // ne doit jamais etre exposee : le tracking n'est pas une authentification
    // (§37), n'importe qui possedant un numero verrait le domicile du client.
    destination: { type: String, required: true, trim: true },

    distanceKm: { type: Number, min: 0 }, // facultatif

    colis: {
      description: String,
      taille: String,
      poids: { type: Number, min: 0 },
      valeur: { type: Number, min: 0 },
    },

    typeLivraison: { type: String, enum: TYPES_LIVRAISON },

    statut: {
      type: String,
      enum: STATUTS,
      default: STATUT_INITIAL,
      index: true,
    },

    // Voir src/domaine/progression.js : la barre est calculee a partir de ces
    // seuls horodatages, sans tache de fond.
    progression: {
      demarreLe: Date,
      arriveePrevueLe: Date,
      enPause: { type: Boolean, default: false },
      pauseeLe: Date,
      cumulPauseMs: { type: Number, default: 0, min: 0 },
    },

    creeParId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    evenements: [evenementSchema],
  },
  { timestamps: true },
);

// L'index unique sur trackingNumber est deja declare par "unique: true" sur le
// champ : le redeclarer ici creerait un index en double.
// Liste du dashboard : les plus recentes d'abord.
shipmentSchema.index({ createdAt: -1 });

export const Shipment = mongoose.model("Shipment", shipmentSchema);
