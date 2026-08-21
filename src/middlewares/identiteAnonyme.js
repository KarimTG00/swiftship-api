import { AnonymousClient } from "../models/AnonymousClient.js";
import { enProduction } from "../config/env.js";

export const NOM_COOKIE = "swiftshipe.cid";
const UN_AN_MS = 365 * 24 * 60 * 60 * 1000;

// Identite anonyme du visiteur (§5, §6).
//
// A la premiere visite, le serveur cree un AnonymousClient et pose un cookie
// persistant. Aux visites suivantes, le cookie permet de retrouver la
// conversation sans que le visiteur ait a creer de compte.
//
// httpOnly : le JavaScript de la page ne peut pas lire l'identifiant, donc une
// faille XSS ne permet pas de le voler et d'usurper une conversation.
export async function identiteAnonyme(req, res, next) {
  const idCookie = req.cookies?.[NOM_COOKIE];
  const estProd = process.env.NODE_ENV === "production";
  let client = null;
  if (typeof idCookie === "string" && idCookie.length > 0) {
    client = await AnonymousClient.findById(idCookie);
  }

  if (!client) {
    client = await AnonymousClient.create({
      derniereIp: req.ip,
      dernierUserAgent: req.get("user-agent"),
    });

    res.cookie(NOM_COOKIE, client._id, {
      httpOnly: true,
      sameSite: estProd ? "none" : " lax", // suffisant car front et API partagent le domaine,
      secure: enProduction,
      maxAge: UN_AN_MS,
    });
  } else {
    // Trace technique, sans attendre l'ecriture : elle ne doit pas ralentir la
    // reponse ni la faire echouer.
    AnonymousClient.updateOne(
      { _id: client._id },
      {
        $set: {
          vuLe: new Date(),
          derniereIp: req.ip,
          dernierUserAgent: req.get("user-agent"),
        },
      },
    ).catch(() => {});
  }

  req.clientAnonyme = client;
  next();
}
