import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAFOND_AVANT_LIVRAISON,
  arriveeAjustee,
  calculerProgression,
  patchPause,
  patchReprise,
} from "../src/domaine/progression.js";

const HEURE = 3600_000;
const T0 = new Date("2026-08-14T08:00:00Z").getTime();

// Livraison prevue sur 10 heures, demarree a T0.
function expedition(progression = {}, statut = "EN_TRANSIT") {
  return {
    statut,
    progression: {
      demarreLe: new Date(T0),
      arriveePrevueLe: new Date(T0 + 10 * HEURE),
      enPause: false,
      cumulPauseMs: 0,
      ...progression,
    },
  };
}

test("la progression vaut 0 avant le demarrage", () => {
  assert.equal(calculerProgression({ statut: "ENREGISTREE" }), 0);
  assert.equal(
    calculerProgression(expedition({ demarreLe: null })),
    0,
  );
});

test("la progression suit le temps ecoule", () => {
  assert.equal(calculerProgression(expedition(), T0 + 2 * HEURE), 0.2);
  assert.equal(calculerProgression(expedition(), T0 + 5 * HEURE), 0.5);
});

test("la barre est plafonnee tant que le colis n'est pas livre", () => {
  const tresEnRetard = calculerProgression(expedition(), T0 + 50 * HEURE);
  assert.equal(tresEnRetard, PLAFOND_AVANT_LIVRAISON);
  assert.ok(tresEnRetard < 1, "ne doit jamais afficher 100 % avant livraison");
});

test("la livraison effective met la barre a 100 %", () => {
  const livree = expedition({}, "LIVREE");
  assert.equal(calculerProgression(livree, T0 + HEURE), 1);
});

test("la progression ne descend jamais sous 0", () => {
  assert.equal(calculerProgression(expedition(), T0 - 5 * HEURE), 0);
});

test("en pause, la progression se fige a l'instant de la pause", () => {
  const enPause = expedition({
    enPause: true,
    pauseeLe: new Date(T0 + 3 * HEURE),
  });

  // Peu importe le temps qui passe ensuite, la valeur ne bouge plus.
  assert.equal(calculerProgression(enPause, T0 + 3 * HEURE), 0.3);
  assert.equal(calculerProgression(enPause, T0 + 9 * HEURE), 0.3);
});

test("apres reprise, la progression repart sans bond", () => {
  const p = expedition({
    enPause: true,
    pauseeLe: new Date(T0 + 3 * HEURE),
  }).progression;

  // Pause de 3h, puis reprise a T0+6h.
  const patch = patchReprise(p, T0 + 6 * HEURE);
  assert.equal(patch["progression.cumulPauseMs"], 3 * HEURE);

  const reprise = expedition({
    enPause: false,
    pauseeLe: null,
    cumulPauseMs: patch["progression.cumulPauseMs"],
  });

  // Juste apres la reprise, on retrouve exactement les 30 % d'avant la pause.
  assert.equal(calculerProgression(reprise, T0 + 6 * HEURE), 0.3);
  // Une heure plus tard, 40 %.
  assert.equal(calculerProgression(reprise, T0 + 7 * HEURE), 0.4);
});

test("l'arrivee prevue glisse de la duree de la pause", () => {
  const sansPause = arriveeAjustee(expedition(), T0);
  assert.equal(sansPause.getTime(), T0 + 10 * HEURE);

  const apresPause = arriveeAjustee(
    expedition({ cumulPauseMs: 3 * HEURE }),
    T0,
  );
  assert.equal(apresPause.getTime(), T0 + 13 * HEURE);
});

test("pendant une pause, l'arrivee prevue continue de reculer", () => {
  const enPause = expedition({
    enPause: true,
    pauseeLe: new Date(T0 + 3 * HEURE),
  });

  const a5h = arriveeAjustee(enPause, T0 + 5 * HEURE);
  const a8h = arriveeAjustee(enPause, T0 + 8 * HEURE);
  assert.equal(a5h.getTime(), T0 + 12 * HEURE);
  assert.equal(a8h.getTime(), T0 + 15 * HEURE);
});

test("mettre en pause deux fois de suite ne fait rien", () => {
  const p = expedition().progression;
  assert.ok(patchPause(p, T0));
  assert.equal(patchPause({ ...p, enPause: true }, T0), null);
});

test("relancer une livraison non suspendue ne fait rien", () => {
  assert.equal(patchReprise(expedition().progression, T0), null);
});

test("une duree nulle ou negative ne casse pas le calcul", () => {
  const incoherente = expedition({
    arriveePrevueLe: new Date(T0 - HEURE),
  });
  const r = calculerProgression(incoherente, T0);
  assert.equal(r, PLAFOND_AVANT_LIVRAISON);
  assert.ok(Number.isFinite(r));
});
