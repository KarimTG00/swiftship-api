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
