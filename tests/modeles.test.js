import test from "node:test";
import assert from "node:assert/strict";

// Mongoose valide un document SANS connexion a la base : ces tests verifient
// les schemas (champs requis, enums, valeurs par defaut) hors ligne.
import {
  AnonymousClient,
  Conversation,
  DemandeContact,
  Message,
  Shipment,
  User,
} from "../src/models/index.js";
import mongoose from "mongoose";

const idBidon = new mongoose.Types.ObjectId();

// Verifie qu'un document est invalide et renvoie ses erreurs de validation.
async function erreursDe(doc) {
  let capturee;
  await assert.rejects(
    () => doc.validate(),
    (e) => {
      capturee = e;
      return e instanceof mongoose.Error.ValidationError;
    },
  );
  return capturee.errors;
}

test("User refuse un role inconnu", async () => {
  const erreurs = await erreursDe(
    new User({
      email: "a@b.c",
      passwordHash: "x",
      nom: "Test",
      role: "PIRATE",
    }),
  );
  assert.ok(erreurs.role);
});

test("User met l'email en minuscules et est actif par defaut", async () => {
  const u = new User({
    email: "  ADMIN@Exemple.COM ",
    passwordHash: "x",
    nom: "Test",
    role: "ADMIN",
  });

  await u.validate();
  assert.equal(u.email, "admin@exemple.com");
  assert.equal(u.actif, true);
});

test("le hash du mot de passe n'est pas selectionne par defaut", () => {
  assert.equal(User.schema.path("passwordHash").options.select, false);
});

test("Shipment exige un tracking, un destinataire et une destination", async () => {
  const erreurs = await erreursDe(new Shipment({}));
  assert.ok(erreurs["trackingNumber"]);
  assert.ok(erreurs["destinataire.nom"]);
  assert.ok(erreurs["destination"]);
  assert.ok(erreurs["creeParId"]);
});

test("Shipment applique le statut initial et une progression neutre", async () => {
  const s = new Shipment({
    trackingNumber: "sht-000000000001-cargo",
    destinataire: { nom: "Destinataire" },
    destination: "Zone Nord",
    creeParId: idBidon,
  });

  await s.validate();
  assert.equal(s.statut, "ENREGISTREE");
  assert.equal(
    s.trackingNumber,
    "SHT-000000000001-CARGO",
    "doit passer en majuscules",
  );
  assert.equal(s.progression.enPause, false);
  assert.equal(s.progression.cumulPauseMs, 0);
});

test("Shipment accepte une expedition sans kilometrage", async () => {
  const s = new Shipment({
    trackingNumber: "SHT-000000000002-CARGO",
    destinataire: { nom: "Destinataire" },
    destination: "Zone Sud",
    creeParId: idBidon,
  });

  await s.validate();
  assert.equal(s.distanceKm, undefined);
});

test("Shipment refuse un kilometrage negatif", async () => {
  const erreurs = await erreursDe(
    new Shipment({
      trackingNumber: "SHT-000000000003-CARGO",
      destinataire: { nom: "D" },
      destination: "Z",
      creeParId: idBidon,
      distanceKm: -5,
    }),
  );
  assert.ok(erreurs.distanceKm);
});

test("Shipment refuse un numero de tracking malforme", async () => {
  const erreurs = await erreursDe(
    new Shipment({
      trackingNumber: "SWS-2026-000001", // ancien format
      destinataire: { nom: "D" },
      destination: "Z",
      creeParId: idBidon,
    }),
  );
  assert.ok(erreurs.trackingNumber);
});

test("AnonymousClient genere un UUID impossible a deviner", () => {
  const a = new AnonymousClient();
  const b = new AnonymousClient();

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(a._id, uuid);
  assert.notEqual(a._id, b._id);
  assert.equal(typeof a._id, "string", "ne doit pas etre un ObjectId");
});

test("Conversation autorise une expedition inconnue au depart", async () => {
  const c = new Conversation({ type: "CLIENT", anonymousClientId: "abc" });

  await c.validate();
  assert.equal(
    c.shipmentId,
    null,
    "le client peut ecrire avant de donner son tracking",
  );
});

test("Conversation refuse un type hors CLIENT / INTERNE", async () => {
  const erreurs = await erreursDe(new Conversation({ type: "PUBLIQUE" }));
  assert.ok(erreurs.type);
});

test("Message limite la taille du corps", async () => {
  const erreurs = await erreursDe(
    new Message({
      conversationId: idBidon,
      auteurType: "CLIENT",
      corps: "a".repeat(5001),
    }),
  );
  assert.ok(erreurs.corps);
});

test("DemandeContact exige un email et un message", async () => {
  const erreurs = await erreursDe(new DemandeContact({}));
  assert.ok(erreurs.email);
  assert.ok(erreurs.message);
});
