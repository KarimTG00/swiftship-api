import { Shipment } from "../models/Shipment.js";
import { genererNumeroTracking } from "../domaine/tracking.js";

export const ESSAIS_PAR_DEFAUT = 5;

// Verifier "ce numero existe-t-il ?" puis inserer n'est PAS atomique : deux
// requetes simultanees peuvent passer la verification avec le meme numero.
// On laisse donc l'index unique trancher et on retente sur collision (E11000).
export async function creerExpeditionAvecTracking(
  donnees,
  essais = ESSAIS_PAR_DEFAUT,
) {
  for (let i = 0; i < essais; i++) {
    try {
      return await Shipment.create({
        ...donnees,
        trackingNumber: genererNumeroTracking(),
      });
    } catch (e) {
      const collisionTracking =
        e?.code === 11000 && e?.keyPattern?.trackingNumber;
      if (!collisionTracking) throw e;
    }
  }

  throw new Error(
    `Impossible de generer un numero de tracking unique apres ${essais} essais.`,
  );
}
