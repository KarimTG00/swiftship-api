import nodemailer from "nodemailer";

import rateLimit from "express-rate-limit";

import express from "express";
import { User } from "../models/User.js";
import crypto from "crypto";
import { promisify } from "util";

const router = express.Router();

// Limite spécifiquement la récupération de mot de passe
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // maximum 3 demandes
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    message: "Trop de tentatives. Veuillez réessayer dans quelques minutes.",
  },
});

// Configuration SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Génération d'un mot de passe temporaire
function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

// Route récupération
router.post("/recuperation", passwordResetLimiter, async (req, res) => {
  const scryptAsync = promisify(crypto.scrypt);

  // Vos constantes pour le format scrypt
  const ALGO = "scrypt";
  const SEPARATEUR = "$";

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "L'adresse email est obligatoire.",
      });
    }

    // Recherche du compte
    const admin = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!admin) {
      return res.status(200).json({
        message:
          "Si cette adresse correspond à un compte, un email de récupération a été envoyé.",
      });
    }

    // 1. Génération du nouveau mot de passe temporaire (en clair)
    // C'est cette variable 'temporaryPassword' que vous devez envoyer par email à l'utilisateur
    const temporaryPassword = generateTemporaryPassword();

    // 2. Configuration et hachage en scrypt
    const N = 16384;
    const r = 8;
    const p = 1;
    const cleLongueur = 64;

    const sel = crypto.randomBytes(16);
    const derive = await scryptAsync(temporaryPassword, sel, cleLongueur, {
      N,
      r,
      p,
    });

    // 3. Construction du hash au format compatible avec votre vérification
    const selB64 = sel.toString("base64");
    const deriveB64 = derive.toString("base64");
    const hashCompatibleScrypt = `${ALGO}${SEPARATEUR}${N}${SEPARATEUR}${r}${SEPARATEUR}${p}${SEPARATEUR}${selB64}${SEPARATEUR}${deriveB64}`;

    // 4. Mise à jour de l'utilisateur dans la base de données
    admin.passwordHash = hashCompatibleScrypt;
    await admin.save();

    // Variable 'mdp' contenant le vrai mot de passe temporaire pour votre logique d'envoi d'email
    const mdp = temporaryPassword;

    console.log(`Nouveau mot de passe en clair à envoyer par email : ${mdp}`);

    // Ajoutez ici votre logique pour envoyer 'mdp' par email à l'administrateur...

    await admin.save();

    // Email
    await transporter.sendMail({
      from: `"Administration" <${process.env.SMTP_FROM}>`,

      to: admin.email,

      subject: "Réinitialisation de votre mot de passe",

      text: `
Bonjour,

Votre mot de passe administrateur a été réinitialisé.

Votre nouveau mot de passe temporaire est :

${mdp}

Nous vous recommandons de vous connecter puis de modifier immédiatement ce mot de passe.

Si vous n'êtes pas à l'origine de cette demande, veuillez contacter l'administrateur du système.

Cordialement,
L'équipe d'administration
        `,

      html: `
          <h2>Réinitialisation du mot de passe</h2>

          <p>Bonjour,</p>

          <p>
            Votre mot de passe administrateur a été réinitialisé.
          </p>

          <p>
            Votre nouveau mot de passe temporaire est :
          </p>

          <p>
            <strong style="font-size: 20px;">
              ${mdp}
            </strong>
          </p>

          <p>
            Nous vous recommandons de vous connecter puis
            de modifier immédiatement ce mot de passe.
          </p>

          <p>
            Si vous n'êtes pas à l'origine de cette demande,
            veuillez contacter l'administrateur du système.
          </p>

          <p>
            Cordialement,<br>
            L'équipe d'administration
          </p>
        `,
    });

    console.log("envoyé");
    return res.status(200).json({
      message:
        "Si cette adresse correspond à un compte, un email de récupération a été envoyé.",
    });
  } catch (error) {
    console.error("Erreur récupération mot de passe :", error);

    return res.status(500).json({
      message: "Une erreur est survenue lors de la récupération du compte.",
    });
  }
});

export default router;
