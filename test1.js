// import bcrypt from "bcryptjs";
// import { User } from "./src/models/User.js";
// import { connecterBase } from "./src/config/db.js";

// async function tt() {
//   console.log("salut");
//   await connecterBase();
//   try {
//     const hash = await bcrypt.hash("wilfried0000", 12);

//     const user = await User.create({
//       email: "Gadangwilfried115@gmail.com",
//       passwordHash: hash,
//       nom: "wilfried",
//       role: "ADMIN",
//       actif: true,
//     });

//     console.log("Utilisateur créé :", user);
//     console.log("Hash :", hash);
//   } catch (error) {
//     console.error(error);
//   }
// }

// tt();

import crypto from "crypto";
import { promisify } from "node:util";
import { User } from "./src/models/User.js";
import { connecterBase } from "./src/config/db.js";

const scryptAsync = promisify(crypto.scrypt);

// Vos constantes globales pour la compatibilité avec la vérification
const ALGO = "scrypt";
const SEPARATEUR = "$";

async function tt() {
  console.log("salut");
  await connecterBase();
  try {
    // 1. Configuration des paramètres scrypt
    const N = 16384;
    const r = 8;
    const p = 1;
    const cleLongueur = 64;

    // 2. Génération du sel et dérivation du mot de passe
    const sel = crypto.randomBytes(16);
    const derive = await scryptAsync("wilfried0000", sel, cleLongueur, {
      N,
      r,
      p,
    });

    // 3. Construction de l'empreinte au format PHC (6 parties séparées par $)
    const selB64 = sel.toString("base64");
    const deriveB64 = derive.toString("base64");
    const hashCompatibleScrypt = `${ALGO}${SEPARATEUR}${N}${SEPARATEUR}${r}${SEPARATEUR}${p}${SEPARATEUR}${selB64}${SEPARATEUR}${deriveB64}`;

    // 4. Insertion de l'utilisateur avec le nouveau hash scrypt
    const user = await User.create({
      email: "Gadangwilfried115@gmail.com",
      passwordHash: hashCompatibleScrypt, // Format scrypt compatible injecté ici
      nom: "wilfried",
      role: "ADMIN",
      actif: true,
    });

    console.log("Utilisateur créé :", user);
    console.log("Hash scrypt compatible :", hashCompatibleScrypt);
  } catch (error) {
    console.error(error);
  }
}

tt();
