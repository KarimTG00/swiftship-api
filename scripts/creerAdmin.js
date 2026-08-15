import mongoose from "mongoose";
import readline from "node:readline";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { hacher } from "../src/services/motDePasse.js";

const LONGUEUR_MINI = 10;

function demander(question, masque = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    if (!masque) {
      rl.question(question, (reponse) => {
        rl.close();
        resolve(reponse.trim());
      });
      return;
    }

    // Saisie masquee : on intercepte l'ecriture pour ne pas afficher le mot de
    // passe a l'ecran (ni le laisser dans l'historique du terminal).
    process.stdout.write(question);
    const ecrire = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = () => {};

    rl.question("", (reponse) => {
      if (ecrire) rl._writeToOutput = ecrire;
      rl.close();
      process.stdout.write("\n");
      resolve(reponse.trim());
    });
  });
}

async function principal() {
  if (!env.mongodbUri) {
    console.error("MONGODB_URI absent : renseigne le fichier .env.");
    process.exit(1);
  }

  await mongoose.connect(env.mongodbUri);

  // Le mot de passe n'est jamais passe en argument de ligne de commande : il
  // resterait visible dans l'historique du shell et dans la liste des process.
  const email = (process.env.ADMIN_EMAIL ?? (await demander("Email : "))).toLowerCase();
  const nom = process.env.ADMIN_NOM ?? (await demander("Nom : "));
  // Affiche au client sur la page de suivi, pour qu'il sache qui joindre.
  const telephone =
    process.env.ADMIN_TELEPHONE ?? (await demander("Telephone (facultatif) : "));
  const motDePasse = process.env.ADMIN_MOTDEPASSE ?? (await demander("Mot de passe : ", true));

  if (!email.includes("@")) {
    console.error("Email invalide.");
    process.exit(1);
  }
  if (motDePasse.length < LONGUEUR_MINI) {
    console.error(`Mot de passe trop court (${LONGUEUR_MINI} caracteres minimum).`);
    process.exit(1);
  }

  const existant = await User.findOne({ email });
  if (existant) {
    const reponse = await demander(
      `Le compte ${email} existe deja. Remplacer son mot de passe ? (o/N) : `,
    );
    if (reponse.toLowerCase() !== "o") {
      console.log("Annule.");
      await mongoose.disconnect();
      process.exit(0);
    }

    existant.passwordHash = await hacher(motDePasse);
    existant.nom = nom || existant.nom;
    if (telephone) existant.telephone = telephone;
    existant.actif = true;
    await existant.save();
    console.log(`Mot de passe de ${email} mis a jour.`);
  } else {
    await User.create({
      email,
      nom: nom || "Administrateur",
      telephone: telephone || undefined,
      role: "ADMIN",
      passwordHash: await hacher(motDePasse),
    });
    console.log(`Compte ADMIN cree : ${email}`);
  }

  await mongoose.disconnect();
}

principal().catch(async (e) => {
  console.error("Echec :", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
