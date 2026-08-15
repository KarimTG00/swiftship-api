import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { creerApp } from "../src/app.js";
import { Shipment } from "../src/models/Shipment.js";
import { User } from "../src/models/User.js";
import { creerExpeditionAvecTracking } from "../src/services/tracking.js";

const BASE_TEST = "swiftshipe_test_suivi";
const actif = Boolean(env.mongodbUri);
const options = { skip: actif ? false : "MONGODB_URI absent" };

// Valeurs sentinelles : le test verifie qu'aucune n'apparait dans la reponse
// publique, quel que soit le champ ou elle se trouve.
const PRIVE = {
  nom: "SENTINELLE_NOM",
  telephone: "SENTINELLE_TELEPHONE",
  adresse: "SENTINELLE_ADRESSE",
  ville: "SENTINELLE_VILLE",
  description: "SENTINELLE_DESCRIPTION",
  commentaire: "SENTINELLE_COMMENTAIRE_INTERNE",
};

let serveur;
let base;
let tracking;
let idInterne;

async function suivre(numero) {
  const reponse = await fetch(`${base}/api/tracking/${numero}`);
  const texte = await reponse.text();
  return { statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
}

before(async () => {
  if (!actif) return;

  await mongoose.connect(env.mongodbUri, {
    dbName: BASE_TEST,
    serverSelectionTimeoutMS: 15000,
  });
  assert.equal(mongoose.connection.name, BASE_TEST);
  await mongoose.connection.dropDatabase();
  await Shipment.syncIndexes();

  const auteur = await User.create({
    email: "auteur@test.local",
    nom: "Auteur",
    role: "ADMIN",
    passwordHash: "peu-importe",
  });

  const expedition = await creerExpeditionAvecTracking({
    destinataire: {
      nom: PRIVE.nom,
      telephone: PRIVE.telephone,
      adresse: PRIVE.adresse,
      ville: PRIVE.ville,
    },
    origine: "Entrepot central",
    destination: "Zone Nord",
    distanceKm: 137,
    colis: {
      description: PRIVE.description,
      taille: "M",
      poids: 2.4,
      valeur: 150000,
    },
    typeLivraison: "STANDARD",
    statut: "EN_TRANSIT",
    progression: {
      demarreLe: new Date(Date.now() - 3600_000),
      arriveePrevueLe: new Date(Date.now() + 3600_000),
      enPause: false,
      cumulPauseMs: 0,
    },
    creeParId: auteur._id,
    evenements: [
      {
        statut: "ENREGISTREE",
        libelle: "Expedition enregistree",
        commentaire: PRIVE.commentaire,
        auteurId: auteur._id,
        survenuLe: new Date(),
      },
    ],
  });

  tracking = expedition.trackingNumber;
  idInterne = expedition._id.toString();

  serveur = http.createServer(creerApp());
  await new Promise((resolve) => serveur.listen(0, resolve));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(async () => {
  if (!actif) return;
  await new Promise((resolve) => serveur.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("le suivi est accessible sans authentification", options, async () => {
  const r = await suivre(tracking);
  assert.equal(r.statut, 200);
  assert.equal(r.corps.colis.trackingNumber, tracking);
});

test("AUCUNE donnee personnelle ne sort par le suivi public", options, async () => {
  const r = await suivre(tracking);
  const brut = JSON.stringify(r.corps);

  for (const [champ, sentinelle] of Object.entries(PRIVE)) {
    assert.equal(
      brut.includes(sentinelle),
      false,
      `le champ prive "${champ}" fuit dans la reponse publique`,
    );
  }
});

test("ni la valeur du colis, ni la distance, ni l'identifiant interne", options, async () => {
  const r = await suivre(tracking);
  const brut = JSON.stringify(r.corps);

  assert.equal(brut.includes("150000"), false, "valeur du colis exposee");
  assert.equal(brut.includes("137"), false, "distance exposee");
  assert.equal(brut.includes(idInterne), false, "identifiant interne expose");
});

test("les informations utiles au client sont bien la", options, async () => {
  const { colis } = (await suivre(tracking)).corps;

  assert.equal(colis.statut, "EN_TRANSIT");
  assert.equal(colis.libelle, "En transit");
  assert.equal(colis.origine, "Entrepot central");
  assert.equal(colis.destination, "Zone Nord");
  assert.ok(colis.evenements.length > 0);
  assert.ok(colis.progression.arriveePrevueLe);
  assert.ok(colis.progression.ratio > 0 && colis.progression.ratio < 1);
});

test("la casse du numero n'a pas d'importance", options, async () => {
  const r = await suivre(tracking.toLowerCase());
  assert.equal(r.statut, 200);
});

test("un numero inconnu renvoie 404", options, async () => {
  const r = await suivre("SHT-000000000000-CARGO");
  assert.equal(r.statut, 404);
});

test("un format invalide renvoie le meme message qu'un inconnu", options, async () => {
  const inconnu = await suivre("SHT-000000000000-CARGO");
  const invalide = await suivre("n-importe-quoi");

  // Un message different indiquerait au curieux qu'il a trouve le bon format.
  assert.equal(invalide.statut, inconnu.statut);
  assert.deepEqual(invalide.corps, inconnu.corps);
});

test("l'ancien format de numero est rejete", options, async () => {
  assert.equal((await suivre("SWS-2026-000001")).statut, 404);
});
