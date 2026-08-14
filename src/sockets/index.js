import { Server } from "socket.io";
import { env } from "../config/env.js";

// socket.io a sa propre configuration CORS, distincte de celle d'Express.
// credentials: true est indispensable : sans lui le cookie d'identite anonyme
// n'est pas transmis dans le handshake, et le serveur ne sait pas qui se
// connecte.
export function initSockets(serveurHttp) {
  const io = new Server(serveurHttp, {
    cors: { origin: env.origineClient, credentials: true },
  });

  io.on("connection", (socket) => {
    console.log("[socket] connecte :", socket.id);

    socket.on("disconnect", (raison) => {
      console.log("[socket] deconnecte :", socket.id, "-", raison);
    });
  });

  return io;
}
