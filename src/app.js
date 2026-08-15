import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { creerSession } from "./config/session.js";
import routesSante from "./routes/health.js";
import routesAuth from "./routes/auth.js";
import routesExpeditions from "./routes/shipments.js";

export function creerApp() {
  const app = express();

  // Necessaire derriere un reverse proxy (Render, Railway, Nginx) pour que
  // req.ip soit juste et que les cookies Secure fonctionnent.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.origineClient, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { erreur: "Trop de requetes, reessaie dans un instant." },
    }),
  );

  app.use(creerSession());

  app.use("/api/health", routesSante);
  app.use("/api/auth", routesAuth);
  app.use("/api/shipments", routesExpeditions);

  // Express 5 : le joker ne s'ecrit plus "*" mais "/{*splat}".
  app.use("/{*splat}", (req, res) => {
    res.status(404).json({ erreur: "Route introuvable" });
  });

  // Express 5 transmet automatiquement les erreurs asynchrones ici.
  app.use((err, req, res, next) => {
    console.error("[erreur]", err);
    res.status(err.status ?? 500).json({ erreur: "Erreur serveur" });
  });

  return app;
}
