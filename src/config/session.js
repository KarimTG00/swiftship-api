import crypto from "node:crypto";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";
import { env, enProduction } from "./env.js";

const JOUR_MS = 24 * 60 * 60 * 1000;

// En developpement, un secret aleatoire est genere a chaque demarrage : les
// sessions ne survivent pas a un redemarrage, ce qui est sans consequence et
// evite de figer un secret bidon dans le depot.
function secret() {
  if (env.secretSession) return env.secretSession;
  console.warn(
    "[session] SECRET_SESSION absent : secret aleatoire genere.\n" +
      "          Les sessions seront perdues a chaque redemarrage.",
  );
  return crypto.randomBytes(32).toString("hex");
}

// Le magasin reutilise la connexion Mongoose existante plutot que d'en ouvrir
// une seconde avec mongoUrl. Deux raisons : une connexion de moins vers Atlas,
// et surtout un processus qui se termine normalement — une connexion ouverte
// par connect-mongo et jamais fermee suffit a faire pendre les tests
// indefiniment.
function magasin() {
  if (mongoose.connection.readyState !== 1) {
    console.warn(
      "[session] base indisponible : sessions gardees en memoire.\n" +
        "          Elles seront perdues au redemarrage.",
    );
    return undefined; // express-session retombe sur son MemoryStore
  }

  return MongoStore.create({
    client: mongoose.connection.getClient(),
    collectionName: "sessions",
    ttl: env.dureeSessionJours * 24 * 60 * 60,
  });
}

export function creerSession() {
  return session({
    name: "swiftshipe.sid",
    secret: secret(),
    resave: false,
    // Pas de session enregistree pour un visiteur qui ne s'est pas connecte :
    // inutile de remplir la base a chaque requete anonyme.
    saveUninitialized: false,
    rolling: true, // la session se prolonge tant que l'admin est actif
    store: magasin(),
    cookie: {
      httpOnly: true, // inaccessible au JavaScript de la page (§37)
      sameSite: (process.env.NODE_ENV = "developement" ? "lax" : "none"), // suffisant car front et API partagent le domaine
      secure: enProduction, // HTTPS obligatoire en production
      maxAge: env.dureeSessionJours * JOUR_MS,
    },
  });
}
