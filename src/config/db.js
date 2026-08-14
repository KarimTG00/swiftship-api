import mongoose from "mongoose";
import { env } from "./env.js";

const ETATS = ["deconnecte", "connecte", "connexion", "deconnexion"];

export function etatBase() {
  return ETATS[mongoose.connection.readyState] ?? "inconnu";
}

export async function connecterBase() {
  if (!env.mongodbUri) {
    console.warn(
      "[base] MONGODB_URI absent : demarrage sans base de donnees.\n" +
        "        Renseigne la variable dans .env pour activer la persistance.",
    );
    return false;
  }

  mongoose.connection.on("connected", () => console.log("[base] connectee."));
  mongoose.connection.on("error", (e) =>
    console.error("[base] erreur :", e.message),
  );
  mongoose.connection.on("disconnected", () =>
    console.warn("[base] deconnectee."),
  );

  try {
    await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
    return true;
  } catch (e) {
    console.error("[base] connexion impossible :", e.message);
    return false;
  }
}
