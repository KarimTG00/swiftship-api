import test from "node:test";
import assert from "node:assert/strict";
import {
  LONGUEUR,
  MOTIF_TRACKING,
  formaterTracking,
  genererNumeroTracking,
  segmentAleatoire,
  trackingValide,
} from "../src/domaine/tracking.js";

test("le format est SHT-<12 chiffres>-CARGO", () => {
  assert.equal(
    formaterTracking("000000000001"),
    "SHT-000000000001-CARGO",
  );
  assert.equal(
    formaterTracking("928374651209"),
    "SHT-928374651209-CARGO",
  );
});

test("un numero genere respecte toujours le motif", () => {
  for (let i = 0; i < 500; i++) {
    assert.match(genererNumeroTracking(), MOTIF_TRACKING);
  }
});

test("le segment fait toujours 12 chiffres, zeros en tete compris", () => {
  for (let i = 0; i < 500; i++) {
    const s = segmentAleatoire();
    assert.equal(s.length, LONGUEUR);
    assert.match(s, /^\d{12}$/);
  }
});

test("deux numeros consecutifs ne sont pas identiques", () => {
  assert.notEqual(genererNumeroTracking(), genererNumeroTracking());
});

test("2000 tirages ne produisent aucun doublon", () => {
  const tirages = new Set();
  for (let i = 0; i < 2000; i++) tirages.add(genererNumeroTracking());
  assert.equal(tirages.size, 2000);
});

test("les numeros ne sont pas sequentiels", () => {
  // Un generateur sequentiel produirait des ecarts de 1 : la page de suivi
  // etant publique, ca permettrait d'enumerer toutes les expeditions.
  const valeurs = Array.from({ length: 50 }, () => Number(segmentAleatoire()));
  const ecartsUnitaires = valeurs
    .slice(1)
    .filter((v, i) => Math.abs(v - valeurs[i]) === 1).length;

  assert.equal(ecartsUnitaires, 0, "les numeros se suivent : generateur previsible");
});

test("le tirage couvre bien tout l'espace des 12 chiffres", () => {
  // Avec 1000 tirages uniformes sur 10^12, au moins un nombre doit depasser
  // 10^11 (probabilite d'echec astronomiquement faible).
  const valeurs = Array.from({ length: 1000 }, () => Number(segmentAleatoire()));
  assert.ok(Math.max(...valeurs) > 10 ** 11, "distribution anormalement basse");
});

test("trackingValide accepte le bon format et rejette le reste", () => {
  assert.ok(trackingValide("SHT-123456789012-CARGO"));
  assert.ok(trackingValide("sht-123456789012-cargo"), "casse indifferente");

  assert.equal(trackingValide("SHT-12345678901-CARGO"), false, "11 chiffres");
  assert.equal(trackingValide("SHT-1234567890123-CARGO"), false, "13 chiffres");
  assert.equal(trackingValide("SHT-12345678901A-CARGO"), false, "lettre");
  assert.equal(trackingValide("SWS-2026-928374"), false, "ancien format");
  assert.equal(trackingValide("SHT-123456789012"), false, "suffixe manquant");
  assert.equal(trackingValide(""), false);
  assert.equal(trackingValide(null), false);
  assert.equal(trackingValide(undefined), false);
});
