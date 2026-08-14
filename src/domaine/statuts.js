// Version simplifiee retenue pour l'agence.
// La specification (§12) donnait une liste d'exemple : c'est celle-ci qui fait foi.
export const STATUTS = [
  "ENREGISTREE",
  "EN_TRANSIT",
  "EN_LIVRAISON",
  "LIVREE",
  "ECHEC_LIVRAISON",
  "ANNULEE",
];

export const STATUT_INITIAL = "ENREGISTREE";

export const LIBELLES = {
  ENREGISTREE: "Expedition enregistree",
  EN_TRANSIT: "En transit",
  EN_LIVRAISON: "En cours de livraison",
  LIVREE: "Livree",
  ECHEC_LIVRAISON: "Echec de livraison",
  ANNULEE: "Annulee",
};

// Statuts terminaux : plus aucune transition possible.
export const STATUTS_TERMINAUX = ["LIVREE", "ANNULEE"];

export const TRANSITIONS = {
  ENREGISTREE: ["EN_TRANSIT", "ANNULEE"],
  EN_TRANSIT: ["EN_LIVRAISON", "ECHEC_LIVRAISON", "ANNULEE"],
  EN_LIVRAISON: ["LIVREE", "ECHEC_LIVRAISON"],
  ECHEC_LIVRAISON: ["EN_LIVRAISON", "ANNULEE"],
  LIVREE: [],
  ANNULEE: [],
};

// Le livreur ne peut ni annuler ni revenir en arriere (§2.3).
export const STATUTS_AUTORISES_LIVREUR = [
  "EN_LIVRAISON",
  "LIVREE",
  "ECHEC_LIVRAISON",
];

export function transitionAutorisee(depuis, vers, role = "VENDEUR") {
  if (!STATUTS.includes(depuis) || !STATUTS.includes(vers)) return false;
  if (!(TRANSITIONS[depuis] ?? []).includes(vers)) return false;
  if (role === "LIVREUR" && !STATUTS_AUTORISES_LIVREUR.includes(vers)) {
    return false;
  }
  return true;
}
