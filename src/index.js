import http from "node:http";
import { creerApp } from "./app.js";
import { connecterBase } from "./config/db.js";
import { initSockets } from "./sockets/index.js";
import { env } from "./config/env.js";

const app = creerApp();
const serveur = http.createServer(app);

// socket.io se greffe sur le meme serveur HTTP qu'Express : un seul port.
initSockets(serveur);

await connecterBase();

// Sans ce gestionnaire, un port deja pris fait planter Node sur un
// "Unhandled 'error' event" illisible.
serveur.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `[api] le port ${env.port} est deja utilise.\n` +
        `      Un autre serveur tourne probablement deja : arrete-le, ou\n` +
        `      change la variable PORT dans le fichier .env.`,
    );
    process.exit(1);
  }
  throw e;
});

serveur.listen(env.port, () => {
  console.log(
    `[api] SwiftShipe demarree sur http://localhost:${env.port} (${env.nodeEnv})`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n[api] arret (${signal})...`);
    serveur.close(() => process.exit(0));
  });
}
