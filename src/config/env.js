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

  // Adresse de l'agence : point de départ par défaut des expéditions et
  // origine de l'itinéraire affiché sur la page de suivi (§11).
  // Elle est copiée sur chaque expédition à la création, pour qu'un ancien
  // colis conserve son point de départ même si l'agence déménage.
  adresseAgence: process.env.ADRESSE_AGENCE ?? "",
};

export const enProduction = env.nodeEnv === "production";
