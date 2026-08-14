import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

// scrypt vient de node:crypto : aucune dependance native a compiler, donc
// aucun probleme d'installation sous Windows, contrairement a argon2 ou bcrypt.
// C'est une fonction memory-hard, resistante aux attaques par GPU.
const N = 16384; // cout CPU/memoire (~16 Mo par calcul)
const R = 8;
const P = 1;
const LONGUEUR_CLE = 64;
const LONGUEUR_SEL = 16;

const SEPARATEUR = "$";
const ALGO = "scrypt";

export async function hacher(motDePasse) {
  if (typeof motDePasse !== "string" || motDePasse.length === 0) {
    throw new Error("Mot de passe vide.");
  }

  // Un sel unique par mot de passe : deux comptes avec le meme mot de passe
  // produisent des empreintes differentes, et les tables precalculees sont
  // inutilisables.
  const sel = crypto.randomBytes(LONGUEUR_SEL);
  const derive = await scrypt(motDePasse, sel, LONGUEUR_CLE, { N, r: R, p: P });

  return [
    ALGO,
    N,
    R,
    P,
    sel.toString("base64"),
    derive.toString("base64"),
  ].join(SEPARATEUR);
}

export async function verifier(motDePasse, empreinte) {
  if (typeof motDePasse !== "string" || typeof empreinte !== "string") {
    return false;
  }

  const parties = empreinte.split(SEPARATEUR);
  if (parties.length !== 6 || parties[0] !== ALGO) return false;

  const [, n, r, p, selB64, deriveB64] = parties;
  const sel = Buffer.from(selB64, "base64");
  const attendu = Buffer.from(deriveB64, "base64");
  if (sel.length === 0 || attendu.length === 0) return false;

  let calcule;
  try {
    calcule = await scrypt(motDePasse, sel, attendu.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }

  // Comparaison a temps constant : une comparaison classique s'arrete au
  // premier octet different et laisse fuir l'empreinte, octet par octet.
  return crypto.timingSafeEqual(calcule, attendu);
}

// Empreinte factice, utilisee quand l'email est inconnu. Sans elle, une
// tentative sur un compte inexistant repondrait bien plus vite que sur un
// compte existant : l'ecart de temps permettrait de savoir quels emails sont
// enregistres.
const EMPREINTE_LEURRE = await hacher(crypto.randomBytes(32).toString("hex"));

export async function verifierLeurre() {
  await verifier("mot-de-passe-quelconque", EMPREINTE_LEURRE);
  return false;
}
