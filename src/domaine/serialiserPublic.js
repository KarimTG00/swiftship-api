import { LIBELLES } from "./statuts.js";
import { arriveeAjustee, calculerProgression } from "./progression.js";

// Regle de securite centrale (§37) : la page publique de suivi ne doit
// renvoyer QUE des informations publiques.
//
// Cette fonction est volontairement une LISTE BLANCHE, et volontairement une
// fonction autonome plutot qu'une methode de schema ou un transform toJSON :
// une methode de schema est contournee des que quelqu'un ecrit .lean() pour
// optimiser une requete, et la protection disparait alors en silence.
//
// NE JAMAIS EXPOSER ICI : destinataire (nom, telephone, adresse, ville),
// valeur du colis, description du colis, distance, identifiant interne,
// createur, livreur, commentaires internes des evenements.
export function serialiserPublic(expedition, maintenant = Date.now()) {
  if (!expedition) return null;

  return {
    trackingNumber: expedition.trackingNumber,
    statut: expedition.statut,
    libelle: LIBELLES[expedition.statut] ?? null,
    origine: expedition.origine ?? null,
    destination: expedition.destination ?? null,
    typeLivraison: expedition.typeLivraison ?? null,
    creeLe: expedition.createdAt ?? null,

    colis: {
      taille: expedition.colis?.taille ?? null,
      poids: expedition.colis?.poids ?? null,
    },

    progression: {
      demarreLe: expedition.progression?.demarreLe ?? null,
      arriveePrevueLe: arriveeAjustee(expedition, maintenant),
      enPause: Boolean(expedition.progression?.enPause),
      ratio: calculerProgression(expedition, maintenant),
    },

    evenements: (expedition.evenements ?? []).map((e) => ({
      statut: e.statut,
      libelle: e.libelle ?? LIBELLES[e.statut] ?? null,
      survenuLe: e.survenuLe,
    })),
  };
}
