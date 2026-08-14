import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Vide tant que le cluster Atlas n'est pas configuré : le serveur démarre
  // quand même, en signalant que la base est absente.
  mongodbUri: process.env.MONGODB_URI ?? "",

  // Origine autorisée pour CORS et pour le handshake socket.io.
  // En production : l'URL du front (sous-domaine du même domaine que l'API,
  // sinon le cookie d'identité anonyme ne sera pas transmis).
  origineClient: process.env.ORIGINE_CLIENT ?? "http://localhost:5173",
};

export const enProduction = env.nodeEnv === "production";
