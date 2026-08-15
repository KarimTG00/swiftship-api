import test from "node:test";
import assert from "node:assert/strict";
import {
  MASQUER_COORDONNEES_DESTINATAIRE,
  serialiserPublic,
} from "../src/domaine/serialiserPublic.js";

// Ce qui reste PRIVE quelle que soit la configuration. Chaque valeur est une
// sentinelle unique : le test verifie qu'aucune n'apparait nulle part dans la
// sortie serialisee. Si quelqu'un ajoute un champ prive au modele et l'expose
// par erreur, le test le detecte sans avoir besoin d'etre mis a jour.
const TOUJOURS_PRIVE = {
  commentaireInterne: "SENTINELLE_COMMENTAIRE_INTERNE",
  identifiantInterne: "SENTINELLE_ID_INTERNE",
  identifiantCreateur: "SENTINELLE_ID_CREATEUR",
};

const VALEUR_COLIS = 150000;

function expeditionComplete() {
  return {
    _id: TOUJOURS_PRIVE.identifiantInterne,
    trackingNumber: "SHT-000000000042-CARGO",
    destinataire: {
      nom: "Yves Martin",
      telephone: "0612345689",
      email: "yves.martin@exemple.com",
      adresse: "12 rue des Lilas",
      ville: "Zone Nord",
    },
    origine: "Entrepot central",
    destination: "Zone Nord",
    distanceKm: 137,
    colis: {
      description: "Carton scelle",
      taille: "M",
      poids: 2.4,
      valeur: VALEUR_COLIS,
    },
    typeLivraison: "STANDARD",
    statut: "EN_TRANSIT",
    progression: {
      demarreLe: new Date("2026-08-14T08:00:00Z"),
      arriveePrevueLe: new Date("2026-08-14T18:00:00Z"),
      enPause: false,
      cumulPauseMs: 0,
    },
    creeParId: {
      _id: TOUJOURS_PRIVE.identifiantCreateur,
      nom: "Karim Vendeur",
      email: "vendeur@agence.local",
      telephone: "0700000000",
      role: "ADMIN",
      actif: true,
    },
    createdAt: new Date("2026-08-14T07:30:00Z"),
    evenements: [
      {
        statut: "ENREGISTREE",
        libelle: "Expedition enregistree",
        commentaire: TOUJOURS_PRIVE.commentaireInterne,
        auteurId: TOUJOURS_PRIVE.identifiantCreateur,
        survenuLe: new Date("2026-08-14T07:30:00Z"),
      },
    ],
  };
}

test("les donnees internes ne sortent jamais", () => {
  const sortie = JSON.stringify(serialiserPublic(expeditionComplete()));

  for (const [champ, sentinelle] of Object.entries(TOUJOURS_PRIVE)) {
    assert.equal(
      sortie.includes(sentinelle),
      false,
      `"${champ}" fuit dans la reponse publique`,
    );
  }
});

test("la valeur du colis n'est jamais exposee", () => {
  const sortie = JSON.stringify(serialiserPublic(expeditionComplete()));
  // L'exposer sur une page publique reviendrait a annoncer ce que contient le
  // colis a qui possede le numero.
  assert.equal(sortie.includes(String(VALEUR_COLIS)), false);
});

test("le role et l'etat du vendeur ne sortent pas", () => {
  const p = serialiserPublic(expeditionComplete());
  assert.deepEqual(Object.keys(p.agence).sort(), [
    "adresse",
    "email",
    "nom",
    "telephone",
  ]);
});

test("les evenements n'exposent que statut, libelle et date", () => {
  const p = serialiserPublic(expeditionComplete());
  assert.deepEqual(Object.keys(p.evenements[0]).sort(), [
    "libelle",
    "statut",
    "survenuLe",
  ]);
});

test("la sortie publique a exactement les cles attendues", () => {
  const p = serialiserPublic(expeditionComplete());
  assert.deepEqual(Object.keys(p).sort(), [
    "agence",
    "colis",
    "creeLe",
    "destinataire",
    "destination",
    "distanceKm",
    "evenements",
    "libelle",
    "origine",
    "progression",
    "statut",
    "trackingNumber",
    "typeLivraison",
  ]);
  assert.deepEqual(Object.keys(p.colis).sort(), [
    "description",
    "poids",
    "taille",
  ]);
});

test("les informations demandees sont bien presentes", () => {
  const p = serialiserPublic(expeditionComplete());

  assert.equal(p.trackingNumber, "SHT-000000000042-CARGO");
  assert.equal(p.statut, "EN_TRANSIT");
  assert.equal(p.libelle, "En transit");
  assert.equal(p.destination, "Zone Nord");
  assert.equal(p.distanceKm, 137);
  assert.equal(p.colis.description, "Carton scelle");
  assert.ok(p.destinataire);
  assert.ok(p.agence);
  assert.equal(p.agence.nom, "Karim Vendeur");
  assert.equal(typeof p.progression.ratio, "number");
});

test("l'agence vaut null si le vendeur n'a pas ete charge", () => {
  const sansPopulate = expeditionComplete();
  sansPopulate.creeParId = "identifiant-brut-non-peuple";

  const p = serialiserPublic(sansPopulate);
  assert.equal(p.agence, null, "un identifiant brut ne doit pas etre expose");
});

test("les coordonnees du destinataire suivent le drapeau de masquage", () => {
  const p = serialiserPublic(expeditionComplete());

  if (MASQUER_COORDONNEES_DESTINATAIRE) {
    assert.equal(p.destinataire.nom, "Y*** M*****");
    assert.equal(p.destinataire.telephone, "********89");
    assert.equal(p.destinataire.email, "y***********@exemple.com");
    assert.equal(p.destinataire.adresse, "Adresse communiquée à l'agence");
  } else {
    // Choix assume : la page de suivi est publique, ces informations sont
    // visibles de quiconque possede le numero.
    assert.equal(p.destinataire.nom, "Yves Martin");
    assert.equal(p.destinataire.telephone, "0612345689");
    assert.equal(p.destinataire.email, "yves.martin@exemple.com");
    assert.equal(p.destinataire.adresse, "12 rue des Lilas");
  }
});

test("une expedition absente donne null plutot qu'une erreur", () => {
  assert.equal(serialiserPublic(null), null);
  assert.equal(serialiserPublic(undefined), null);
});
