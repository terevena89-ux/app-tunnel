// =========================================================
// Service worker : un petit « gardien » qui tourne en arrière-plan.
// Il garde une copie des fichiers du jeu pour qu'il s'ouvre
// même sans réseau.
// À CHAQUE NOUVELLE VERSION : changer le numéro ci-dessous.
// =========================================================
const CACHE = "tunnel-v0.15.0";

// Fichiers du jeu à garder dès l'installation
const FICHIERS = ["./", "index.html", "style.css", "app.js", "manifest.json"];

// On demande toujours au serveur (« reload ») : sinon on risquerait de ranger
// l'ancienne version sous l'étiquette de la nouvelle.
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FICHIERS.map(f => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

// Supprime les copies des anciennes versions
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Fichiers du jeu : réseau d'abord (pour avoir la dernière version),
// copie en secours si pas de réseau.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: "no-cache" }).then(rep => {
      const clone = rep.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
      return rep;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
