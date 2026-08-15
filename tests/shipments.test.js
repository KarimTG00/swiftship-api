import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { creerApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Shipment } from "../src/models/Shipment.js";
import { hacher } from "../src/services/motDePasse.js";
import { MOTIF_TRACKING } from "../src/domaine/tracking.js";

const BASE_TEST = "swiftshipe_test_expeditions";
const actif = Boolean(env.mongodbUri);
const options = { skip: actif ? false : "MONGODB_URI absent" };

const ADMIN = { email: "admin-exp@test.local", motDePasse: "MotDePasseSolide42" };
const HEURE = 3600_000;

let serveur;
let base;

function creerClient() {
  let cookie = null;
  return {
    async appel(chemin, options = {}) {
      const entetes = { ...(options.headers ?? {}) };
      if (cookie) entetes.Cookie = cookie;
      if (options.body) entetes["Content-Type"] = "application/json";

      const reponse = await fetch(base + chemin, {
        ...options,
        headers: entetes,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const recus = reponse.headers.getSetCookie();
      if (recus.length > 0) cookie = recus.map((c) => c.split(";")[0]).join("; ");

      const texte = await reponse.text();
      return { statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
    },
  };
}

async function clientConnecte() {
  const client = creerClient();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN.email, motDePasse: ADMIN.motDePasse },
  });
  assert.equal(r.statut, 200, "la connexion de test doit reussir");
  return client;
}

function expeditionValide(extra = {}) {
  return {
    destinataire: { nom: "Destinataire de test", telephone: "0000000000" },
    destination: "Zone Nord",
    arriveePrevueLe: new Date(Date.now() + 10 * HEURE).toISOString(),
    colis: { description: "Carton", taille: "M", poids: 2.5, valeur: 15000 },
    typeLivraison: "STANDARD",
    ...extra,
  };
}

before(async () => {
  if (!actif) return;

  await mongoose.connect(env.mongodbUri, {
    dbName: BASE_TEST,
    serverSelectionTimeoutMS: 15000,
  });
  assert.equal(mongoose.connection.name, BASE_TEST);
  await mongoose.connection.dropDatabase();
  await Promise.all([Shipment.syncIndexes(), User.syncIndexes()]);

  await User.create({
    email: ADMIN.email,
    nom: "Admin expeditions",
    role: "ADMIN",
    passwordHash: await hacher(ADMIN.motDePasse),
  });

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

test("creer une expedition exige d'etre connecte", options, async () => {
  const anonyme = creerClient();
  const r = await anonyme.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });
  assert.equal(r.statut, 401);
});

test("lister les expeditions exige d'etre connecte", options, async () => {
  const anonyme = creerClient();
  assert.equal((await anonyme.appel("/api/shipments")).statut, 401);
});

test("une creation valide genere un numero de tracking", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  assert.equal(r.statut, 201);
  assert.match(r.corps.expedition.trackingNumber, MOTIF_TRACKING);
  assert.equal(r.corps.expedition.statut, "ENREGISTREE");
});

test("la creation ecrit le premier evenement d'historique", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  const evenements = r.corps.expedition.evenements;
  assert.equal(evenements.length, 1);
  assert.equal(evenements[0].statut, "ENREGISTREE");
  assert.ok(evenements[0].survenuLe);
});

test("la progression demarre a la creation", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  const p = r.corps.expedition.progression;
  assert.ok(p.demarreLe, "demarreLe doit etre renseigne");
  assert.ok(p.arriveePrevueLe, "arriveePrevueLe doit etre renseigne");
  assert.equal(p.enPause, false);
  assert.equal(p.cumulPauseMs, 0);
});

test("l'origine reprend l'adresse de l'agence par defaut", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  assert.equal(r.corps.expedition.origine, env.adresseAgence);
});

test("le kilometrage reste facultatif", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  assert.equal(r.statut, 201);
  assert.equal(r.corps.expedition.distanceKm, undefined);
});

