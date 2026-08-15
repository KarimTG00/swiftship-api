import { Router } from "express";
import { Shipment } from "../models/Shipment.js";
import { TYPES_LIVRAISON } from "../models/Shipment.js";
import { creerExpeditionAvecTracking } from "../services/tracking.js";
import { exigerAuth, exigerRole } from "../middlewares/auth.js";
import { env } from "../config/env.js";
import { LIBELLES, STATUT_INITIAL } from "../domaine/statuts.js";
import { patchPause, patchReprise } from "../domaine/progression.js";

const router = Router();

// Tout l'espace agence est protege : aucune de ces routes n'est publique.
router.use(exigerAuth, exigerRole("ADMIN", "VENDEUR"));

function texte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function nombreOuNull(valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function valider(corps) {
  const erreurs = {};

  const nom = texte(corps?.destinataire?.nom);
  if (!nom) erreurs["destinataire.nom"] = "Le nom du destinataire est requis.";

  const destination = texte(corps?.destination);
  if (!destination) erreurs.destination = "La destination est requise.";

  // Obligatoire : c'est cette date qui pilote la barre de progression cote
  // client. Sans elle, la barre resterait figee a zero.
  const arrivee = corps?.arriveePrevueLe ? new Date(corps.arriveePrevueLe) : null;
  if (!arrivee || Number.isNaN(arrivee.getTime())) {
    erreurs.arriveePrevueLe = "La date d'arrivee prevue est requise.";
  } else if (arrivee.getTime() <= Date.now()) {
    erreurs.arriveePrevueLe = "La date d'arrivee doit etre dans le futur.";
  }

  const type = texte(corps?.typeLivraison);
  if (type && !TYPES_LIVRAISON.includes(type)) {
    erreurs.typeLivraison = "Type de livraison inconnu.";
  }

  return { erreurs, nom, destination, arrivee, type };
}

router.post("/", async (req, res) => {
  const { erreurs, nom, destination, arrivee, type } = valider(req.body);

  if (Object.keys(erreurs).length > 0) {
    return res.status(400).json({ erreur: "Formulaire invalide", champs: erreurs });
  }

  const maintenant = new Date();

  const expedition = await creerExpeditionAvecTracking({
    destinataire: {
      nom,
      telephone: texte(req.body?.destinataire?.telephone),
      email: texte(req.body?.destinataire?.email),
      adresse: texte(req.body?.destinataire?.adresse),
      ville: texte(req.body?.destinataire?.ville),
    },
    // L'adresse de l'agence est copiee sur l'expedition : un ancien colis
    // garde son point de depart meme si l'agence demenage.
    origine: texte(req.body?.origine) || env.adresseAgence,
    destination,
    distanceKm: nombreOuNull(req.body?.distanceKm) ?? undefined,
    colis: {
      description: texte(req.body?.colis?.description),
      taille: texte(req.body?.colis?.taille),
      poids: nombreOuNull(req.body?.colis?.poids) ?? undefined,
      valeur: nombreOuNull(req.body?.colis?.valeur) ?? undefined,
    },
    typeLivraison: type || undefined,
    statut: STATUT_INITIAL,
    progression: {
      demarreLe: maintenant,
      arriveePrevueLe: arrivee,
      enPause: false,
      cumulPauseMs: 0,
    },
    creeParId: req.utilisateur._id,
    evenements: [
      {
        statut: STATUT_INITIAL,
        libelle: LIBELLES[STATUT_INITIAL],
        auteurId: req.utilisateur._id,
        survenuLe: maintenant,
      },
    ],
  });

  res.status(201).json({ expedition });
});

router.get("/", async (req, res) => {
  // Un vendeur ne voit que ses propres expeditions (§29) ; l'admin voit tout.
  const filtre =
    req.utilisateur.role === "ADMIN" ? {} : { creeParId: req.utilisateur._id };

  const recherche = texte(req.query.q);
  if (recherche) {
    filtre.trackingNumber = recherche.toUpperCase();
  }

  const statut = texte(req.query.statut);
  if (statut) filtre.statut = statut;

  const expeditions = await Shipment.find(filtre)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json({ expeditions });
});

router.get("/:id", async (req, res) => {
  const expedition = await Shipment.findById(req.params.id).lean();
  if (!expedition) {
    return res.status(404).json({ erreur: "Expedition introuvable" });
  }

  if (
    req.utilisateur.role !== "ADMIN" &&
    String(expedition.creeParId) !== String(req.utilisateur._id)
  ) {
    return res.status(403).json({ erreur: "Acces refuse" });
  }

  res.json({ expedition });
});

// Mise en pause / relance de la progression de la livraison.
router.patch("/:id/progression", async (req, res) => {
  const action = texte(req.body?.action);
  if (!["pause", "reprise"].includes(action)) {
    return res.status(400).json({ erreur: "Action inconnue" });
  }

  const expedition = await Shipment.findById(req.params.id);
  if (!expedition) {
    return res.status(404).json({ erreur: "Expedition introuvable" });
  }

  const patch =
    action === "pause"
      ? patchPause(expedition.progression)
      : patchReprise(expedition.progression);

  // patch vaut null quand l'action n'a pas de sens : deja en pause, ou
  // relance d'une livraison qui n'est pas suspendue.
  if (!patch) {
    return res.status(409).json({
      erreur:
        action === "pause"
          ? "Cette livraison est deja en pause."
          : "Cette livraison n'est pas en pause.",
    });
  }

  await Shipment.updateOne({ _id: expedition._id }, { $set: patch });
  const misAJour = await Shipment.findById(expedition._id).lean();

  res.json({ expedition: misAJour });
});

export default router;
