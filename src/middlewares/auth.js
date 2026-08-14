import { User } from "../models/User.js";

// Charge l'utilisateur de la session sur req.utilisateur, ou renvoie 401.
// La session ne conserve que l'identifiant : les droits sont relus en base a
// chaque requete, pour qu'un compte desactive perde son acces immediatement
// sans attendre l'expiration de son cookie.
export async function exigerAuth(req, res, next) {
  const id = req.session?.utilisateurId;
  if (!id) {
    return res.status(401).json({ erreur: "Authentification requise" });
  }

  const utilisateur = await User.findById(id);
  if (!utilisateur || !utilisateur.actif) {
    req.session.destroy(() => {});
    return res.status(401).json({ erreur: "Authentification requise" });
  }

  req.utilisateur = utilisateur;
  next();
}

export function exigerRole(...roles) {
  return (req, res, next) => {
    if (!req.utilisateur) {
      return res.status(401).json({ erreur: "Authentification requise" });
    }
    if (!roles.includes(req.utilisateur.role)) {
      return res.status(403).json({ erreur: "Acces refuse" });
    }
    next();
  };
}

// Representation d'un utilisateur destinee au client : liste blanche, jamais
// l'objet Mongoose complet.
export function serialiserUtilisateur(utilisateur) {
  if (!utilisateur) return null;
  return {
    id: utilisateur._id.toString(),
    email: utilisateur.email,
    nom: utilisateur.nom,
    role: utilisateur.role,
  };
}