test("un formulaire incomplet est refuse champ par champ", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", { method: "POST", body: {} });

  assert.equal(r.statut, 400);
  assert.ok(r.corps.champs["destinataire.nom"]);
  assert.ok(r.corps.champs.destination);
  assert.ok(r.corps.champs.arriveePrevueLe);
});

test("une date d'arrivee passee est refusee", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide({
      arriveePrevueLe: new Date(Date.now() - HEURE).toISOString(),
    }),
  });

  assert.equal(r.statut, 400);
  assert.ok(r.corps.champs.arriveePrevueLe);
});

test("un type de livraison inconnu est refuse", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide({ typeLivraison: "TELEPORTATION" }),
  });

  assert.equal(r.statut, 400);
});

test("la liste renvoie les expeditions, les plus recentes d'abord", options, async () => {
  const client = await clientConnecte();
  const r = await client.appel("/api/shipments");

  assert.equal(r.statut, 200);
  assert.ok(r.corps.expeditions.length > 0);

  const dates = r.corps.expeditions.map((e) => new Date(e.createdAt).getTime());
  const triees = [...dates].sort((a, b) => b - a);
  assert.deepEqual(dates, triees);
});

test("la recherche par tracking retrouve l'expedition", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide({ destination: "Zone recherchee" }),
  });
  const tracking = creee.corps.expedition.trackingNumber;

  const r = await client.appel(`/api/shipments?q=${tracking}`);
  assert.equal(r.corps.expeditions.length, 1);
  assert.equal(r.corps.expeditions[0].destination, "Zone recherchee");
});

test("le detail d'une expedition est accessible", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  const r = await client.appel(`/api/shipments/${creee.corps.expedition._id}`);
  assert.equal(r.statut, 200);
  assert.equal(
    r.corps.expedition.trackingNumber,
    creee.corps.expedition.trackingNumber,
  );
});

test("mettre en pause fige la progression", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });
  const id = creee.corps.expedition._id;

  const r = await client.appel(`/api/shipments/${id}/progression`, {
    method: "PATCH",
    body: { action: "pause" },
  });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.expedition.progression.enPause, true);
  assert.ok(r.corps.expedition.progression.pauseeLe);
});

test("relancer cumule le temps de pause", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });
  const id = creee.corps.expedition._id;

  await client.appel(`/api/shipments/${id}/progression`, {
    method: "PATCH",
    body: { action: "pause" },
  });

  const r = await client.appel(`/api/shipments/${id}/progression`, {
    method: "PATCH",
    body: { action: "reprise" },
  });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.expedition.progression.enPause, false);
  assert.equal(r.corps.expedition.progression.pauseeLe, null);
  assert.ok(
    r.corps.expedition.progression.cumulPauseMs >= 0,
    "le temps de pause doit etre cumule",
  );
});

test("mettre en pause deux fois est refuse", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });
  const id = creee.corps.expedition._id;

  await client.appel(`/api/shipments/${id}/progression`, {
    method: "PATCH",
    body: { action: "pause" },
  });
  const r = await client.appel(`/api/shipments/${id}/progression`, {
    method: "PATCH",
    body: { action: "pause" },
  });

  assert.equal(r.statut, 409);
});

test("relancer une livraison non suspendue est refuse", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  const r = await client.appel(
    `/api/shipments/${creee.corps.expedition._id}/progression`,
    { method: "PATCH", body: { action: "reprise" } },
  );

  assert.equal(r.statut, 409);
});

test("une action de progression inconnue est refusee", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  const r = await client.appel(
    `/api/shipments/${creee.corps.expedition._id}/progression`,
    { method: "PATCH", body: { action: "supprimer" } },
  );

  assert.equal(r.statut, 400);
});

test("la pause exige d'etre connecte", options, async () => {
  const client = await clientConnecte();
  const creee = await client.appel("/api/shipments", {
    method: "POST",
    body: expeditionValide(),
  });

  const anonyme = creerClient();
  const r = await anonyme.appel(
    `/api/shipments/${creee.corps.expedition._id}/progression`,
    { method: "PATCH", body: { action: "pause" } },
  );

  assert.equal(r.statut, 401);
});
