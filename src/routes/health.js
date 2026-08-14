import { Router } from "express";
import { etatBase } from "../config/db.js";
import { env } from "../config/env.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    statut: "ok",
    base: etatBase(),
    environnement: env.nodeEnv,
    horodatage: new Date().toISOString(),
  });
});

export default router;
