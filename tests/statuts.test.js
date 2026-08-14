import test from "node:test";
import assert from "node:assert/strict";
import {
  STATUTS,
  STATUTS_TERMINAUX,
  TRANSITIONS,
  transitionAutorisee,
} from "../src/domaine/statuts.js";

test("le parcours nominal est autorise de bout en bout", () => {
  assert.ok(transitionAutorisee("ENREGISTREE", "EN_TRANSIT"));
  assert.ok(transitionAutorisee("EN_TRANSIT", "EN_LIVRAISON"));
  assert.ok(transitionAutorisee("EN_LIVRAISON", "LIVREE"));
});

test("on ne peut pas sauter d'etape ni revenir en arriere", () => {
  assert.equal(transitionAutorisee("ENREGISTREE", "LIVREE"), false);
  assert.equal(transitionAutorisee("EN_LIVRAISON", "EN_TRANSIT"), false);
  assert.equal(transitionAutorisee("LIVREE", "EN_LIVRAISON"), false);
});

test("les statuts terminaux n'ont aucune sortie", () => {
  for (const terminal of STATUTS_TERMINAUX) {
    assert.deepEqual(TRANSITIONS[terminal], []);
    for (const cible of STATUTS) {
      assert.equal(transitionAutorisee(terminal, cible), false);
    }
  }
});

test("un echec de livraison permet une nouvelle tentative", () => {
  assert.ok(transitionAutorisee("ECHEC_LIVRAISON", "EN_LIVRAISON"));
});

test("le livreur ne peut pas annuler une expedition", () => {
  assert.ok(transitionAutorisee("EN_TRANSIT", "ANNULEE", "VENDEUR"));
  assert.equal(transitionAutorisee("EN_TRANSIT", "ANNULEE", "LIVREUR"), false);
  assert.equal(
    transitionAutorisee("ENREGISTREE", "ANNULEE", "LIVREUR"),
    false,
  );
});

test("le livreur peut faire avancer la livraison", () => {
  assert.ok(transitionAutorisee("EN_TRANSIT", "EN_LIVRAISON", "LIVREUR"));
  assert.ok(transitionAutorisee("EN_LIVRAISON", "LIVREE", "LIVREUR"));
  assert.ok(
    transitionAutorisee("EN_LIVRAISON", "ECHEC_LIVRAISON", "LIVREUR"),
  );
});

test("un statut inconnu est toujours refuse", () => {
  assert.equal(transitionAutorisee("INEXISTANT", "LIVREE"), false);
  assert.equal(transitionAutorisee("EN_TRANSIT", "PERDU"), false);
});
