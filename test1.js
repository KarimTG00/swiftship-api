import bcrypt from "bcryptjs";
import { User } from "./src/models/User.js";
import { connecterBase } from "./src/config/db.js";

async function tt() {
  console.log("salut");
  await connecterBase();
  try {
    const hash = await bcrypt.hash("wilfried0000", 12);

    const user = await User.create({
      email: "Gadangwilfried115@gmail.com",
      passwordHash: hash,
      nom: "wilfried",
      role: "ADMIN",
      actif: true,
    });

    console.log("Utilisateur créé :", user);
    console.log("Hash :", hash);
  } catch (error) {
    console.error(error);
  }
}

tt();
