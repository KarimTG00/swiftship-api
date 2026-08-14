import crypto from "node:crypto";

// Format impose : SHT-XXXXXXXXXXXX-CARGO
// ou XXXXXXXXXXXX est une suite de 12 chiffres tires au hasard.
export const PREFIXE = "SHT";
export const SUFFIXE = "CARGO";
export const LONGUEUR = 12;

export const MOTIF_TRACKING = new RegExp(
  `^${PREFIXE}-\\d{${LONGUEUR}}-${SUFFIXE}$`,
);

// crypto.randomInt et non Math.random : la page de suivi est publique et
// n'est protegee par aucune authentification (§37). Un numero previsible
// permettrait d'enumerer les expeditions et de lire les donnees de tous les
// colis. Le tirage doit donc etre cryptographiquement solide.
export function segmentAleatoire() {
  const borne = 10 ** LONGUEUR; // 1 000 000 000 000 combinaisons
  return String(crypto.randomInt(0, borne)).padStart(LONGUEUR, "0");
}

export function formaterTracking(segment) {
  return `${PREFIXE}-${segment}-${SUFFIXE}`;
}

export function genererNumeroTracking() {
  return formaterTracking(segmentAleatoire());
}

export function trackingValide(valeur) {
  return typeof valeur === "string" && MOTIF_TRACKING.test(valeur.toUpperCase());
}
