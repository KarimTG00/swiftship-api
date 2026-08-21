import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import express from "express";
import { User } from "../models/User.js";

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
  try {
    const { email } = req.body;
    console.log("voici l'email : ", email);

    if (!email) {
      return res.status(400).json({
        message: "L'adresse email est obligatoire.",
      });
    }

    // Recherche du compte
    const admin = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    /*
     * On ne révèle pas si l'adresse existe ou non.
     * Cela évite qu'une personne puisse énumérer
     * les comptes administrateurs.
     */
    if (!admin) {
      return res.status(200).json({
        message:
          "Si cette adresse correspond à un compte, un email de récupération a été envoyé.",
      });
    }

    // Génération du nouveau mot de passe temporaire
    const temporaryPassword = generateTemporaryPassword();

    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    // Enregistrement dans MongoDB
    admin.password = hashedPassword;

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

${temporaryPassword}

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
              ${temporaryPassword}
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
