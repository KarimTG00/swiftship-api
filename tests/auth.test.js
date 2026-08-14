import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { creerApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { hacher } from "../src/services/motDePasse.js";

// Tests de bout en bout sur de vraies requetes HTTP, sans supertest :
// Node fournit fetch et getSetCookie(), c'est suffisant.
const BASE_TEST = "swiftshipe_test_auth";
const actif = Boolean(env.mongodbUri);
const options = { skip: actif ? false : "MONGODB_URI absent" };

const EMAIL = "admin@test.local";
const MOT_DE_PASSE = "MotDePasseSolide42";

let serveur;
let base;

// Petit client HTTP qui conserve le cookie de session entre les appels,
// exactement comme le ferait un navigateur.
function creerClient() {
  let cookie = null;

  return {
    get cookie() {
      return cookie;
    },
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
      return {
        statut: reponse.status,
        entetes: reponse.headers,
        cookiesRecus: recus,
        corps: texte ? JSON.parse(texte) : null,
      };
    },
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

  await User.create({
    email: EMAIL,
    nom: "Admin de test",
    role: "ADMIN",
    passwordHash: await hacher(MOT_DE_PASSE),
  });

  await User.create({
    email: "desactive@test.local",
    nom: "Compte desactive",
    role: "ADMIN",
    actif: false,
    passwordHash: await hacher(MOT_DE_PASSE),
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

test("une connexion valide ouvre une session", options, async () => {
  const client = creerClient();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.utilisateur.email, EMAIL);
  assert.equal(r.corps.utilisateur.role, "ADMIN");
  assert.ok(r.cookiesRecus.length > 0, "aucun cookie de session emis");
});

test("le cookie de session est httpOnly et SameSite", options, async () => {
  const client = creerClient();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });

  const cookie = r.cookiesRecus.join(";");
  assert.match(cookie, /HttpOnly/i, "le cookie doit etre inaccessible au JS");
  assert.match(cookie, /SameSite=Lax/i);
});

test("la reponse de connexion ne contient jamais le hash", options, async () => {
  const client = creerClient();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });

  const brut = JSON.stringify(r.corps);
  assert.equal(brut.includes("passwordHash"), false);
  assert.equal(brut.includes("scrypt"), false);
});

test("un mot de passe faux est refuse", options, async () => {
  const client = creerClient();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: "mauvais" },
  });

  assert.equal(r.statut, 401);
});

test("un email inconnu donne le meme message qu'un mot de passe faux", options, async () => {
  const client = creerClient();

  const inconnu = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: "personne@test.local", motDePasse: MOT_DE_PASSE },
  });
  const mauvais = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: "mauvais" },
  });

  // Un message different permettrait de savoir quels emails sont enregistres.
  assert.equal(inconnu.statut, mauvais.statut);
  assert.deepEqual(inconnu.corps, mauvais.corps);
});

test("un compte desactive ne peut pas se connecter", options, async () => {
  const client = creerClient();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: "desactive@test.local", motDePasse: MOT_DE_PASSE },
  });

  assert.equal(r.statut, 401);
});

test("une requete sans corps valide est refusee proprement", options, async () => {
  const client = creerClient();

  for (const corps of [{}, { email: EMAIL }, { motDePasse: MOT_DE_PASSE }]) {
    const r = await client.appel("/api/auth/login", { method: "POST", body: corps });
    assert.equal(r.statut, 400);
  }
});

test("/me exige une session", options, async () => {
  const client = creerClient();
  const r = await client.appel("/api/auth/me");
  assert.equal(r.statut, 401);
});

test("/me renvoie l'utilisateur connecte", options, async () => {
  const client = creerClient();
  await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });

  const r = await client.appel("/api/auth/me");
  assert.equal(r.statut, 200);
  assert.equal(r.corps.utilisateur.email, EMAIL);
  assert.deepEqual(Object.keys(r.corps.utilisateur).sort(), [
    "email",
    "id",
    "nom",
    "role",
  ]);
});

test("la deconnexion ferme reellement la session", options, async () => {
  const client = creerClient();
  await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });
  assert.equal((await client.appel("/api/auth/me")).statut, 200);

  const sortie = await client.appel("/api/auth/logout", { method: "POST" });
  assert.equal(sortie.statut, 204);

  assert.equal((await client.appel("/api/auth/me")).statut, 401);
});

test("l'identifiant de session change a la connexion", options, async () => {
  const client = creerClient();

  // Une premiere requete pour obtenir un cookie avant authentification.
  await client.appel("/api/auth/me");
  const avant = client.cookie;

  await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });
  const apres = client.cookie;

  // Sans regeneration, un identifiant connu avant la connexion resterait
  // valable apres : c'est la fixation de session.
  assert.notEqual(avant, apres);
});

test("desactiver un compte coupe l'acces immediatement", options, async () => {
  const client = creerClient();
  await client.appel("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, motDePasse: MOT_DE_PASSE },
  });
  assert.equal((await client.appel("/api/auth/me")).statut, 200);

  await User.updateOne({ email: EMAIL }, { $set: { actif: false } });
  try {
    // Les droits sont relus en base a chaque requete : le cookie ne suffit pas.
    assert.equal((await client.appel("/api/auth/me")).statut, 401);
  } finally {
    await User.updateOne({ email: EMAIL }, { $set: { actif: true } });
  }
});

test("les tentatives repetees finissent par etre bloquees", options, async () => {
  const client = creerClient();
  let bloque = false;

  for (let i = 0; i < 15; i++) {
    const r = await client.appel("/api/auth/login", {
      method: "POST",
      body: { email: EMAIL, motDePasse: "mauvais" },
    });
    if (r.statut === 429) {
      bloque = true;
      break;
    }
  }

  assert.ok(bloque, "la force brute doit finir par etre limitee");
});
