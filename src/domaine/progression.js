// Progression de la livraison, calculee a partir d'horodatages uniquement.
//
// Aucune tache de fond n'est necessaire : le serveur ne stocke que des dates,
// et le navigateur du client anime la barre entre elles. La mise en pause est
// donc exacte meme si personne ne regarde la page.

// Tant que le colis n'est pas reellement livre, la barre est plafonnee :
// afficher 100 % sur un colis non livre est trompeur et genere exactement les
// appels que le suivi est cense eviter.
export const PLAFOND_AVANT_LIVRAISON = 0.9;

function ms(date) {
  return date instanceof Date ? date.getTime() : new Date(date).getTime();
}

export function calculerProgression(expedition, maintenant = Date.now()) {
  if (expedition?.statut === "LIVREE") return 1;

  const p = expedition?.progression;
  if (!p?.demarreLe || !p?.arriveePrevueLe) return 0;

  const debut = ms(p.demarreLe);
  const duree = ms(p.arriveePrevueLe) - debut;
  if (duree <= 0) return PLAFOND_AVANT_LIVRAISON;

  // En pause, le temps se fige a l'instant de la mise en pause.
  const fin = p.enPause && p.pauseeLe ? ms(p.pauseeLe) : maintenant;
  const ecoule = fin - debut - (p.cumulPauseMs ?? 0);

  return Math.min(PLAFOND_AVANT_LIVRAISON, Math.max(0, ecoule / duree));
}

// L'arrivee prevue glisse de la duree totale des pauses : suspendre deux jours
// repousse l'arrivee annoncee de deux jours.
export function arriveeAjustee(expedition, maintenant = Date.now()) {
  const p = expedition?.progression;
  if (!p?.arriveePrevueLe) return null;

  let decalage = p.cumulPauseMs ?? 0;
  if (p.enPause && p.pauseeLe) decalage += maintenant - ms(p.pauseeLe);

  return new Date(ms(p.arriveePrevueLe) + decalage);
}

// Les deux fonctions ci-dessous renvoient le patch a appliquer, sans effet de
// bord : elles se testent seules et s'utilisent dans un $set Mongo.
export function patchPause(progression, maintenant = Date.now()) {
  if (progression?.enPause) return null; // deja en pause
  return {
    "progression.enPause": true,
    "progression.pauseeLe": new Date(maintenant),
  };
}

export function patchReprise(progression, maintenant = Date.now()) {
  if (!progression?.enPause) return null; // pas en pause
  const cumul =
    (progression.cumulPauseMs ?? 0) +
    (progression.pauseeLe ? maintenant - ms(progression.pauseeLe) : 0);

  return {
    "progression.enPause": false,
    "progression.pauseeLe": null,
    "progression.cumulPauseMs": cumul,
  };
}
