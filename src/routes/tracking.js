import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Shipment } from "../models/Shipment.js";
import { serialiserPublic } from "../domaine/serialiserPublic.js";
import { trackingValide } from "../domaine/tracking.js";

const router = Router();

// Route PUBLIQUE, sans authentification : le numero de tracking n'authentifie
// personne (§37). Limite plus stricte que le reste de l'API pour decourager
// le balayage de numeros.
const limiteSuivi = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erreur: "Trop de recherches. Reessaie dans un instant." },
});

router.get("/:numero", limiteSuivi, async (req, res) => {
  const numero = String(req.params.numero ?? "")
    .trim()
    .toUpperCase();

  // Meme reponse pour un format invalide et pour un colis inexistant : inutile
  // d'indiquer a un curieux qu'il a trouve le bon format.
  const introuvable = { erreur: "Aucun colis ne correspond a ce numero." };

  if (!trackingValide(numero)) return res.status(404).json(introuvable);

  // populate limite aux seuls champs de contact du vendeur : ni son role, ni
  // son etat d'activation, et surtout jamais passwordHash (deja protege par
  // select: false, mais la liste explicite evite toute surprise).
  const expedition = await Shipment.findOne({ trackingNumber: numero })
    .populate("creeParId", "nom email telephone")
    .lean();

  if (!expedition) return res.status(404).json(introuvable);

  const { destination, depart } = await Shipment.findOne(
    { trackingNumber: numero },
    { destination: 1, depart: 1 },
  );

  let itineraire;

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/directions/json",
      {
        params: {
          depart,
          destination,
          key: process.env.GOOGLE_MAPS_API_KEY,
          mode: "driving", // ou 'walking', 'bicycling', 'transit'
        },
      },
    );

    itineraire = response.json();
  } catch (error) {
    itineraire = { erreur: " Itinéraire pas disponible pour le moment" };
  }
  // serialiserPublic est une liste blanche : nom, telephone et adresse du
  // destinataire, valeur du colis et commentaires internes ne sortent jamais.
  res.json({ colis: serialiserPublic(expedition), itineraire: itineraire });
});

export default router;
