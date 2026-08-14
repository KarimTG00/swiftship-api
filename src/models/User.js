import mongoose from "mongoose";

export const ROLES = ["ADMIN", "VENDEUR", "LIVREUR"];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select: false => le hash n'est jamais charge par defaut. Il faut le
    // demander explicitement (.select("+passwordHash")) au moment du login.
    // Ca evite de le faire fuir par inadvertance dans une reponse API.
    passwordHash: { type: String, required: true, select: false },
    nom: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    actif: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
