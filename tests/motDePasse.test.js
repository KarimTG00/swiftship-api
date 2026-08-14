import test from "node:test";
import assert from "node:assert/strict";
import { hacher, verifier, verifierLeurre } from "../src/services/motDePasse.js";

test("un mot de passe correct est reconnu", async () => {
  const empreinte = await hacher("MonMotDePasse123!");
  assert.equal(await verifier("MonMotDePasse123!", empreinte), true);
});

test("un mot de passe incorrect est rejete", async () => {
  const empreinte = await hacher("MonMotDePasse123!");
  assert.equal(await verifier("MonMotDePasse123", empreinte), false);
  assert.equal(await verifier("", empreinte), false);
  assert.equal(await verifier("autre chose", empreinte), false);
});

test("l'empreinte ne contient jamais le mot de passe en clair", async () => {
  const empreinte = await hacher("SecretEnClair42");
  assert.equal(empreinte.includes("SecretEnClair42"), false);
});

test("deux empreintes du meme mot de passe different", async () => {
  const a = await hacher("MemeMotDePasse!");
  const b = await hacher("MemeMotDePasse!");

  assert.notEqual(a, b, "le sel doit rendre chaque empreinte unique");
  // Les deux restent pourtant valides.
  assert.equal(await verifier("MemeMotDePasse!", a), true);
  assert.equal(await verifier("MemeMotDePasse!", b), true);
});

test("l'empreinte embarque ses parametres", async () => {
  const empreinte = await hacher("peu importe");
  const [algo, n, r, p, sel, derive] = empreinte.split("$");

  assert.equal(algo, "scrypt");
  assert.ok(Number(n) >= 16384, "cout trop faible");
  assert.ok(Number(r) > 0 && Number(p) > 0);
  assert.ok(sel.length > 0 && derive.length > 0);
});

test("une empreinte malformee est rejetee sans planter", async () => {
  for (const mauvaise of [
    "",
    "n-importe-quoi",
    "scrypt$16384$8$1",
    "bcrypt$16384$8$1$c2Vs$ZGVyaXZl",
    "scrypt$16384$8$1$$",
    null,
    undefined,
    42,
  ]) {
    assert.equal(await verifier("test", mauvaise), false);
  }
});

test("hacher refuse un mot de passe vide", async () => {
  await assert.rejects(() => hacher(""));
  await assert.rejects(() => hacher(null));
});

test("le leurre renvoie toujours false", async () => {
  assert.equal(await verifierLeurre(), false);
});

test("le leurre prend un temps comparable a une vraie verification", async () => {
  const empreinte = await hacher("MotDePasseReel123");

  const chrono = async (fn) => {
    const debut = process.hrtime.bigint();
    await fn();
    return Number(process.hrtime.bigint() - debut) / 1e6;
  };

  const reel = await chrono(() => verifier("mauvais", empreinte));
  const leurre = await chrono(() => verifierLeurre());

  // Sans leurre, un email inconnu repondrait quasi instantanement et
  // permettrait de deviner quels comptes existent.
  const rapport = leurre / reel;
  assert.ok(
    rapport > 0.25 && rapport < 4,
    `ecart de temps trop important (reel ${reel.toFixed(1)}ms, leurre ${leurre.toFixed(1)}ms)`,
  );
});
