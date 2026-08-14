import test from "node:test";
import assert from "node:assert/strict";
import { serialiserPublic } from "../src/domaine/serialiserPublic.js";

// Chaque donnee privee recoit une valeur sentinelle unique et improbable.
// Le test verifie ensuite qu'AUCUNE de ces chaines n'apparait nulle part dans
// la sortie serialisee. C'est plus robuste que de tester champ par champ :
// si quelqu'un ajoute un champ prive au modele et l'expose par erreur, le test
// le detecte quand meme.
const SENTINELLES = {
  nom: "SENTINELLE_NOM_DESTINATAIRE",
  telephone: "SENTINELLE_TELEPHONE",
  adresse: "SENTINELLE_ADRESSE",
  ville: "SENTINELLE_VILLE",
  description: "SENTINELLE_DESCRIPTION_COLIS",
  commentaireInterne: "SENTINELLE_COMMENTAIRE_INTERNE",
  identifiantInterne: "SENTINELLE_ID_INTERNE",
  createur: "SENTINELLE_CREATEUR",
};

function expeditionComplete() {
  return {
    _id: SENTINELLES.identifiantInterne,
    trackingNumber: "SHT-000000000042-CARGO",
    destinataire: {
      nom: SENTINELLES.nom,
      telephone: SENTINELLES.telephone,
      adresse: SENTINELLES.adresse,
      ville: SENTINELLES.ville,
    },
    origine: "Entrepot central",
    destination: "Zone Nord",
    distanceKm: 137,
    colis: {
      description: SENTINELLES.description,
      taille: "M",
      poids: 2.4,
      valeur: 150000,
    },
    typeLivraison: "STANDARD",
    statut: "EN_TRANSIT",
    progression: {
      demarreLe: new Date("2026-08-14T08:00:00Z"),
      arriveePrevueLe: new Date("2026-08-14T18:00:00Z"),
      enPause: false,
      cumulPauseMs: 0,
    },
    creeParId: SENTINELLES.createur,
    createdAt: new Date("2026-08-14T07:30:00Z"),
    evenements: [
      {
        statut: "ENREGISTREE",
        libelle: "Expedition enregistree",
        commentaire: SENTINELLES.commentaireInterne,
        auteurId: SENTINELLES.createur,
        survenuLe: new Date("2026-08-14T07:30:00Z"),
      },
    ],
  };
}

test("aucune donnee personnelle ne fuit dans la sortie publique", () => {
  const sortie = JSON.stringify(serialiserPublic(expeditionComplete()));

  for (const [champ, sentinelle] of Object.entries(SENTINELLES)) {
    assert.equal(
      sortie.includes(sentinelle),
      false,
      `le champ prive "${champ}" fuit dans la reponse publique`,
    );
  }
});

test("la valeur du colis et la distance ne sont pas exposees", () => {
  const sortie = JSON.stringify(serialiserPublic(expeditionComplete()));
  assert.equal(sortie.includes("150000"), false, "valeur du colis exposee");
  assert.equal(sortie.includes("137"), false, "distance exposee");
});

test("les informations publiques attendues sont bien presentes", () => {
  const p = serialiserPublic(expeditionComplete());

  assert.equal(p.trackingNumber, "SHT-000000000042-CARGO");
  assert.equal(p.statut, "EN_TRANSIT");
  assert.equal(p.libelle, "En transit");
  assert.equal(p.origine, "Entrepot central");
  assert.equal(p.destination, "Zone Nord");
  assert.equal(p.evenements.length, 1);
  assert.ok(p.progression);
  assert.equal(typeof p.progression.ratio, "number");
});

test("les evenements publics n'exposent que statut, libelle et date", () => {
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
    "colis",
    "creeLe",
    "destination",
    "evenements",
    "libelle",
    "origine",
    "progression",
    "statut",
    "trackingNumber",
    "typeLivraison",
  ]);
  assert.deepEqual(Object.keys(p.colis).sort(), ["poids", "taille"]);
});

test("une expedition absente donne null plutot qu'une erreur", () => {
  assert.equal(serialiserPublic(null), null);
  assert.equal(serialiserPublic(undefined), null);
});
