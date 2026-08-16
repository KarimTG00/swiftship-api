import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { creerApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { AnonymousClient } from "../src/models/AnonymousClient.js";
import { hacher } from "../src/services/motDePasse.js";
import { NOM_COOKIE } from "../src/middlewares/identiteAnonyme.js";

const BASE_TEST = "swiftshipe_test_chat";
const actif = Boolean(env.mongodbUri);
const options = { skip: actif ? false : "MONGODB_URI absent" };

const ADMIN = { email: "admin-chat@test.local", motDePasse: "MotDePasseSolide42" };

let serveur;
let base;

// Chaque visiteur de test recoit sa propre adresse IP, transmise via
// X-Forwarded-For (l'application a trust proxy). Sans cela, tous les tests
// partageraient le meme compteur de limitation de debit et les derniers
// recevraient des 429 sans rapport avec ce qu'ils verifient.
let compteurIp = 0;
function ipDeTest() {
  compteurIp += 1;
  return `10.0.${Math.floor(compteurIp / 250)}.${compteurIp % 250}`;
}

// Client HTTP qui conserve les cookies, comme le ferait un navigateur.
function creerVisiteur(ip = ipDeTest()) {
  let cookie = null;
  return {
    ip,
    get cookie() {
      return cookie;
    },
    set cookie(valeur) {
      cookie = valeur;
    },
    async appel(chemin, options = {}) {
      const entetes = { "X-Forwarded-For": ip, ...(options.headers ?? {}) };
      if (cookie) entetes.Cookie = cookie;
      if (options.body) entetes["Content-Type"] = "application/json";

      const reponse = await fetch(base + chemin, {
        ...options,
        headers: entetes,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const recus = reponse.headers.getSetCookie();
      if (recus.length > 0) {
        cookie = recus.map((c) => c.split(";")[0]).join("; ");
      }

      const texte = await reponse.text();
      return {
        statut: reponse.status,
        cookiesRecus: recus,
        corps: texte ? JSON.parse(texte) : null,
      };
    },
  };
}

async function adminConnecte() {
  const client = creerVisiteur();
  const r = await client.appel("/api/auth/login", {
    method: "POST",
    body: ADMIN,
  });
  assert.equal(r.statut, 200);
  return client;
}

before(async () => {
  if (!actif) return;

  await mongoose.connect(env.mongodbUri, {
    dbName: BASE_TEST,
    serverSelectionTimeoutMS: 15000,
  });
  assert.equal(mongoose.connection.name, BASE_TEST);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();

  await User.create({
    email: ADMIN.email,
    nom: "Admin chat",
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

test("un visiteur inconnu recoit un cookie d'identite", options, async () => {
  const visiteur = creerVisiteur();
  const r = await visiteur.appel("/api/chat/conversation");

  assert.equal(r.statut, 200);
  const cookie = r.cookiesRecus.join(";");
  assert.match(cookie, new RegExp(NOM_COOKIE));
  assert.match(cookie, /HttpOnly/i, "le JS de la page ne doit pas pouvoir le lire");
  assert.match(cookie, /Max-Age=31536000/i, "le cookie doit durer un an");
});

test("la conversation demarre vide et sans email", options, async () => {
  const visiteur = creerVisiteur();
  const r = await visiteur.appel("/api/chat/conversation");

  assert.deepEqual(r.corps.messages, []);
  assert.equal(r.corps.emailRenseigne, false);
});

test("l'identifiant anonyme n'est jamais renvoye au client", options, async () => {
  const visiteur = creerVisiteur();
  const r = await visiteur.appel("/api/chat/conversation");

  const brut = JSON.stringify(r.corps);
  assert.equal(brut.includes("anonymousClientId"), false);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/.test(brut), false);
});

test("un message part sans qu'on ait demande l'email", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");

  const r = await visiteur.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Bonjour, ou est mon colis ?" },
  });

  assert.equal(r.statut, 201);
  assert.equal(r.corps.message.corps, "Bonjour, ou est mon colis ?");
  assert.equal(r.corps.message.auteurType, "CLIENT");
  // C'est ce drapeau qui declenche l'affichage du formulaire de contact.
  assert.equal(r.corps.emailRenseigne, false);
});

test("un message vide ou trop long est refuse", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");

  for (const corps of ["", "   ", "a".repeat(5001)]) {
    const r = await visiteur.appel("/api/chat/messages", {
      method: "POST",
      body: { corps },
    });
    assert.equal(r.statut, 400);
  }
});

test("l'email est enregistre apres le premier message", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");
  await visiteur.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Premier message" },
  });

  const r = await visiteur.appel("/api/chat/contact", {
    method: "POST",
    body: { email: "  Client@Exemple.COM ", nom: "Client test" },
  });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.emailRenseigne, true);

  const suite = await visiteur.appel("/api/chat/conversation");
  assert.equal(suite.corps.emailRenseigne, true);

  const enBase = await AnonymousClient.findOne({ email: "client@exemple.com" });
  assert.ok(enBase, "l'email doit etre normalise en minuscules");
});

