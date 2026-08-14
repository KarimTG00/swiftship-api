import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { AnonymousClient, Shipment, User } from "../src/models/index.js";
import { creerExpeditionAvecTracking } from "../src/services/tracking.js";
import { MOTIF_TRACKING } from "../src/domaine/tracking.js";

// Ces tests touchent une vraie base. Ils s'executent dans une base DEDIEE
// ("swiftshipe_test"), jamais dans celle de l'application : l'option dbName
// remplace le nom de base contenu dans l'URI.
const BASE_TEST = "swiftshipe_test";
const actif = Boolean(env.mongodbUri);
const options = { skip: actif ? false : "MONGODB_URI absent" };

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function expeditionBidon(trackingNumber) {
  return {
    trackingNumber,
    destinataire: { nom: "Destinataire de test" },
    destination: "Zone de test",
    creeParId: new mongoose.Types.ObjectId(),
  };
}

// Garde-fou : ne jamais vider une base qui ne serait pas la base de test.
async function viderBaseDeTest() {
  assert.equal(
    mongoose.connection.name,
    BASE_TEST,
    "refus de vider une base qui n'est pas la base de test",
  );
  await mongoose.connection.dropDatabase();
}

before(async () => {
  if (!actif) return;
  await mongoose.connect(env.mongodbUri, {
    dbName: BASE_TEST,
    serverSelectionTimeoutMS: 15000,
  });
  await viderBaseDeTest();

  // Indispensable : un index unique ne protege qu'une fois CONSTRUIT.
  // Sans syncIndexes, les doublons passent silencieusement.
  await Promise.all([Shipment.syncIndexes(), User.syncIndexes()]);
});

after(async () => {
  if (!actif) return;
  await viderBaseDeTest();
  await mongoose.disconnect();
});

test("le numero de tracking est unique en base", options, async () => {
  await Shipment.create(expeditionBidon("SHT-999000000001-CARGO"));

  await assert.rejects(
    () => Shipment.create(expeditionBidon("SHT-999000000001-CARGO")),
    (e) => e.code === 11000,
    "un tracking en double doit etre refuse par l'index unique",
  );
});

test("l'email d'un utilisateur est unique en base", options, async () => {
  const base = { passwordHash: "x", nom: "Test", role: "ADMIN" };
  await User.create({ ...base, email: "admin@test.local" });

  await assert.rejects(
    () => User.create({ ...base, email: "ADMIN@test.local" }),
    (e) => e.code === 11000,
    "la casse ne doit pas permettre de contourner l'unicite",
  );
});

test(
  "25 creations simultanees donnent 25 trackings distincts",
  options,
  async () => {
    const N = 25;
    const creees = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        creerExpeditionAvecTracking({
          destinataire: { nom: `Destinataire ${i}` },
          destination: "Zone de test",
          creeParId: new mongoose.Types.ObjectId(),
        }),
      ),
    );

    const numeros = creees.map((e) => e.trackingNumber);
    assert.equal(new Set(numeros).size, N, "collision de numero detectee");
    for (const n of numeros) assert.match(n, MOTIF_TRACKING);
  },
);

test(
  "une collision de tracking est rattrapee automatiquement",
  options,
  async () => {
    // On occupe volontairement le numero que le generateur va sortir en
    // premier, pour forcer le passage dans la boucle de reprise.
    const { default: crypto } = await import("node:crypto");
    const original = crypto.randomInt;
    let appels = 0;

    crypto.randomInt = (min, max) => {
      appels += 1;
      return appels === 1 ? 424242424242 : original(min, max);
    };

    try {
      const premiere = await creerExpeditionAvecTracking({
        destinataire: { nom: "Premier" },
        destination: "Zone",
        creeParId: new mongoose.Types.ObjectId(),
      });
      assert.equal(premiere.trackingNumber, "SHT-424242424242-CARGO");

      appels = 0; // le prochain tirage redonnera le meme numero, donc collision
      const seconde = await creerExpeditionAvecTracking({
        destinataire: { nom: "Second" },
        destination: "Zone",
        creeParId: new mongoose.Types.ObjectId(),
      });

      assert.notEqual(seconde.trackingNumber, premiere.trackingNumber);
      assert.match(seconde.trackingNumber, MOTIF_TRACKING);
      assert.ok(appels >= 2, "la reprise sur collision n'a pas eu lieu");
    } finally {
      crypto.randomInt = original;
    }
  },
);

test(
  "deux changements de statut simultanes : un seul aboutit",
  options,
  async () => {
    const exp = await Shipment.create(expeditionBidon("SHT-999000000002-CARGO"));

    const changer = (vers) =>
      Shipment.updateOne(
        { _id: exp._id, statut: "ENREGISTREE" }, // garde anti-concurrence
        {
          $set: { statut: vers },
          $push: { evenements: { statut: vers, survenuLe: new Date() } },
        },
      );

    const [a, b] = await Promise.all([
      changer("EN_TRANSIT"),
      changer("ANNULEE"),
    ]);

    assert.equal(
      a.modifiedCount + b.modifiedCount,
      1,
      "le second changement doit etre rejete par le filtre sur le statut",
    );

    const relu = await Shipment.findById(exp._id).lean();
    assert.equal(relu.evenements.length, 1, "un seul evenement doit exister");
    assert.equal(relu.statut, relu.evenements[0].statut, "statut et historique doivent concorder");
  },
);

test(
  "l'identite anonyme est persistee avec un UUID en _id",
  options,
  async () => {
    const cree = await AnonymousClient.create({});
    const relu = await AnonymousClient.findById(cree._id).lean();

    assert.equal(typeof relu._id, "string", "ne doit pas etre un ObjectId");
    assert.match(relu._id, UUID_V4);
  },
);

test("le hash du mot de passe n'est pas relu par defaut", options, async () => {
  await User.create({
    email: "vendeur@test.local",
    passwordHash: "hash-secret",
    nom: "Vendeur",
    role: "VENDEUR",
  });

  const sansHash = await User.findOne({ email: "vendeur@test.local" }).lean();
  assert.equal(sansHash.passwordHash, undefined, "le hash ne doit pas remonter");

  const avecHash = await User.findOne({ email: "vendeur@test.local" })
    .select("+passwordHash")
    .lean();
  assert.equal(avecHash.passwordHash, "hash-secret");
});
