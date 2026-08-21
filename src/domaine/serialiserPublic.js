import { LIBELLES } from "./statuts.js";
import { arriveeAjustee, calculerProgression } from "./progression.js";

// ---------------------------------------------------------------------------
// Ce que voit un visiteur muni d'un numero de suivi.
//
// Cette page est PUBLIQUE : le numero de tracking n'authentifie personne (§37).
// Quiconque possede, intercepte ou photographie un numero voit ce qui suit.
//
// Passer ce drapeau a true masque partiellement les coordonnees du
// destinataire (Y*** M***, 06 ** ** ** 89, y***@exemple.com) : le client
// reconnait ses propres informations, un tiers n'en tire rien d'exploitable.
export const MASQUER_COORDONNEES_DESTINATAIRE = false;

// Restent privees en toutes circonstances : la valeur du colis (l'exposer
// invite au vol), les commentaires internes des evenements, l'identifiant
// interne de l'expedition et celui de son createur.
// ---------------------------------------------------------------------------

function masquerNom(valeur) {
  if (!valeur) return null;
  return valeur
    .split(/\s+/)
    .map((mot) =>
      mot.length <= 1 ? mot : `${mot[0]}${"*".repeat(mot.length - 1)}`,
    )
    .join(" ");
}

function masquerTelephone(valeur) {
  if (!valeur) return null;
  const chiffres = String(valeur).replace(/\D/g, "");
  if (chiffres.length <= 2) return "*".repeat(chiffres.length);
  return `${"*".repeat(chiffres.length - 2)}${chiffres.slice(-2)}`;
}

function masquerEmail(valeur) {
  if (!valeur) return null;
  const [avant, apres] = String(valeur).split("@");
  if (!apres) return "***";
  const debut = avant.slice(0, 1);
  return `${debut}${"*".repeat(Math.max(avant.length - 1, 1))}@${apres}`;
}

function masquerAdresse(valeur) {
  if (!valeur) return null;
  return "Adresse communiquée à l'agence";
}

function destinatairePublic(destinataire) {
  if (!destinataire) return null;

  if (MASQUER_COORDONNEES_DESTINATAIRE) {
    return {
      nom: masquerNom(destinataire.nom),
      telephone: masquerTelephone(destinataire.telephone),
      email: masquerEmail(destinataire.email),
      adresse: masquerAdresse(destinataire.adresse),
      ville: destinataire.ville ?? null,
    };
  }

  return {
    nom: destinataire.nom ?? null,
    telephone: destinataire.telephone ?? null,
    email: destinataire.email ?? null,
    adresse: destinataire.adresse ?? null,
    ville: destinataire.ville ?? null,
  };
}

// Coordonnees du vendeur qui a enregistre le colis, pour que le client sache
// qui contacter. Ce sont des informations professionnelles, pas personnelles.
function agencePublique(expedition) {
  const vendeur = expedition.creeParId;
  // creeParId n'est un objet que si la requete a fait un .populate().
  if (!vendeur || typeof vendeur !== "object" || !vendeur.nom) return null;

  return {
    nom: vendeur.nom,
    email: vendeur.email ?? null,
    telephone: vendeur.telephone ?? null,
    adresse: expedition.depart ?? null,
  };
}

// Liste blanche, et fonction autonome plutot que methode de schema : une
// methode serait contournee des que quelqu'un ecrit .lean() pour optimiser une
// requete, et la protection disparaitrait en silence.
export function serialiserPublic(expedition, maintenant = Date.now()) {
  if (!expedition) return null;

  return {
    trackingNumber: expedition.trackingNumber,
    statut: expedition.statut,
    libelle: LIBELLES[expedition.statut] ?? null,
    destination: expedition.destination ?? null,
    typeLivraison: expedition.typeLivraison ?? null,
    depart: expedition.depart ?? null,
    creeLe: expedition.createdAt ?? null,

    destinataire: destinatairePublic(expedition.destinataire),

    expediteur: {
      nom: expedition.expediteur?.nomExpediteur ?? null,
      email: expedition.expediteur?.emailExpediteur ?? null,
      numero: expedition.expediteur?.numeroExpediteur ?? null,
      adresse: expedition.expediteur?.adresseExpediteur ?? null,
    },

    colis: {
      description: expedition.colis?.description ?? null,
      taille: expedition.colis?.taille ?? null,
      poids: expedition.colis?.poids ?? null,
      // valeur volontairement absente
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
      // commentaire et auteurId volontairement absents
    })),
  };
}