test("une adresse email invalide est refusee", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");

  for (const email of ["", "pasunemail", "   "]) {
    const r = await visiteur.appel("/api/chat/contact", {
      method: "POST",
      body: { email },
    });
    assert.equal(r.statut, 400);
  }
});

test("le visiteur retrouve sa conversation en revenant", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");
  await visiteur.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Message qui doit survivre" },
  });

  const cookieConserve = visiteur.cookie;

  // Nouvelle visite : nouveau client HTTP, mais le meme cookie qu'un
  // navigateur renverrait.
  const retour = creerVisiteur();
  retour.cookie = cookieConserve;

  const r = await retour.appel("/api/chat/conversation");
  assert.equal(r.corps.messages.length, 1);
  assert.equal(r.corps.messages[0].corps, "Message qui doit survivre");
});

test("deux visiteurs ne voient pas la conversation de l'autre", options, async () => {
  const a = creerVisiteur();
  await a.appel("/api/chat/conversation");
  await a.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Message du visiteur A" },
  });

  const b = creerVisiteur();
  const r = await b.appel("/api/chat/conversation");

  assert.deepEqual(r.corps.messages, [], "B ne doit voir aucun message de A");
});

test("la liste des conversations exige une authentification", options, async () => {
  const anonyme = creerVisiteur();
  assert.equal((await anonyme.appel("/api/conversations")).statut, 401);
});

test("l'agence voit les conversations et leurs non-lus", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");
  const envoi = await visiteur.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Message vu par l'agence" },
  });
  assert.equal(envoi.statut, 201, "le message de test doit bien partir");

  const admin = await adminConnecte();
  const r = await admin.appel("/api/conversations");

  assert.equal(r.statut, 200);
  const fil = r.corps.conversations.find(
    (c) => c.dernierMessage?.corps === "Message vu par l'agence",
  );
  assert.ok(fil, "la conversation doit apparaitre cote agence");
  assert.ok(fil.nonLus >= 1, "le message doit compter comme non lu");
});

test("un visiteur sans email apparait comme non identifie", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");
  await visiteur.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Message anonyme sans email" },
  });

  const admin = await adminConnecte();
  const r = await admin.appel("/api/conversations");
  const fil = r.corps.conversations.find(
    (c) => c.dernierMessage?.corps === "Message anonyme sans email",
  );

  assert.equal(fil.client.identifie, false);
  assert.equal(fil.client.email, null);
});

test("l'envoi en rafale finit par etre limite", options, async () => {
  const spammeur = creerVisiteur();
  await spammeur.appel("/api/chat/conversation");

  let bloque = false;
  for (let i = 0; i < 15; i++) {
    const r = await spammeur.appel("/api/chat/messages", {
      method: "POST",
      body: { corps: `Message en rafale ${i}` },
    });
    if (r.statut === 429) {
      bloque = true;
      break;
    }
  }

  assert.ok(bloque, "un formulaire public doit etre protege du spam");
});

test("ouvrir un fil remet les non-lus a zero", options, async () => {
  const visiteur = creerVisiteur();
  await visiteur.appel("/api/chat/conversation");
  await visiteur.appel("/api/chat/messages", {
    method: "POST",
    body: { corps: "Message a marquer lu" },
  });

  const admin = await adminConnecte();
  const liste = await admin.appel("/api/conversations");
  const fil = liste.corps.conversations.find(
    (c) => c.dernierMessage?.corps === "Message a marquer lu",
  );
  assert.ok(fil, "la conversation doit apparaitre dans la liste");
  assert.ok(fil.nonLus >= 1);

  const detail = await admin.appel(`/api/conversations/${fil.id}/messages`);
  assert.equal(detail.statut, 200);
  assert.ok(detail.corps.messages.length >= 1);

  const apres = await admin.appel("/api/conversations");
  const relu = apres.corps.conversations.find((c) => c.id === fil.id);
  assert.equal(relu.nonLus, 0);
});
