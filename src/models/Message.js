import mongoose from "mongoose";

export const TYPES_AUTEUR = ["CLIENT", "USER"];

// Collection separee (et non embarquee dans la conversation) : les messages
// peuvent etre nombreux, se paginent, et se consultent independamment.
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    auteurType: { type: String, enum: TYPES_AUTEUR, required: true },
    // Renseigne uniquement quand auteurType vaut USER.
    auteurUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    corps: { type: String, required: true, trim: true, maxlength: 5000 },
    luLe: Date,
  },
  { timestamps: true },
);

// Chargement d'un fil : messages d'une conversation, les plus recents d'abord.
messageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);
