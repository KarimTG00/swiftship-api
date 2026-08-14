# SwiftShipe — API

API de l'application de gestion et de suivi de livraisons SwiftShipe.
Le front est dans un dépôt séparé (React / Vite).

## Stack

Node + Express 5, Mongoose 9 (MongoDB Atlas), socket.io 4.

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner MONGODB_URI
npm run dev
```

L'API écoute sur `http://localhost:4000`. Elle démarre même sans
`MONGODB_URI` : `/api/health` signale alors `"base": "deconnecte"`.

## Vérifier

```bash
curl http://localhost:4000/api/health
```

## Développement avec le front

Le serveur Vite du front proxifie `/api` et `/socket.io` vers le port 4000.
Les appels se font donc en same-origin en développement, et les cookies
fonctionnent sans contrainte CORS.

## Déploiement — contrainte importante

Le front et l'API doivent être déployés sur **deux sous-domaines du même
domaine** (par exemple `app.exemple.com` et `api.exemple.com`).

Toute l'identité du client repose sur un cookie persistant. Sur deux domaines
distincts, ce cookie devient un cookie tiers : il faudrait `SameSite=None`,
exposé au blocage des cookies tiers par les navigateurs. Sur deux
sous-domaines, `SameSite=Lax` suffit et reste fiable.

## Structure

```
src/
  index.js          démarrage : serveur HTTP + socket.io + écoute
  app.js            application Express, middlewares, routes
  config/
    env.js          variables d'environnement
    db.js           connexion Mongoose
  routes/
    health.js       GET /api/health
  sockets/
    index.js        initialisation socket.io
```
