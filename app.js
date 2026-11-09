"use strict";
// =========================================================
// Tunnel — vue de dessus (v0.15)
//
// Le monde est fait de petits pixels (zoom réglable, ~2,4 px à l'écran) : chaque outil peut les enlever un par un.
// - On part d'une clairière, au pied d'une falaise ; l'entrée de la mine est dans la paroi.
// - Plus on s'éloigne de l'entrée, plus la roche est dure (×1,4 par zone) et plus le butin est riche.
// - 4 outils : jet d'énergie (loin, rapide, abîme les objets), pinceau (au contact, doux),
//   pioche (au contact, gros coups), bombes (à trouver, lancées vers le doigt).
// - Objets enfouis à déterrer (fragiles) → cérémonie + collection ; mini-butin → sac.
// Tout est dessiné dans une petite image (1 pixel = 1 pixel du monde), agrandie ×3 sans flou.
// =========================================================

const VERSION = "0.15.0";

// ---------- 1. Le monde ----------
let P = 3;                            // taille d'un pixel du monde à l'écran (px) : réglable (Zoom)
const W = 480, H = 1000, N = W * H;   // taille du monde (pixels)
const EX = 240;                       // milieu de l'entrée de la mine
const FAL_HAUT = 800, FAL_BAS = 860;  // la falaise (entre la mine au-dessus et la clairière en dessous)
const DEPART = { x: EX, y: 935 };     // le mineur commence dans la clairière

// Types de matière
const VIDE = 0, TERRE = 1, ROCHE = 2, DURE = 3, MOUSSE = 4, MINERAI = 5, OBJET = 6, BORD = 7, FALAISE = 8, ARBRE = 9;
const cassable = t => t >= TERRE && t <= MINERAI;
const PVBASE = [0, 0.35, 1.0, 2.2, 0.2, 1.4, 0, 0, 0, 0];
// Hauteur de la « face avant » des murs (vue 3/4), selon ce qui est au-dessus
const FH = [0, 6, 6, 6, 5, 6, 6, 6, 16, 9], FHMAX = 16;

// Les zones de la mine, de l'entrée vers le fond (d = distance à l'entrée, en pixels)
const REGIONS = [
  { nom: "Galerie d'entrée",    d: 0,   terre: [139, 94, 60],  roche: [118, 116, 124], dure: [88, 84, 98],  minerai: [236, 188, 70],  butin: "pepite",    sol: "racines" },
  { nom: "Grotte humide",       d: 110, terre: [78, 92, 98],   roche: [92, 112, 122],  dure: [58, 74, 92],  minerai: [120, 206, 236], butin: "eclat",     sol: "dalles" },
  { nom: "Veine de cristal",    d: 230, terre: [94, 74, 112],  roche: [122, 98, 152],  dure: [76, 58, 104], minerai: [206, 146, 255], butin: "amethyste", sol: "mosaique" },
  { nom: "Ruines anciennes",    d: 360, terre: [150, 118, 78], roche: [178, 150, 108], dure: [124, 98, 70], minerai: [255, 218, 116], butin: "piece",     sol: "plancher" },
  { nom: "Cœur de la montagne", d: 500, terre: [72, 46, 44],   roche: [66, 56, 64],    dure: [44, 34, 42],  minerai: [244, 84, 72],   butin: "rubis",     sol: "basalte" }
];
const MULT = REGIONS.map((r, k) => Math.pow(1.4, k)); // dureté : ×1,4 à chaque zone (exponentiel)

// Le petit butin (va dans le sac)
const BUTINS = {
  caillou:   { nom: "Caillou",        val: 1,  c: [158, 152, 160] },
  pepite:    { nom: "Pépite d'or",    val: 5,  c: [255, 200, 70] },
  eclat:     { nom: "Éclat bleu",     val: 10, c: [120, 210, 255] },
  amethyste: { nom: "Améthyste",      val: 20, c: [206, 146, 255] },
  piece:     { nom: "Pièce ancienne", val: 35, c: [240, 204, 96] },
  rubis:     { nom: "Rubis",          val: 60, c: [244, 72, 84] },
  bombe:     { nom: "Bombe",          val: 0,  c: [70, 66, 92] },
  capsule:   { nom: "Capsule",        val: 0,  c: [206, 146, 255], special: true }, // ouvre un choix de cartes rares
  recharge:  { nom: "Recharge de lampe", val: 0, c: [120, 210, 255], special: true },
  // Blocs de matière : en creusant, des petits cubes sautent du mur (1 pour ~4 pixels, parfois un gros = 4). val = par unité.
  m_terre:   { nom: "Terre",          val: 1,  c: [139, 94, 60],   miette: true },
  m_roche:   { nom: "Roche",          val: 2,  c: [118, 116, 124], miette: true },
  m_dure:    { nom: "Roche dure",     val: 3,  c: [88, 84, 98],    miette: true },
  m_mousse:  { nom: "Mousse",         val: 1,  c: [96, 140, 70],   miette: true },
  m_minerai: { nom: "Minerai", val: 4, c: [236, 188, 70], miette: true }
};
const MIETTE = { [TERRE]: "m_terre", [ROCHE]: "m_roche", [DURE]: "m_dure", [MOUSSE]: "m_mousse", [MINERAI]: "m_minerai" };

// Les objets enfouis (collection). r = première zone où on peut les trouver. Chaque lettre = 3 × 3 pixels.
const OS = { X: [234, 223, 196], o: [163, 150, 117], w: [255, 250, 235] };
const OBJETS = [
  { nom: "Ammonite",       r: 0, val: 40,  dessin: [".XXX.", "XowXX", "XoXoX", "XXooX", ".XXX."], pal: OS },
  { nom: "Grand os",       r: 0, val: 30,  dessin: ["Xw.....wX", "XXXXXXXXX", "Xo.....oX"], pal: OS },
  { nom: "Dent",           r: 0, val: 25,  dessin: ["XXX", "XwX", "XoX", ".X."], pal: OS },
  { nom: "Trilobite",      r: 1, val: 70,  dessin: [".XXX.", "XoXoX", "XXwXX", "XoXoX", "XXXXX", ".X.X."], pal: { X: [196, 170, 132], o: [126, 102, 76], w: [240, 222, 190] } },
  { nom: "Poisson fossile", r: 1, val: 80, dessin: ["..X....", "XXXXX.X", "XwXoXXX", "XXXXX.X", "..X...."], pal: OS },
  { nom: "Cristal",        r: 2, val: 120, dessin: ["..w..", ".wBX.", "XwBXX", "XBBXo", "XBBXo", ".XXo."], pal: { X: [143, 227, 255], B: [75, 176, 230], o: [42, 111, 176], w: [255, 255, 255] } },
  { nom: "Géode",          r: 2, val: 140, dessin: [".XXX.", "XBwBX", "XwBBX", "XBBwX", ".XXX."], pal: { X: [150, 140, 150], B: [176, 112, 236], w: [246, 226, 255] } },
  { nom: "Amphore",        r: 3, val: 200, dessin: [".XX.", "XwoX", ".XX.", "XXXX", "XwoX", "XooX", ".XX."], pal: { X: [206, 116, 70], o: [150, 76, 44], w: [240, 170, 120] } },
  { nom: "Médaillon",      r: 3, val: 260, dessin: [".XXX.", "XoGoX", "XGwGX", "XoGoX", ".XXX."], pal: { X: [236, 196, 80], o: [176, 130, 40], G: [80, 190, 140], w: [255, 250, 210] } },
  { nom: "Statuette",      r: 3, val: 220, dessin: [".X.", "XwX", ".X.", "XXX", "XoX", "X.X"], pal: { X: [120, 180, 150], o: [70, 120, 100], w: [190, 236, 210] } },
  { nom: "Crâne",          r: 4, val: 380, dessin: [".XXX.", "XXwXX", "XoXoX", "XXXXX", ".X.X."], pal: OS },
  { nom: "Œuf de dragon",  r: 4, val: 500, dessin: [".XX.", "XwXX", "XXoX", "XoXX", "XXXX", ".XX."], pal: { X: [236, 96, 70], o: [150, 40, 50], w: [255, 210, 140] } }
];
const QUALITES = ["intacte", "fêlée", "abîmée"], QUAL_MULT = [1, 0.6, 0.3];

// Hasard « fixe » : la même case donne toujours le même nombre (la graine change à chaque nouvelle mine)
let GRAINE = (Math.random() * 1e6) | 0;
const hache = (x, y, s = 0) => { let h = x * 374761393 + y * 668265263 + (s + GRAINE * 7919) * 2147483647; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const type = new Uint8Array(N), base = new Uint8Array(N), reg = new Uint8Array(N), pv = new Float32Array(N);
const coul = new Uint8Array(N * 3), sol = new Uint8Array(N * 3);
const zoneM = new Int16Array(N), zoneC = new Int16Array(N), zoneO = new Int16Array(N); // mousse / matière qui couvre un objet / pixel d'objet
const dans = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const typeEn = (x, y) => dans(x, y) ? type[y * W + x] : BORD;
const solide = (x, y) => typeEn(x, y) !== VIDE;
const zones = [];

// ---------- 2. Couleurs du sol ----------
const MOSA = [[176, 92, 64], [212, 176, 96], [72, 120, 140], [226, 214, 190]];
function couleurSol(x, y, style) {
  if (style === "dalles") { // dalles de pierre en quinconce
    const tx = (x / 10) | 0, yy = y + (tx & 1) * 5, ty = (yy / 10) | 0;
    if (x % 10 === 0 || yy % 10 === 0) return [44, 46, 50];
    const k = (0.85 + 0.3 * hache(tx, ty, 2)) * (hache(x, y, 3) < 0.03 ? 0.7 : 1);
    return [112 * k, 118 * k, 120 * k];
  }
  if (style === "mosaique") { // mosaïque en losanges
    if (x % 3 === 0 || y % 3 === 0) return [56, 48, 60];
    const cx = (x / 3) | 0, cy = (y / 3) | 0, d = Math.abs((cx % 10) - 4.5) + Math.abs((cy % 10) - 4.5);
    const c = MOSA[Math.floor(d) % 4], k = 0.9 + 0.15 * hache(cx, cy, 4);
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  if (style === "plancher") { // vieux plancher cloué
    const rang = (y / 5) | 0, px = x + rang * 7;
    if (y % 5 === 0 || px % 24 === 0) return [50, 36, 26];
    if (px % 24 === 2 && y % 5 === 2) return [170, 160, 140];
    const k = 0.85 + 0.25 * hache(rang, (px / 24) | 0, 6);
    return [118 * k, 84 * k, 54 * k];
  }
  if (style === "basalte") { // grosses dalles noires, fentes rougeoyantes
    const tx = (x / 14) | 0, ty = ((y + (tx & 1) * 7) / 14) | 0, bx = x % 14, by = (y + (tx & 1) * 7) % 14;
    if (bx === 0 || by === 0) return hache(tx, ty, 9) < 0.35 ? [190, 60, 30] : [24, 18, 20];
    const k = 0.85 + 0.25 * hache(tx, ty, 8);
    return [52 * k, 44 * k, 48 * k];
  }
  // « racines » : terre battue traversée de racines
  const v = Math.sin(x * 0.09 + hache(x >> 6, y >> 6, 8) * 6) * 7 + Math.sin(x * 0.23) * 2;
  if (Math.abs((y % 36) - 18 - v) < 1) return [134, 98, 58];
  const k = 0.9 + 0.15 * hache(x >> 1, y >> 1, 5);
  return [96 * k, 78 * k, 60 * k];
}
// Herbe de la clairière, avec fleurs et un petit chemin vers l'entrée
function couleurHerbe(x, y) {
  const chemin = Math.abs(x - EX - Math.sin(y * 0.05) * 6) < 7 - (y > 960 ? (y - 960) * 0.2 : 0);
  if (chemin) { const k = 0.9 + 0.2 * hache(x >> 1, y >> 1, 13); return [150 * k, 118 * k, 78 * k]; }
  const f = hache(x, y, 14);
  if (f < 0.006) return [255, 250, 240];
  if (f < 0.010) return [255, 214, 90];
  if (f < 0.013) return [236, 130, 170];
  const k = 0.88 + 0.2 * hache(x >> 1, y >> 1, 15) + (hache(x, y, 16) < 0.08 ? 0.12 : 0);
  return [84 * k, 146 * k, 66 * k];
}
function regionDe(x, y) {
  const d = Math.hypot(x - EX, (y - FAL_HAUT) * 0.9) + (hache(x >> 5, y >> 5, 17) - 0.5) * 36;
  let r = 0;
  for (let k = 0; k < REGIONS.length; k++) if (d >= REGIONS[k].d) r = k;
  return r;
}

// ---------- 3. Fabrication de la mine ----------
const caillouxSol = []; // butin posé par terre au départ (bombes, quelques gemmes dans les grottes)
function generer() {
  zones.length = 0; zoneM.fill(-1); zoneC.fill(-1); zoneO.fill(-1); caillouxSol.length = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let t, c;
    if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) { t = BORD; c = [30, 26, 34]; reg[i] = 0; }
    else if (y < FAL_HAUT) {
      // La mine : terre, roche, roche dure, filons de minerai
      const r = regionDe(x, y); reg[i] = r;
      const R = REGIONS[r];
      const n = hache(x >> 4, y >> 4, 1) * 0.6 + hache(x >> 2, y >> 2, 2) * 0.3 + hache(x, y, 3) * 0.1;
      t = n > 0.8 - r * 0.035 ? DURE : n > 0.56 - r * 0.04 ? ROCHE : TERRE;
      if (hache(x >> 3, y >> 3, 4) > 0.935 - r * 0.008 && hache(x >> 1, y >> 1, 5) > 0.35) t = MINERAI;
      c = t === DURE ? R.dure : t === ROCHE ? R.roche : t === MINERAI ? R.minerai : R.terre;
      if (t === MINERAI && hache(x, y, 6) < 0.5) c = R.roche; // filon tacheté
    } else if (y < FAL_BAS) {
      // La falaise : pierre grise striée (on ne peut pas la creuser)
      reg[i] = 0; t = FALAISE;
      const strie = (y + ((hache(x >> 3, 0, 18) * 3) | 0)) % 7 === 0;
      c = strie ? [96, 94, 104] : [132, 128, 136];
      if (y < FAL_HAUT + 6 && hache(x >> 1, y, 19) < 0.5) c = [92, 128, 70]; // herbe au bord du plateau
    } else { reg[i] = 0; t = VIDE; c = [0, 0, 0]; }
    base[i] = t;
    const k = (hache((x / 3) | 0, (y / 3) | 0, 7) < 0.22 ? 0.84 : hache((x / 3) | 0, (y / 3) | 0, 7) > 0.86 ? 1.12 : 1) * (0.95 + 0.08 * hache(x, y, 9));
    coul[i * 3] = Math.min(255, c[0] * k); coul[i * 3 + 1] = Math.min(255, c[1] * k); coul[i * 3 + 2] = Math.min(255, c[2] * k);
    const s = y >= FAL_HAUT ? couleurHerbe(x, y) : couleurSol(x, y, REGIONS[reg[i]].sol);
    sol[i * 3] = s[0]; sol[i * 3 + 1] = s[1]; sol[i * 3 + 2] = s[2];
  }
  const vider = (cx, cy, rx, ry, bruit) => {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      if (!dans(x, y)) continue;
      const i = y * W + x;
      if (base[i] === BORD) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (hache(x >> 1, y >> 1, 12) - 0.5) * bruit < 1) base[i] = VIDE;
    }
  };
  // L'entrée : un couloir dans la falaise, puis une première salle
  for (let y = FAL_HAUT - 4; y < FAL_BAS; y++) for (let x = EX - 14; x <= EX + 14; x++) {
    const bord = Math.abs(x - EX) > 12 - (hache(x, y >> 2, 20) < 0.3 ? 1 : 0);
    if (!bord) base[y * W + x] = VIDE;
  }
  vider(EX, FAL_HAUT - 24, 30, 22, 0.4);
  // Grottes au hasard (on y voit le vieux sol) ; certaines cachent une bombe ou des gemmes
  for (let k = 0; k < 48; k++) {
    const cx = 24 + hache(k, 1, 11) * (W - 48), cy = 24 + hache(k, 2, 11) * (FAL_HAUT - 90);
    if (Math.hypot(cx - EX, cy - FAL_HAUT) < 70) continue;
    const rx = 8 + hache(k, 3, 11) * 18, ry = 6 + hache(k, 4, 11) * 12;
    vider(cx, cy, rx, ry, 0.5);
    if (hache(k, 5, 11) < 0.55) caillouxSol.push({ x: cx, y: cy, k: "recharge" }); // recharge de lampe posée dans la grotte
    if (hache(k, 6, 11) < 0.5) for (let j = 0; j < 3; j++) caillouxSol.push({ x: cx + (hache(k, j, 21) - 0.5) * rx, y: cy + (hache(k, j, 22) - 0.5) * ry, k: REGIONS[regionDe(cx, cy)].butin });
  }
  // Clairière : arbres et buissons (plus serrés sur les côtés et en bas)
  for (let k = 0; k < 900; k++) {
    const x = 8 + Math.random() * (W - 16), y = FAL_BAS + 6 + Math.random() * (H - FAL_BAS - 10);
    const ecart = Math.abs(x - EX), bas = y > H - 40;
    const p = ecart > 95 ? 0.9 : ecart > 70 ? 0.25 : bas ? 0.5 : 0.015;
    if (Math.random() > p || (ecart < 22 && !bas) || Math.hypot(x - DEPART.x, y - DEPART.y) < 22) continue;
    const r = Math.random() < 0.3 ? 3 + Math.random() * 2 : 6 + Math.random() * 5;
    arbre(x, y, r);
  }
  // Zones : objets enfouis et plaques de mousse
  const places = [];
  const libre = (x, y, r) => Math.hypot(x - EX, y - FAL_HAUT) > 60 + r && places.every(p => Math.hypot(p[0] - x, p[1] - y) > p[2] + r + 8);
  let nObj = 0, nMousse = 0;
  for (let essai = 0; essai < 8000 && (nObj < 30 || nMousse < 20); essai++) {
    const proche = nObj + nMousse < 4; // les premières tout près de l'entrée, pour commencer vite
    const x = proche ? EX + (Math.random() - 0.5) * 140 : 24 + Math.random() * (W - 48);
    const y = proche ? FAL_HAUT - 50 - Math.random() * 50 : 24 + Math.random() * (FAL_HAUT - 70);
    const mousse = nMousse < 20 && (nObj >= 30 || Math.random() < 0.4), r = mousse ? 16 : 18;
    if (!libre(x | 0, y | 0, r)) continue;
    places.push([x | 0, y | 0, r]);
    if (mousse) { creerMousse(x | 0, y | 0); nMousse++; }
    else {
      const rr = regionDe(x, y), choix = OBJETS.filter(o => o.r <= rr), meme = choix.filter(o => o.r === rr);
      const liste = meme.length && Math.random() < 0.7 ? meme : choix;
      creerObjet(x | 0, y | 0, liste[(Math.random() * liste.length) | 0]); nObj++;
    }
  }
  // Points de vie : selon la matière et la zone ; la matière autour d'un objet est plus tendre (pour le dégager)
  for (let i = 0; i < N; i++) {
    type[i] = base[i];
    pv[i] = PVBASE[type[i]] * MULT[reg[i]];
    if (zoneC[i] >= 0 && cassable(type[i])) pv[i] = Math.min(pv[i], 0.5 * MULT[reg[i]]);
  }
  for (const z of zones) { z.faits = 0; z.total = 0; z.membres = []; }
  for (let i = 0; i < N; i++) {
    const id = zoneM[i] >= 0 ? zoneM[i] : zoneC[i];
    if (id >= 0 && cassable(type[i])) { zones[id].total++; zones[id].membres.push(i); }
  }
  placerCapsules();
}
// Capsules cachées dans la roche (3 × 3 pixels) : « carte » (choix de cartes rares) ou « recharge » (lampe).
// On les voit à travers la roche (contour qui brille) ; casser un de leurs pixels les libère.
const capsuleDe = new Int16Array(N), capsules = [];
function placerCapsules() {
  capsuleDe.fill(-1); capsules.length = 0;
  const nCartes = Math.round(14 * (1 + 0.3 * nivA("flair"))), nRecharges = 16;
  for (let essai = 0; essai < 4000 && capsules.length < nCartes + nRecharges; essai++) {
    const x = 10 + ((Math.random() * (W - 20)) | 0), y = 10 + ((Math.random() * (FAL_HAUT - 30)) | 0);
    if (Math.hypot(x - EX, y - FAL_HAUT) < 55) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const i = (y + dy) * W + x + dx; if (!cassable(type[i]) || zoneC[i] >= 0 || zoneM[i] >= 0 || capsuleDe[i] >= 0) { ok = false; break; } }
    if (!ok) continue;
    const id = capsules.length;
    capsules.push({ x: x + 0.5, y: y + 0.5, sorte: capsules.length < nCartes ? "capsule" : "recharge", libre: false });
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) capsuleDe[(y + dy) * W + x + dx] = id;
  }
}
function libererCapsule(id) {
  const c = capsules[id]; if (c.libre) return;
  c.libre = true;
  const fx = Math.floor(c.x), fy = Math.floor(c.y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) capsuleDe[(fy + dy) * W + fx + dx] = -1;
  butins.push({ x: c.x, y: c.y, vx: 0, vy: 0, k: c.sorte, t: 0, n: 1 });
  const col = BUTINS[c.sorte].c;
  eclairs.push([c.x, c.y, 0, 1.2, col[0] / 255, col[1] / 255, col[2] / 255]);
  anneaux.push({ x: c.x, y: c.y, t: 0, vite: true, petit: true, c: col });
  eclats(c.x, c.y, col, 16, 60);
  accord(c.sorte === "capsule" ? 4 : 2); vib(40, 20); secousse = Math.max(secousse, 0.2);
  texte(c.x, c.y - 8, c.sorte === "capsule" ? "Capsule !" : "Recharge !", "rgb(" + col.join(",") + ")");
}
function arbre(cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (!dans(x, y) || y < FAL_BAS || base[y * W + x] === BORD) continue;
    const d = Math.hypot(x - cx, y - cy) + (hache(x, y, 23) - 0.5) * 1.6;
    if (d > r) continue;
    const i = y * W + x;
    base[i] = ARBRE;
    // Feuillage : plus clair en haut à gauche (lumière du soleil), touffes
    const k = 1.15 - 0.35 * ((x - cx + y - cy) / (2 * r) + 0.5) + (hache(x >> 1, y >> 1, 24) < 0.2 ? 0.15 : 0);
    const c = r < 5.5 ? [70, 128, 60] : [52, 112, 58];
    coul[i * 3] = Math.min(255, c[0] * k); coul[i * 3 + 1] = Math.min(255, c[1] * k); coul[i * 3 + 2] = Math.min(255, c[2] * k);
  }
}
function creerMousse(cx, cy) {
  const id = zones.length, z = { sorte: "mousse", nom: "Mousse", cx, cy, fait: false, touche: 0, brille: 0, bord: [] };
  const rx = 9 + Math.random() * 6, ry = 6 + Math.random() * 5;
  for (let y = cy - 16; y <= cy + 16; y++) for (let x = cx - 18; x <= cx + 18; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (hache(x >> 1, y >> 1, 5) - 0.5) * 0.5;
    if (d < 1) {
      const i = y * W + x;
      base[i] = MOUSSE; zoneM[i] = id;
      const k = 0.85 + 0.3 * hache(x >> 1, y >> 1, 25);
      coul[i * 3] = 104 * k; coul[i * 3 + 1] = 150 * k; coul[i * 3 + 2] = 74 * k;
    }
  }
  for (let y = cy - 16; y <= cy + 16; y++) for (let x = cx - 18; x <= cx + 18; x++) {
    const i = y * W + x;
    if (zoneM[i] === id && (zoneM[i - 1] !== id || zoneM[i + 1] !== id || zoneM[i - W] !== id || zoneM[i + W] !== id) && (x + y) % 3 === 0) z.bord.push([x, y]);
  }
  zones.push(z);
}
function creerObjet(cx, cy, modele) {
  const id = zones.length, z = { sorte: "objet", nom: modele.nom, modele, cx, cy, fait: false, touche: 0, brille: 0, pixels: [], degats: 0, stade: 0, flash: 0, bord: [] };
  const d = modele.dessin, ox = cx - Math.floor(d[0].length * 3 / 2), oy = cy - Math.floor(d.length * 3 / 2);
  d.forEach((ligne, j) => [...ligne].forEach((ch, k) => {
    if (ch === ".") return;
    const c = modele.pal[ch];
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const i = (oy + j * 3 + b) * W + ox + k * 3 + a;
      base[i] = OBJET; zoneO[i] = id; z.pixels.push(i);
      const kk = (b === 0 || a === 0) ? 1.08 : (b === 2 || a === 2) ? 0.9 : 1; // petit relief dans chaque « case »
      coul[i * 3] = Math.min(255, c[0] * kk); coul[i * 3 + 1] = Math.min(255, c[1] * kk); coul[i * 3 + 2] = Math.min(255, c[2] * kk);
    }
  }));
  // Matière qui le couvre : tout ce qui est à moins de 3 pixels
  for (const i of z.pixels) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const v = i + dy * W + dx;
    if (base[v] !== OBJET && base[v] !== BORD && zoneC[v] < 0 && zoneM[v] < 0) { zoneC[v] = id; if (base[v] === VIDE) base[v] = TERRE; }
  }
  zones.push(z);
}

// ---------- 4. Réglages gardés sur cet appareil ----------
const lire = (cle, def) => { try { const v = localStorage.getItem(cle); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) {} };
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
// zoom = taille d'un pixel du monde (px) ; jetLarge = largeur du rayon (pixels du monde, le mineur fait 8 de large) ;
// jetVite = force du rayon (1 à 10) ; portee = distance max de la pioche et du pinceau autour de la main
const REG = Object.assign({ son: true, vibration: "fort", effets: reduit ? "simples" : "complets", zoom: 2.4, jetLarge: 11, jetVite: 4, portee: 16 }, lire("tunnel2-reglages", {}));
P = REG.zoom;
const sauverReglages = () => ecrire("tunnel2-reglages", REG);
const FX = () => REG.effets === "simples" ? 0.35 : 1; // force des secousses / quantité d'éclats
let outil = lire("tunnel2-outil", "jet");
// Sac et collection (gardés d'une mine à l'autre)
const sac = Object.assign({ comptes: {}, tresor: 0 }, lire("tunnel2-sac", {}));
if (sac.comptes.bombe === undefined) sac.comptes.bombe = 3; // 3 bombes pour commencer
const collection = lire("tunnel2-collection", {}); // { nom: { n, meilleure } }
const sauverSac = () => ecrire("tunnel2-sac", sac);
let sacASauver = false; // les miettes arrivent par centaines : on enregistre le sac au plus une fois par seconde
setInterval(() => { if (sacASauver) { sacASauver = false; sauverSac(); } }, 1000);
addEventListener("pagehide", () => { if (sacASauver) sauverSac(); });

// ---------- 4b. Progression (façon Survivors) ----------
// Une EXPÉDITION : on part avec une petite pioche ; les blocs ramassés donnent de l'XP ;
// à chaque niveau on choisit 1 carte sur 3. Quand la lampe s'éteint, le butin devient des PIÈCES
// (gardées) qu'on dépense à l'ATELIER pour des améliorations permanentes.
const ATELIER_DEF = [
  { id: "pioche",  nom: "Pioche de départ", txt: "dégâts +15 %",          max: 5, prix: 150,  k: 1.7 },
  { id: "lampe",   nom: "Lampe",            txt: "+45 s d'expédition",    max: 5, prix: 120,  k: 1.7 },
  { id: "aimant",  nom: "Aimant",           txt: "portée +10 %",          max: 5, prix: 100,  k: 1.7 },
  { id: "sac",     nom: "Sac",              txt: "blocs +10 % de valeur", max: 5, prix: 180,  k: 1.7 },
  { id: "flair",   nom: "Flair",            txt: "plus de capsules",      max: 3, prix: 300,  k: 1.8 },
  { id: "relance", nom: "Relance",          txt: "+1 relance des cartes", max: 3, prix: 400,  k: 2 },
  { id: "outil",   nom: "Départ outillé",   txt: "commence avec le jet",  max: 1, prix: 1500, k: 1 }
];
const atelier = lire("tunnel2-atelier", {});
const nivA = id => atelier[id] || 0;
const prixA = d => Math.round(d.prix * Math.pow(d.k, nivA(d.id)) / 10) * 10;
let pieces = lire("tunnel2-pieces", 0), record = lire("tunnel2-record", 0);
const sauverProgres = () => { ecrire("tunnel2-atelier", atelier); ecrire("tunnel2-pieces", pieces); ecrire("tunnel2-record", record); };

// Les cartes. r = rareté (0 commun, 1 rare, 2 épique) ; max = niveaux ; si = condition pour apparaître.
const CARTES = [
  { id: "force",      nom: "Pioche plus forte",  ic: "pioche",  r: 0, max: 6, d: "Dégâts de la pioche +40 %" },
  { id: "large",      nom: "Pioche plus large",  ic: "pioche",  r: 0, max: 5, d: "Coup de pioche plus large" },
  { id: "vite",       nom: "Coups plus rapides", ic: "pioche",  r: 0, max: 5, d: "Pioche 15 % plus rapide" },
  { id: "aimant",     nom: "Aimant",             ic: "aimant",  r: 0, max: 5, d: "Attire les blocs de plus loin" },
  { id: "marche",     nom: "Bottes",             ic: "bottes",  r: 0, max: 4, d: "Marche 12 % plus vite" },
  { id: "halo",       nom: "Grande lampe",       ic: "lampe",   r: 0, max: 4, d: "Halo de lumière plus grand" },
  { id: "portee",     nom: "Bras long",          ic: "pinceau", r: 0, max: 4, d: "Portée des outils +4" },
  { id: "jet",        nom: "Jet d'énergie",      ic: "jet",     r: 1, max: 5, d: n => n === 1 ? "Débloque le jet (fin et lent)" : "Jet plus large et plus fort" },
  { id: "pinceau",    nom: "Pinceau",            ic: "pinceau", r: 1, max: 1, d: "Déterre les objets sans les abîmer" },
  { id: "bombe",      nom: "Bombes",             ic: "bombe",   r: 1, max: 4, d: n => n === 1 ? "Débloque les bombes (+3)" : "+1 bombe toute seule toutes les " + Math.round(60 / (n - 1)) + " s" },
  { id: "foreuse",    nom: "Foreuse",            ic: "foreuse", r: 1, max: 4, d: "Creuse toute seule devant toi quand tu marches dans un mur" },
  { id: "etincelles", nom: "Étincelles",         ic: "etoile",  r: 1, max: 4, d: "Tir automatique vers le minerai proche" },
  { id: "doubles",    nom: "Blocs doubles",      ic: "sac",     r: 1, max: 3, d: "25 % des blocs tombent en double" },
  { id: "genereux",   nom: "Minerai généreux",   ic: "etoile",  r: 1, max: 3, d: "Plus de gemmes dans le minerai" },
  { id: "econome",    nom: "Lampe économe",      ic: "lampe",   r: 1, max: 3, d: "La lampe s'use 15 % moins vite" },
  { id: "scies",      nom: "Scies orbitales",    ic: "scie",    r: 2, max: 4, d: n => (n + 1) + " scies tournent autour de toi et grattent les murs" },
  { id: "drone",      nom: "Drone foreur",       ic: "drone",   r: 2, max: 3, d: n => n === 1 ? "Un drone creuse le mur le plus proche" : "Un drone de plus" },
  { id: "boum",       nom: "Mini-boum",          ic: "bombe",   r: 2, max: 3, d: "Des pixels cassés explosent parfois" },
  { id: "ricochet",   nom: "Jet qui ricoche",    ic: "jet",     r: 2, max: 2, si: () => run.c.jet, d: "Le jet rebondit sur les murs" },
  { id: "chaine",     nom: "Bombes en chaîne",   ic: "bombe",   r: 2, max: 2, si: () => run.c.bombe, d: "Chaque bombe lâche des petites bombes" }
];
const RARETES = ["Commun", "Rare", "Épique"], POIDS = [62, 30, 8];
const run = { niv: 1, xp: 0, c: {}, relances: 0, energie: 1, fini: false, enMine: false, blocs: 0, gemmes: 0, trouv: 0, nouv: 0, zoneMax: 0, aChoisir: 0, capsules: 0, bombeT: 0 };
const besoin = n => Math.round(30 * Math.pow(1.28, n - 1)); // XP pour passer du niveau n au suivant
// Les stats de l'expédition, recalculées à chaque carte
const S = {};
function calcStats() {
  const c = run.c, k = id => c[id] || 0;
  S.piocheR = 2.6 + 0.8 * k("large");
  S.piocheD = 1.5 * Math.pow(1.4, k("force")) * (1 + 0.15 * nivA("pioche"));
  S.piocheT = 0.5 * Math.pow(0.85, k("vite"));
  S.aimant = 14 * (1 + 0.3 * k("aimant")) * (1 + 0.1 * nivA("aimant")) + (compagnonActif ? [0, 4, 8][stadeCompagnon(compagnonActif)] : 0);
  S.marche = 42 * (1 + 0.12 * k("marche"));
  S.halo = 1 + 0.15 * k("halo");
  S.portee = REG.portee + 4 * k("portee");
  S.jetL = c.jet ? 3 + 2 * (c.jet - 1) : 0; // largeur du rayon : 3, 5, 7, 9, 11
  S.jetV = c.jet ? 2 + c.jet : 0;           // force du rayon
  S.duree = 540 + 45 * nivA("lampe");        // secondes de lampe
  S.usure = 1 - 0.15 * k("econome");
  boutonsOutils.forEach(b => b.hidden = !(b.dataset.outil === "pioche" || c[b.dataset.outil]));
}

// ---------- 5. Le mineur ----------
// Mineur : 10 × 15 pixels (13 lignes de corps + 2 de jambes, qui alternent en marchant)
const SPRITE = ["..KKKK....", ".KHYYYKKK.", "KHYYYYKLLK", "KyyyyyyyyK", "KNSSSSSSSK", "KNSWESWESK", "KsSEESEESK", ".KsPSSPsK.", "..KRRRRK..", ".KSBGGBSK.", ".KsBBBBsK.", "..KBBBBK..", "..KbKKbK.."];
const JAMBES = [["..KDKKDK..", "..KK..KK.."], [".KDK..KDK.", ".KK....KK."]];
const PAL = { K: [29, 23, 38], H: [255, 224, 138], Y: [242, 178, 50], y: [194, 127, 26], L: [255, 246, 200], N: [107, 70, 48], S: [246, 207, 164], s: [214, 160, 115], W: [255, 255, 255], E: [38, 48, 79], P: [242, 154, 134], R: [217, 86, 60], B: [79, 134, 204], b: [51, 95, 158], G: [255, 213, 106], D: [90, 61, 46] };
const m = { x: DEPART.x, y: DEPART.y, vx: 0, vy: 0, px: 0, py: 0, sens: 1, pas: 0, recul: [0, 0] };
// Collision : seulement les pieds (vue de dessus)
// Un mur a une « face avant » dessinée sous lui (FH pixels de haut) : c'est aussi du mur.
// Donc les pieds sont bloqués s'ils touchent un mur OU la face d'un mur situé juste au-dessus
// (avant, le mineur grimpait sur cette face en montant).
function touche(x, y) {
  const haut = Math.floor(y - 3);
  for (let cx = Math.floor(x - 3); cx <= Math.floor(x + 2.99); cx++) {
    for (let cy = haut; cy <= Math.floor(y - 0.01); cy++) if (solide(cx, cy)) return true;
    for (let k = 1; k <= FHMAX; k++) { const t = typeEn(cx, haut - k); if (t !== VIDE) { if (k <= FH[t]) return true; break; } }
  }
  return false;
}
function bouger(dx, dy) {
  const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.5) || 1;
  for (let k = 0; k < n; k++) {
    if (dx) { m.x += dx / n; if (touche(m.x, m.y)) { m.x -= dx / n; dx = 0; } }
    if (dy) { m.y += dy / n; if (touche(m.x, m.y)) { m.y -= dy / n; dy = 0; } }
  }
}
const mainX = () => m.x + m.sens * 3, mainY = () => m.y - 7; // la main (buse du jet, manche des outils)

// ---------- 6. Effets ----------
const particules = [], anneaux = [], textes = [], butins = [], bombes = [], envols = [];
let secousse = 0, tremble = 0, flashBoum = null;
function particule(x, y, vx, vy, c, vie, brille, lent) {
  if (particules.length < 900) particules.push({ x, y, vx, vy, c, vie, vie0: vie, brille, lent });
}
function eclats(x, y, c, n, v) {
  n = Math.round(n * FX());
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = v * (0.4 + Math.random());
    particule(x, y, Math.cos(a) * s, Math.sin(a) * s, k % 3 === 2 ? [255, 220, 120] : c, 0.35 + Math.random() * 0.4, k % 3 === 2);
  }
}
function texte(x, y, txt, c, gros) { textes.push({ x, y, txt, c: c || "#ffd56a", t: 0, gros }); }

// ---------- 7. Casser la matière ----------
let eclatsImage = 0, cassesXP = 0;
function abimer(x, y, q) {
  if (!dans(x, y)) return false;
  const i = y * W + x;
  if (!cassable(type[i])) return false;
  pv[i] -= q;
  const id = zoneM[i] >= 0 ? zoneM[i] : zoneC[i];
  if (id >= 0) zones[id].touche = 2.5;
  if (pv[i] <= 0) { casser(i, true); return true; }
  return false;
}
function casser(i, avecEclat) {
  const t = type[i], x = i % W, y = (i / W) | 0;
  type[i] = VIDE;
  if (zoneM[i] >= 0) compter(zoneM[i]);
  if (zoneC[i] >= 0) compter(zoneC[i]);
  // Butin caché dans la matière : minerai surtout ; parfois une bombe dans la roche
  miette(x, y, t, i);
  const r = Math.random();
  if (capsuleDe[i] >= 0) libererCapsule(capsuleDe[i]);
  if (run.c.boum && boums.length < 3 && Math.random() < 0.0035 * run.c.boum) boums.push([x + 0.5, y + 0.5]);
  if (t === MINERAI && r < 0.07 * (1 + 0.6 * (run.c.genereux || 0))) { lacherButin(x + 0.5, y + 0.5, REGIONS[reg[i]].butin); jaillir(x + 0.5, y + 0.5, REGIONS[reg[i]].butin); }
  else if (run.c.bombe && t === DURE && r < 0.0025) lacherButin(x + 0.5, y + 0.5, "bombe");
  else if (run.c.bombe && t === ROCHE && r < 0.0007) lacherButin(x + 0.5, y + 0.5, "bombe");
  else if ((t === ROCHE || t === DURE) && r < 0.004) lacherButin(x + 0.5, y + 0.5, "caillou");
  if (avecEclat && eclatsImage < 40 && Math.random() < 0.35 * FX()) {
    eclatsImage++;
    const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 50;
    particule(x + 0.5, y + 0.5, Math.cos(a) * v, Math.sin(a) * v, [coul[i * 3], coul[i * 3 + 1], coul[i * 3 + 2]], 0.4 + Math.random() * 0.3, false);
    if (Math.random() < 0.6) particule(x + 0.5, y + 0.5, Math.cos(a + 1) * v * 1.4, Math.sin(a + 1) * v * 1.4, [255, 200, 90], 0.3 + Math.random() * 0.3, true);
  }
  // Le compagnon gagne 1 XP tous les 30 pixels cassés
  if (++cassesXP >= 30) { cassesXP = 0; xpCompagnon(); }
}
// Comme dans Power Wash : à 95 %, la zone est finie et le reste part tout seul
const SEUIL = 0.95;
function compter(id) { const z = zones[id]; if (z.fait) return; z.faits++; if (z.faits >= z.total * SEUIL) terminer(z); }

// ---------- 8. Les outils ----------
let doigt = null, tir = null;   // tir = ce que fait l'outil à cette image (dessin, son, lumière)
const pioche = { t: 9, anim: 0, angle: 0 };
let vibreTemps = 0, brosseTemps = 0;
function pointDoigt() { return [camX + doigt.sx / P, camY + doigt.sy / P]; }
// Pinceau / pioche : visée « démultipliée » autour du mineur. Le doigt peut être n'importe où :
// sa direction donne le côté, et sa distance au mineur (jusqu'à 130 px d'écran) règle la distance de l'outil
// (de la main jusqu'à la portée choisie). Un grand geste du doigt = un petit geste précis de l'outil.
const VISEE_ECRAN = 130;
function aPortee(wx, wy) {
  const hx = mainX(), hy = mainY(), d = Math.hypot(wx - hx, wy - hy);
  if (d < 0.01) return [hx, hy, false];
  const r = S.portee * Math.min(1, d * P / VISEE_ECRAN);
  return [hx + (wx - hx) * r / d, hy + (wy - hy) * r / d, d * P > VISEE_ECRAN];
}
function rayon(ox, oy, a, longueur) {
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let d = 0; d < longueur; d += 0.5) {
    const x = ox + dx * d, y = oy + dy * d;
    if (solide(Math.floor(x), Math.floor(y))) return [x, y, d, typeEn(Math.floor(x), Math.floor(y)), Math.floor(y) * W + Math.floor(x)];
  }
  return [ox + dx * longueur, oy + dy * longueur, longueur, VIDE, -1];
}
function disque(x, y, r, q) {
  let n = 0;
  for (let py = Math.floor(y - r); py <= y + r; py++) for (let px = Math.floor(x - r); px <= x + r; px++) {
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
    if (d <= r && abimer(px, py, q * (1 - 0.6 * d / r))) n++;
  }
  return n;
}
// Un objet touché par un outil brutal s'abîme : 3 étapes de fissures, puis il casse
function abimerObjet(z, q) {
  if (z.fait) return;
  z.degats += q; z.flash = 0.25; z.touche = 2.5;
  const stade = z.degats >= 3 ? 3 : z.degats >= 2 ? 2 : z.degats >= 1 ? 1 : 0;
  if (stade > z.stade) {
    z.stade = stade;
    if (stade === 3) { briser(z); return; }
    sonFissure(); vib([40, 30, 40], [20]);
    texte(z.cx, z.cy - 14, stade === 1 ? "Fêlé !" : "Fragile !", "#ff9a7a");
    eclats(z.cx, z.cy, [coul[z.pixels[0] * 3], coul[z.pixels[0] * 3 + 1], coul[z.pixels[0] * 3 + 2]], 8, 30);
  }
}
function utiliserOutil(dt, temps) {
  tir = null;
  if (!doigt || outil === "bombe") return;
  const [wx, wy] = pointDoigt();
  if (outil === "jet") {
    const ox = mainX(), oy = mainY(), a = Math.atan2(wy - oy, wx - ox);
    m.sens = Math.cos(a) >= 0 ? 1 : -1;
    // Un gros rayon : des rayons côte à côte (1 pixel d'écart) sur toute la largeur réglée.
    // Chacun ronge le mur là où il le touche : le front avance d'un bloc, ce qui creuse un couloir où le mineur passe.
    tir = { sorte: "jet", traits: [], impact: null, mat: VIDE, large: S.jetL };
    const touches = new Set(), demi = (S.jetL - 1) / 2, q = 0.3 * S.jetV * dt;
    for (let dec = -demi; dec <= demi + 0.01; dec++) {
      const px = ox - Math.sin(a) * dec, py = oy + Math.cos(a) * dec;
      const [hx, hy, , t, i] = rayon(px, py, a, 80);
      if (t === OBJET) touches.add(zoneO[i]);
      else if (t !== VIDE) disque(hx, hy, 1.6, q);
      const centre = Math.abs(dec) < 0.6;
      tir.traits.push([px, py, hx, hy, Math.abs(dec) <= demi - 1.5 || centre, centre]);
      if (centre) { tir.impact = t !== VIDE ? [hx, hy] : null; tir.mat = t; if (t !== VIDE && t !== OBJET && run.c.ricochet) ricocher(hx, hy, a, q, touches); }
    }
    for (const id of touches) if (id >= 0) abimerObjet(zones[id], dt);
    m.recul = Math.random() < 0.5 ? [-Math.round(Math.cos(a)), -Math.round(Math.sin(a))] : [0, 0];
    if (tir.impact && Math.random() < 0.8 * FX()) {
      const [ix, iy] = tir.impact, b = a + Math.PI + (Math.random() - 0.5) * 2.2, v = 30 + Math.random() * 60;
      particule(ix, iy, Math.cos(b) * v, Math.sin(b) * v, [255, 220, 120], 0.25 + Math.random() * 0.25, true);
    }
    vibreTemps -= dt;
    if (vibreTemps <= 0 && tir.mat !== VIDE) { vibreTemps = 0.11; vib(tir.mat === ROCHE || tir.mat === DURE ? 22 : 12, 6); }
    return;
  }
  const [tx, ty, loin] = aPortee(wx, wy);
  m.sens = tx >= m.x ? 1 : -1;
  if (outil === "pinceau") {
    // Frotte doucement sous le doigt (petit va-et-vient) ; n'abîme jamais les objets
    const bx = tx + Math.sin(temps * 38) * 0.8, by = ty + Math.cos(temps * 31) * 0.5;
    const n = disque(bx, by, 2.4, 2.2 * dt);
    tir = { sorte: "pinceau", x: bx, y: by, loin, n, mat: typeEn(Math.floor(tx), Math.floor(ty)) };
    if (n && Math.random() < 0.7 * FX()) {
      const a = Math.random() * Math.PI * 2;
      particule(bx, by, Math.cos(a) * 14, Math.sin(a) * 14, [200, 180, 150], 0.5 + Math.random() * 0.4, false, true);
    }
    brosseTemps -= dt;
    if (brosseTemps <= 0 && tir.mat !== VIDE) { brosseTemps = 0.09; vib(6, 3); }
    return;
  }
  if (outil === "pioche") {
    tir = { sorte: "pioche", x: tx, y: ty, loin };
    pioche.angle = Math.atan2(ty - mainY(), tx - mainX());
    pioche.t += dt;
    if (pioche.t >= S.piocheT) { pioche.t = 0; coupPioche(tx, ty); }
  }
}
function coupPioche(x, y) {
  pioche.anim = 1;
  const t = typeEn(Math.floor(x), Math.floor(y));
  const n = disque(x, y, S.piocheR, S.piocheD);
  // Objet dans le coup ?
  for (const z of zones) if (z.sorte === "objet" && !z.fait && Math.hypot(z.cx - x, z.cy - y) < 14) {
    if (z.pixels.some(i => Math.hypot(i % W + 0.5 - x, ((i / W) | 0) + 0.5 - y) < S.piocheR)) abimerObjet(z, 0.9);
  }
  if (t === VIDE && !n) return;
  const c = dans(Math.floor(x), Math.floor(y)) ? [coul[(Math.floor(y) * W + Math.floor(x)) * 3], coul[(Math.floor(y) * W + Math.floor(x)) * 3 + 1], coul[(Math.floor(y) * W + Math.floor(x)) * 3 + 2]] : [150, 140, 130];
  eclats(x, y, c, 12, 60);
  secousse = Math.max(secousse, 0.14);
  sonPioche(t); vib(30, 14);
}

// ---------- 8b. Effets et aides automatiques (gagnés avec les cartes) ----------
// Jet qui ricoche : au point d'impact, on devine la pente du mur (pixels pleins autour) et le rayon repart en miroir
function ricocher(x, y, a, q, touches) {
  const fx = Math.floor(x), fy = Math.floor(y);
  let nx = 0, ny = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (solide(fx + dx, fy + dy)) { nx -= dx; ny -= dy; }
  const l = Math.hypot(nx, ny); if (!l) return;
  nx /= l; ny /= l;
  let dx = Math.cos(a), dy = Math.sin(a);
  const p = dx * nx + dy * ny; dx -= 2 * p * nx; dy -= 2 * p * ny;
  const b = Math.atan2(dy, dx), demi = run.c.ricochet; // 3 ou 5 rayons de large
  const ox = x + nx * 2, oy = y + ny * 2;
  for (let dec = -demi; dec <= demi; dec++) {
    const px = ox - Math.sin(b) * dec, py = oy + Math.cos(b) * dec;
    const [hx, hy, , t, i] = rayon(px, py, b, 45);
    if (t === OBJET) touches.add(zoneO[i]); else if (t !== VIDE) disque(hx, hy, 1.6, q * 0.8);
    tir.traits.push([px, py, hx, hy, dec === 0, false]);
  }
}
// Foreuse : quand on pousse le joystick contre un mur, le mineur creuse tout seul devant lui
function foreuse(dt) {
  const n = run.c.foreuse; if (!n || Math.hypot(joy.x, joy.y) < 0.35) return;
  const l = Math.hypot(joy.x, joy.y), jx = joy.x / l, jy = joy.y / l;
  const x = m.x + jx * 6, y = m.y - 2 + jy * (jy < 0 ? 9 : 4);
  if (disque(x, y, 3 + 0.5 * n, (1 + 0.7 * n) * dt * 2) && Math.random() < 0.4 * FX()) particule(x, y, -jx * 30 + (Math.random() - 0.5) * 30, -jy * 30, [200, 190, 170], 0.3, false);
}
// Scies : tournent autour du mineur et grattent les murs qu'elles touchent (jamais les objets)
const scies = { a: 0 };
function majScies(dt) {
  const n = run.c.scies; if (!n) return;
  scies.a += dt * 3.2;
  for (let k = 0; k <= n; k++) {
    const a = scies.a + k * Math.PI * 2 / (n + 1), x = m.x + Math.cos(a) * 14, y = m.y - 6 + Math.sin(a) * 11;
    if (disque(x, y, 2.2, (2.5 + 0.8 * n) * dt) && Math.random() < 0.3 * FX()) particule(x, y, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, [255, 220, 140], 0.2, true);
  }
}
// Drones : chacun cherche le mur le plus proche du mineur, y vole et le creuse
const drones = [];
function chercherMur(x0, y0, rMax, filtre) {
  for (let r = 3; r <= rMax; r += 2) for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8 + r, x = Math.floor(x0 + Math.cos(a) * r), y = Math.floor(y0 + Math.sin(a) * r);
    if (dans(x, y) && (filtre ? filtre(type[y * W + x]) : cassable(type[y * W + x]))) return [x + 0.5, y + 0.5];
  }
  return null;
}
function majDrones(dt) {
  const n = run.c.drone || 0;
  while (drones.length < n) drones.push({ x: m.x, y: m.y - 14, cible: null, t: 0 });
  for (const d of drones) {
    d.t -= dt;
    if (!d.cible || !cassable(typeEn(Math.floor(d.cible[0]), Math.floor(d.cible[1]))) || Math.hypot(d.cible[0] - m.x, d.cible[1] - m.y) > 60) {
      if (d.t <= 0) { d.t = 0.4; d.cible = chercherMur(m.x + (Math.random() - 0.5) * 10, m.y - 8, 45); }
    }
    const tx = d.cible ? d.cible[0] : m.x - 10, ty = d.cible ? d.cible[1] : m.y - 18, dx = tx - d.x, dy = ty - d.y, l = Math.hypot(dx, dy);
    if (l > 3) { const v = Math.min(l, 70 * dt); d.x += dx / l * v; d.y += dy / l * v; }
    else if (d.cible) { disque(d.cible[0], d.cible[1], 2.5, 3.2 * dt); if (Math.random() < 0.4 * FX()) particule(d.x, d.y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, [140, 220, 255], 0.2, true); }
  }
}
// Étincelles : un petit tir part tout seul vers le minerai le plus proche et l'éclate
const tirs = [];
let etincelleT = 0;
function majEtincelles(dt) {
  const n = run.c.etincelles;
  if (n) {
    etincelleT -= dt;
    if (etincelleT <= 0) {
      etincelleT = 2.6 - 0.45 * n;
      const c = chercherMur(m.x, m.y - 8, 70, t => t === MINERAI);
      if (c) { const dx = c[0] - mainX(), dy = c[1] - mainY(), l = Math.hypot(dx, dy) || 1; tirs.push({ x: mainX(), y: mainY(), vx: dx / l * 150, vy: dy / l * 150, n }); note(1800, "triangle", 0.04, 0.08); }
    }
  }
  for (let k = tirs.length - 1; k >= 0; k--) {
    const s = tirs[k];
    s.x += s.vx * dt; s.y += s.vy * dt;
    particule(s.x, s.y, -s.vx * 0.1, -s.vy * 0.1, [255, 240, 160], 0.18, true);
    if (solide(Math.floor(s.x), Math.floor(s.y)) || !dans(Math.floor(s.x), Math.floor(s.y))) {
      tirs.splice(k, 1); disque(s.x, s.y, 3 + s.n, 6); eclats(s.x, s.y, [255, 230, 140], 10, 50); bruitCourt(3000, 2, 0.2, 0.08);
    }
  }
}
// Mini-boum : un pixel cassé peut exploser (petit cratère). On les fait à l'image suivante (pas de réaction sans fin).
const boums = [];
function majBoums() {
  const liste = boums.splice(0, 3); boums.length = 0;
  for (const [x, y] of liste) {
    disque(x, y, 4.5, 5); eclats(x, y, [255, 180, 90], 12, 60);
    eclairs.push([x, y, 0, 0.7, 1, 0.65, 0.35]);
    bruitCourt(900, 1, 0.3, 0.2); secousse = Math.max(secousse, 0.12);
  }
}

// ---------- 9. Bombes ----------
let dernierLancer = 0;
function lancerBombe(wx, wy, temps) {
  if (temps - dernierLancer < 0.35) return;
  if ((sac.comptes.bombe || 0) <= 0) { montrerBandeau("Plus de bombes", true); return; }
  dernierLancer = temps;
  sac.comptes.bombe--; sauverSac(); majBombes();
  const ox = mainX(), oy = mainY() + 4, d = Math.hypot(wx - ox, wy - oy), k = d > 72 ? 72 / d : 1;
  const tx = ox + (wx - ox) * k, ty = oy + (wy - oy) * k, duree = 0.5;
  m.sens = tx >= m.x ? 1 : -1;
  bombes.push({ x: ox, y: oy, vx: (tx - ox) / duree, vy: (ty - oy) / duree, t: 0, duree, z: 8, meche: 1.5, posee: false });
  sonLancer(); vib(10, 5);
}
function majBombesVol(dt) {
  for (let k = bombes.length - 1; k >= 0; k--) {
    const b = bombes[k];
    b.t += dt;
    if (!b.posee) {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      // Contre un mur, elle s'y colle (pour creuser la paroi)
      if (solide(Math.floor(nx), Math.floor(b.y)) || solide(Math.floor(b.x), Math.floor(ny))) { b.vx = b.vy = 0; b.t = Math.max(b.t, b.duree * 0.8); }
      else { b.x = nx; b.y = ny; }
      const f = Math.min(1, b.t / b.duree);
      b.z = Math.sin(Math.PI * f) * 18 + (1 - f) * 8;
      if (f >= 1) { b.posee = true; b.vx *= 0.25; b.vy *= 0.25; b.z = 0; sonPose(); }
    } else {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt; // petit roulé
      if (!solide(Math.floor(nx), Math.floor(ny))) { b.x = nx; b.y = ny; }
      b.vx *= 1 - dt * 6; b.vy *= 1 - dt * 6;
      b.meche -= dt;
      if (Math.random() < 0.5) particule(b.x + 1, b.y - 4, (Math.random() - 0.5) * 20, -10 - Math.random() * 15, [255, 200, 90], 0.25, true);
      if (b.meche <= 0) { bombes.splice(k, 1); exploser(b.x, b.y, b.petite); }
    }
  }
}
function exploser(x, y, petite) {
  const R = petite ? 8 : 15;
  // Bombes en chaîne : la grosse lâche des petites bombes autour d'elle
  if (!petite && run.c.chaine) for (let j = 0; j < 2 + run.c.chaine; j++) {
    const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 10;
    bombes.push({ x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, vx: Math.cos(a) * d * 3, vy: Math.sin(a) * d * 3, t: 0, duree: 0.3, z: 4, meche: 0.35 + Math.random() * 0.4, posee: false, petite: true });
  }
  let casses = 0;
  for (let py = Math.floor(y - R - 3); py <= y + R + 3; py++) for (let px = Math.floor(x - R - 3); px <= x + R + 3; px++) {
    if (!dans(px, py)) continue;
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y) + (hache(px, py, 30) - 0.5) * 4;
    const i = py * W + px;
    if (d < R && cassable(type[i])) {
      pv[i] -= 7 * (1.25 - d / R);
      if (pv[i] <= 0) { casser(i, false); casses++; if (Math.random() < 0.07 * FX()) { const a = Math.atan2(py - y, px - x), v = 60 + Math.random() * 120; particule(px, py, Math.cos(a) * v, Math.sin(a) * v, [coul[i * 3], coul[i * 3 + 1], coul[i * 3 + 2]], 0.5 + Math.random() * 0.5, false); } }
    }
    // Sol roussi autour du trou
    if (d < R + 3 && type[i] === VIDE && Math.random() < 0.8) { const k = 0.55 + 0.3 * d / (R + 3); sol[i * 3] *= k; sol[i * 3 + 1] *= k; sol[i * 3 + 2] *= k; }
  }
  // Objets dans le souffle : ils s'abîment
  for (const z of zones) if (z.sorte === "objet" && !z.fait) {
    const d = Math.hypot(z.cx - x, z.cy - y);
    if (d < R + 12) abimerObjet(z, (petite ? 1 : 2.6) * (1 - d / (R + 14)) + 0.3);
  }
  // Le mineur est soufflé (sans dégâts)
  const dm = Math.hypot(m.x - x, m.y - y);
  if (dm < 45) { const f = (petite ? 50 : 160) * (1 - dm / 45); m.px += (m.x - x) / (dm || 1) * f; m.py += (m.y - y) / (dm || 1) * f; }
  // Effets : flash, onde, gerbe d'étincelles, fumée, grosse secousse
  flashBoum = { x, y, t: 0 };
  anneaux.push({ x, y, t: 0, vite: true });
  const g = petite ? 0.35 : 1;
  for (let k = 0; k < 90 * g * FX(); k++) {
    const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 160;
    particule(x, y, Math.cos(a) * v, Math.sin(a) * v, k % 2 ? [255, 230, 140] : [255, 140, 60], 0.3 + Math.random() * 0.5, true);
  }
  for (let k = 0; k < 40 * g * FX(); k++) {
    const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 40;
    particule(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * v, Math.sin(a) * v, [70, 64, 70], 1 + Math.random() * 0.8, false, true);
  }
  secousse = Math.max(secousse, petite ? 0.25 : 0.6);
  if (petite) { bruitCourt(600, 0.8, 0.5, 0.4, 120); vib(40, 20); } else { sonBoum(); vib([80, 40, 100], [40, 30, 50]); }
  if (casses > 300) texte(x, y - 18, "Boum !", "#ffb35a", true);
}

// ---------- 10. Petit butin (sac) ----------
function lacherButin(x, y, k) {
  const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 30;
  butins.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, k, t: 0, n: 1 });
}
// Blocs de matière : environ 1 pixel cassé sur 4 fait sauter un petit cube 2×2 (vaut 1 unité),
// et de temps en temps un gros cube 4×4 (vaut 4 unités). Ils sautillent, puis l'aimant les attire.
// Au-delà de 700 par terre, on les regroupe (sinon le téléphone ralentit).
const MAX_BUTINS = 700;
function miette(x, y, t, i) {
  const k = MIETTE[t]; if (!k) return;
  const r = Math.random(), gros = r < 0.025;
  if (!gros && r > 0.25) return;
  const n = (gros ? 4 : 1) * (Math.random() < 0.25 * (run.c.doubles || 0) ? 2 : 1);
  if (butins.length >= MAX_BUTINS) {
    for (let j = butins.length - 1; j >= butins.length - 80; j--) {
      const b = butins[j];
      if (b.k === k && Math.abs(b.x - x) < 6 && Math.abs(b.y - y) < 6) { b.n += n; if (b.n >= 4) b.taille = 4; return; }
    }
    sac.comptes[k] = (sac.comptes[k] || 0) + n; sacASauver = true; // sinon : directement dans le sac
    return;
  }
  const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 45, e = 0.9 + Math.random() * 0.25;
  butins.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, k, t: 0, n, taille: gros ? 4 : 2,
    h: 0, vh: 40 + Math.random() * 40, // petit saut en l'air (hauteur h), qui rebondit
    c: [coul[i * 3] * e, coul[i * 3 + 1] * e, coul[i * 3 + 2] * e] });
}
// Rang de rareté (0 = rien de spécial) : règle la force des effets
const RANG = { pepite: 1, eclat: 2, amethyste: 3, piece: 4, rubis: 5 };
// Un trésor sort du mur : éclat de lumière, gerbe de sa couleur, accord qui monte, secousse, et petit ralenti pour les gros
const eclairs = []; // flashs de lumière brefs [x, y, t, force, r, g, b]
let ralenti = 0;
function jaillir(x, y, k) {
  const rg = RANG[k]; if (!rg) return;
  const c = BUTINS[k].c;
  eclairs.push([x, y, 0, 0.6 + rg * 0.25, c[0] / 255, c[1] / 255, c[2] / 255]);
  anneaux.push({ x, y, t: 0, vite: true, petit: true, c });
  const n = Math.round((10 + rg * 6) * FX());
  for (let j = 0; j < n; j++) {
    const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * (40 + rg * 15);
    particule(x, y, Math.cos(a) * v, Math.sin(a) * v, j % 3 === 2 ? [255, 255, 240] : c, 0.4 + Math.random() * 0.5, true);
  }
  accord(rg);
  secousse = Math.max(secousse, 0.06 + rg * 0.04);
  vib(15 + rg * 14, 8 + rg * 5);
  if (rg >= 3 && REG.effets !== "simples" && !reduit) ralenti = Math.max(ralenti, 0.12 + rg * 0.06);
  texte(x, y - 8, BUTINS[k].nom + " !", "rgb(" + c.join(",") + ")");
}
const RAYON_AIMANT = () => S.aimant; // calculé dans calcStats (cartes, Atelier, compagnon)
let serie = 0, serieTemps = 0;
function majButins(dt) {
  serieTemps -= dt; if (serieTemps <= 0) serie = 0;
  const R = RAYON_AIMANT();
  for (let k = butins.length - 1; k >= 0; k--) {
    const b = butins[k];
    b.t += dt;
    if (b.vh !== undefined && (b.h > 0 || b.vh)) { // saut des blocs : retombe et rebondit un peu
      b.vh -= 260 * dt; b.h += b.vh * dt;
      if (b.h <= 0) { b.h = 0; b.vh = Math.abs(b.vh) > 25 ? -b.vh * 0.4 : 0; }
    }
    const dx = m.x - b.x, dy = m.y - 6 - b.y, d = Math.hypot(dx, dy), Rb = BUTINS[b.k].special ? Math.max(R * 1.5, 24) : R;
    if (b.t > (b.vh !== undefined ? 0.8 : 0.35) && d < Rb) { // l'aimant l'attire (de plus en plus vite) ; les blocs restent un peu par terre avant
      const v = 60 + (Rb - d) * 8;
      b.vx = dx / d * v; b.vy = dy / d * v;
      b.x += b.vx * dt; b.y += b.vy * dt;
    } else {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (solide(Math.floor(nx), Math.floor(b.y))) b.vx *= -0.4; else b.x = nx;
      if (solide(Math.floor(b.x), Math.floor(ny))) b.vy *= -0.4; else b.y = ny;
      b.vx *= 1 - dt * 5; b.vy *= 1 - dt * 5;
    }
    if (d < 5) { butins.splice(k, 1); ramasser(b.k, b.n); }
  }
}
// Miettes : un petit « tic » (au plus un toutes les 35 ms) et un « +N » qui se cumule
let dernierTic = 0;
function ramasserMiette(k, n) {
  sac.comptes[k] = (sac.comptes[k] || 0) + n; sacASauver = true;
  run.blocs += n; gagnerXP(n);
  const v = n * BUTINS[k].val, t = textes.find(t => t.k === k && t.t < 0.45);
  if (t) { t.n += v; t.txt = "+" + t.n; t.t = Math.min(t.t, 0.12); }
  else { const c = BUTINS[k].c; textes.push({ x: m.x + (Math.random() - 0.5) * 10, y: m.y - 20, txt: "+" + v, n: v, k, c: "rgb(" + c.map(v => Math.min(255, v * 1.5) | 0).join(",") + ")", t: 0, petit: true }); }
  document.getElementById("sac-total").textContent = totalSac();
  const ms = performance.now();
  if (n >= 4) { note(880 + Math.random() * 60, "square", 0.05, 0.07); vib(10, 5); popBouton(bSac); } // gros bloc : « clac » plus franc
  else if (ms - dernierTic > 35) { dernierTic = ms; note(1300 + Math.random() * 200 + serie * 30, "triangle", 0.03, 0.04); }
}
function ramasser(k, n = 1) {
  const B = BUTINS[k];
  if (B.miette) { ramasserMiette(k, n); return; }
  if (k === "capsule") { run.capsules++; accord(4, true); vib(30, 15); ouvrirCartes(); return; }
  if (k === "recharge") { run.energie = Math.min(1, run.energie + 0.25); texte(m.x, m.y - 22, "Lampe +25 %", "#9fe0ff"); accord(2, true); vib(20, 10); return; }
  sac.comptes[k] = (sac.comptes[k] || 0) + 1; sauverSac();
  serie = Math.min(serie + 1, 14); serieTemps = 0.8;
  if (k === "bombe") { majBombes(); texte(m.x, m.y - 22, "+1 bombe", "#ffb35a"); popBouton(document.querySelector('[data-outil="bombe"]')); }
  else texte(m.x + (Math.random() - 0.5) * 8, m.y - 22, "+" + B.val, "rgb(" + B.c.join(",") + ")", (RANG[k] || 0) >= 3);
  if (RANG[k]) { run.gemmes++; gagnerXP(Math.round(B.val / 2)); }
  const rg = RANG[k] || 0;
  if (rg) { // trésor dans le sac : accord, petite gerbe autour du mineur, vibration selon la rareté
    accord(rg, true); eclats(m.x, m.y - 8, B.c, 6 + rg * 3, 40);
    eclairs.push([m.x, m.y - 8, 0, 0.4 + rg * 0.15, B.c[0] / 255, B.c[1] / 255, B.c[2] / 255]);
    vib(12 + rg * 8, 6 + rg * 3);
  } else { bip(serie); vib(8, 4); }
  majSac();
}

// ---------- 11. Fin d'une zone : cérémonie ----------
function terminer(z) {
  z.fait = true; z.brille = 1.4;
  for (const i of z.membres) if (cassable(type[i])) {
    type[i] = VIDE;
    if (Math.random() < 0.25 * FX()) { const a = Math.random() * Math.PI * 2; particule(i % W + 0.5, ((i / W) | 0) + 0.5, Math.cos(a) * 40, Math.sin(a) * 40, [255, 220, 120], 0.5, true); }
  }
  z.faits = z.total;
  anneaux.push({ x: z.cx, y: z.cy, t: 0 });
  for (let k = 0; k < 50 * FX(); k++) {
    const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
    particule(z.cx, z.cy, Math.cos(a) * v, Math.sin(a) * v, k % 3 ? [255, 220, 120] : [255, 255, 255], 0.6 + Math.random() * 0.6, true);
  }
  secousse = Math.max(secousse, 0.4); ding(); vib([25, 40, 40], [15, 40, 20]);
  if (z.sorte === "mousse") {
    texte(z.cx, z.cy - 12, "100 %", "#ffd56a", true);
    gagnerXP(10);
    montrerBandeau("Mousse nettoyée");
    const k = REGIONS[regionDe(z.cx, z.cy)].butin;
    for (let j = 0; j < 4; j++) lacherButin(z.cx, z.cy, j === 0 ? k : "caillou"); // petite récompense
    return;
  }
  // L'objet se soulève du sol : il devient une « envolée » dessinée en grand
  const qual = z.degats < 0.35 ? 0 : z.degats < 1.6 ? 1 : 2;
  for (const i of z.pixels) type[i] = VIDE;
  envols.push({ z, qual, t: 0 });
  if (REG.effets !== "simples" && !reduit) ralenti = Math.max(ralenti, 0.45);
}
function finEnvol(e) {
  const z = e.z, M = z.modele, val = Math.round(M.val * QUAL_MULT[e.qual]);
  const fiche = collection[M.nom], nouveau = !fiche;
  run.trouv++; if (nouveau) run.nouv++; gagnerXP(25);
  collection[M.nom] = { n: (fiche ? fiche.n : 0) + 1, meilleure: fiche ? Math.min(fiche.meilleure, e.qual) : e.qual };
  ecrire("tunnel2-collection", collection);
  sac.tresor += val; sauverSac(); majSac();
  bip(10); vib([20, 30, 60], [15, 30, 30]);
  montrerBandeau(M.nom + " <small>· " + QUALITES[e.qual] + " · +" + val + (nouveau ? " · nouveau !" : "") + "</small>");
}
// Objet cassé : il éclate en débris
function briser(z) {
  z.fait = true;
  for (const i of z.pixels) {
    type[i] = VIDE;
    if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70; particule(i % W + 0.5, ((i / W) | 0) + 0.5, Math.cos(a) * v, Math.sin(a) * v, [coul[i * 3], coul[i * 3 + 1], coul[i * 3 + 2]], 0.6 + Math.random() * 0.5, false); }
  }
  for (const i of z.membres) if (zoneC[i] >= 0) zoneC[i] = -1;
  secousse = Math.max(secousse, 0.3); sonVerre(); vib(120, 50);
  montrerBandeau(z.nom + " <small>· cassé…</small>", true);
}

// ---------- 12. Son ----------
let audio = null, son = null, maitre = null;
function initSon() {
  if (audio) { if (audio.state === "suspended") audio.resume(); return; }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    maitre = audio.createGain(); maitre.gain.value = REG.son ? 1 : 0; maitre.connect(audio.destination);
    const buf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    son = { buf };
    // Bruit filtré (le « pschhh » du jet, le frottement du pinceau) + bourdonnement grave (moteur du jet)
    const bruit = audio.createBufferSource(); bruit.buffer = buf; bruit.loop = true;
    const filtre = audio.createBiquadFilter(); filtre.type = "bandpass"; filtre.Q.value = 1.2; filtre.frequency.value = 1200;
    const gBruit = audio.createGain(); gBruit.gain.value = 0;
    const osc = audio.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 70;
    const bas = audio.createBiquadFilter(); bas.type = "lowpass"; bas.frequency.value = 400;
    const gOsc = audio.createGain(); gOsc.gain.value = 0;
    bruit.connect(filtre); filtre.connect(gBruit); gBruit.connect(maitre);
    osc.connect(bas); bas.connect(gOsc); gOsc.connect(maitre);
    bruit.start(); osc.start();
    Object.assign(son, { filtre, gBruit, osc, gOsc });
  } catch (e) { audio = null; }
}
const SON_MAT = { [VIDE]: [500, 0.03, 60], [TERRE]: [900, 0.12, 70], [ROCHE]: [3000, 0.1, 92], [DURE]: [3600, 0.1, 100], [MOUSSE]: [1700, 0.1, 80], [MINERAI]: [4000, 0.1, 104], [OBJET]: [4600, 0.08, 120] };
function majSon() {
  if (!son) return;
  const t = audio.currentTime;
  if (tir && tir.sorte === "jet") {
    const [f, g, o] = SON_MAT[tir.mat] || SON_MAT[VIDE];
    son.filtre.frequency.setTargetAtTime(f, t, 0.03); son.gBruit.gain.setTargetAtTime(g, t, 0.03);
    son.osc.frequency.setTargetAtTime(o + Math.random() * 6, t, 0.05); son.gOsc.gain.setTargetAtTime(0.035, t, 0.03);
  } else if (tir && tir.sorte === "pinceau" && tir.mat !== VIDE) {
    son.filtre.frequency.setTargetAtTime(5200 + Math.random() * 800, t, 0.02); son.gBruit.gain.setTargetAtTime(0.045, t, 0.02);
    son.gOsc.gain.setTargetAtTime(0, t, 0.03);
  } else { son.gBruit.gain.setTargetAtTime(0, t, 0.05); son.gOsc.gain.setTargetAtTime(0, t, 0.05); }
}
function note(f, type, g, duree, retard = 0) {
  if (!audio) return;
  const t = audio.currentTime + retard, o = audio.createOscillator(), gg = audio.createGain();
  o.type = type; o.frequency.value = f;
  gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(gg); gg.connect(maitre); o.start(t); o.stop(t + duree + 0.05);
}
function bruitCourt(f, q, g, duree, versF) {
  if (!audio) return;
  const t = audio.currentTime, s = audio.createBufferSource(), fi = audio.createBiquadFilter(), gg = audio.createGain();
  s.buffer = son.buf; fi.type = "bandpass"; fi.frequency.value = f; fi.Q.value = q;
  if (versF) fi.frequency.exponentialRampToValueAtTime(versF, t + duree);
  gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  s.connect(fi); fi.connect(gg); gg.connect(maitre); s.start(t, Math.random() * 0.5); s.stop(t + duree + 0.05);
}
const bip = n => note(660 * Math.pow(2, n / 12), "square", 0.05, 0.08);
// Accord qui monte : plus de notes et plus aigu selon la rareté (rang 1 à 5). « court » = version ramassage.
const GAMME = [0, 4, 7, 12, 16, 19, 24];
function accord(rg, court) {
  const base = 523 * Math.pow(2, (rg - 1) * 2 / 12), n = court ? 2 + Math.min(2, rg >> 1) : 2 + rg;
  for (let j = 0; j < n; j++) {
    const f = base * Math.pow(2, GAMME[j] / 12), r = j * (court ? 0.04 : 0.06);
    note(f, "triangle", 0.14, court ? 0.25 : 0.5, r);
    if (rg >= 3) note(f * 2, "sine", 0.05, court ? 0.2 : 0.45, r + 0.01); // reflet cristallin pour les gros
  }
  if (!court && rg >= 4) note(base / 2, "sine", 0.18, 0.7); // petite basse pour les plus rares
}
const ding = () => { note(988, "triangle", 0.22, 0.6); note(1480, "triangle", 0.2, 0.6, 0.09); note(1976, "triangle", 0.18, 0.6, 0.18); };
const sonPioche = t => { bruitCourt(t === ROCHE || t === DURE ? 2600 : 1100, 2, 0.5, 0.12); note(t === ROCHE || t === DURE ? 1700 : 600, "square", 0.04, 0.05); };
const sonFissure = () => { bruitCourt(5200, 6, 0.25, 0.08); note(2400, "square", 0.03, 0.04); };
const sonVerre = () => { for (let k = 0; k < 5; k++) note(2000 + Math.random() * 2500, "triangle", 0.06, 0.25, k * 0.03); bruitCourt(6000, 3, 0.3, 0.3); };
const sonLancer = () => bruitCourt(800, 1, 0.15, 0.15, 2400);
const sonPose = () => note(220, "square", 0.04, 0.05);
function sonBoum() {
  if (!audio) return;
  bruitCourt(700, 0.7, 1.0, 0.9, 90);
  const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
  g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(g); g.connect(maitre); o.start(t); o.stop(t + 0.75);
}

// ---------- 13. Vibrations (selon le réglage Fort / Léger / Coupé) ----------
function vib(fort, leger) {
  if (REG.vibration === "coupe") return;
  const motif = REG.vibration === "fort" ? fort : leger;
  try { if (motif && navigator.vibrate) navigator.vibrate(motif); } catch (e) {}
}

// ---------- 14. Bandeau et boutons ----------
const bandeau = document.getElementById("bandeau");
let minuteBandeau = 0;
function montrerBandeau(html, discret) {
  bandeau.innerHTML = html; bandeau.className = discret ? "zone" : "";
  clearTimeout(minuteBandeau); minuteBandeau = setTimeout(() => bandeau.classList.add("cache"), 2600);
}
const bSac = document.getElementById("b-sac");
function popBouton(b) { if (!b || REG.effets === "simples") return; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
function totalSac() { let s = sac.tresor; for (const k in sac.comptes) s += (BUTINS[k] ? BUTINS[k].val : 0) * sac.comptes[k]; return s; }
function majSac() { document.getElementById("sac-total").textContent = totalSac(); popBouton(bSac); }
function majBombes() {
  const n = sac.comptes.bombe || 0;
  document.getElementById("nb-bombes").textContent = n;
  document.querySelector('[data-outil="bombe"]').classList.toggle("vide", n <= 0);
}

// ---------- 15. Dessin ----------
const canMonde = document.getElementById("monde"), ctxM = canMonde.getContext("2d");
const canDessus = document.getElementById("dessus"), cd = canDessus.getContext("2d");
let largeur = 0, hauteur = 0, dpr = 1, BW = 0, BH = 0, image = null, pix = null, camX = 0, camY = 0, sx = 0, sy = 0;
function redim() {
  largeur = innerWidth; hauteur = innerHeight; dpr = Math.min(3, devicePixelRatio || 1);
  BW = Math.ceil(largeur / P) + 2; BH = Math.ceil(hauteur / P) + 2;
  canMonde.width = BW; canMonde.height = BH; canMonde.style.width = BW * P + "px"; canMonde.style.height = BH * P + "px";
  image = ctxM.createImageData(BW, BH); pix = new Uint32Array(image.data.buffer);
  canDessus.width = Math.round(largeur * dpr); canDessus.height = Math.round(hauteur * dpr);
  canDessus.style.width = largeur + "px"; canDessus.style.height = hauteur + "px";
}
const pack = (r, g, b) => (255 << 24) | ((b > 255 ? 255 : b < 0 ? 0 : b | 0) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g | 0) << 8) | (r > 255 ? 255 : r < 0 ? 0 : r | 0);
// Lumière du jour : pleine dans la clairière, s'éteint en entrant dans la mine
const ambiance = y => y >= FAL_HAUT + 30 ? 1 : y <= FAL_HAUT - 20 ? 0.05 : 0.05 + 0.95 * (y - FAL_HAUT + 20) / 50;

// Sources de lumière de cette image : [x, y, rayon, intensité, r, g, b]
let lumieres = [];
function majLumieres(temps) {
  const lampeF = run.energie < 0.15 ? 0.35 + 0.65 * run.energie / 0.15 : 1; // la lampe faiblit à la fin
  lumieres = [[m.x, m.y - 8, 58 * S.halo * lampeF, 0.95 * lampeF, 1, 0.9, 0.78], [EX, FAL_HAUT + 4, 70, 0.9, 1, 0.97, 0.88]]; // halo du mineur, jour qui entre
  if (tir && tir.sorte === "jet") {
    const fl = 0.85 + Math.random() * 0.3;
    lumieres.push([mainX(), mainY(), 22, 0.6 * fl, 1, 0.7, 0.4]);
    if (tir.impact) lumieres.push([tir.impact[0], tir.impact[1], 40 + tir.large * 1.5, 1.4 * fl, 1, 0.68, 0.32]);
    const t = tir.traits[tir.traits.length >> 1];
    for (const f of [0.35, 0.7]) lumieres.push([t[0] + (t[2] - t[0]) * f, t[1] + (t[3] - t[1]) * f, 22, 0.5 * fl, 1, 0.72, 0.4]);
  }
  let n = 0;
  for (const p of particules) if (p.brille && n < 10 && p.vie > 0.15) { lumieres.push([p.x, p.y, 9, 0.5 * p.vie / p.vie0, 1, 0.75, 0.4]); n++; }
  for (const z of zones) if (z.brille > 0) lumieres.push([z.cx, z.cy, 70, z.brille, 1, 0.95, 0.75]);
  for (const b of bombes) if (b.posee) lumieres.push([b.x, b.y, 16, (Math.sin(temps * (b.meche < 0.5 ? 40 : 18)) > 0 ? 0.8 : 0.3), 1, 0.3, 0.2]);
  for (const e of envols) lumieres.push([e.z.cx, e.z.cy, 60, 1.2, 1, 0.92, 0.7]);
  for (const d of drones) lumieres.push([d.x, d.y, 14, 0.5, 0.6, 0.85, 1]);
  let nc = 0; // capsules encore dans la roche : petite lueur pour les repérer
  for (const c of capsules) if (!c.libre && nc < 6 && Math.abs(c.x - m.x) < 110 && Math.abs(c.y - m.y) < 160) { const col = BUTINS[c.sorte].c; lumieres.push([c.x, c.y, 11, 0.55 + 0.2 * Math.sin(temps * 4 + c.x), col[0] / 255, col[1] / 255, col[2] / 255]); nc++; }
  for (const e of eclairs) { const f = 1 - e[2] / 0.6; lumieres.push([e[0], e[1], 34, e[3] * f * f, e[4], e[5], e[6]]); }
  // Les trésors par terre luisent un peu (on les voit dans le noir)
  let nb = 0;
  for (const b of butins) if (RANG[b.k] && nb < 8) { lumieres.push([b.x, b.y, 10, 0.35 + 0.1 * Math.sin(temps * 5 + b.x), BUTINS[b.k].c[0] / 255, BUTINS[b.k].c[1] / 255, BUTINS[b.k].c[2] / 255]); nb++; }
  if (flashBoum && flashBoum.t < 0.4) lumieres.push([flashBoum.x, flashBoum.y, 110, 2.6 * (1 - flashBoum.t / 0.4), 1, 0.75, 0.45]);
}
function lumiereEn(x, y) {
  let l = ambiance(y);
  for (const L of lumieres) { const d2 = (x - L[0]) ** 2 + (y - L[1]) ** 2, r2 = L[2] * L[2]; if (d2 < r2) l += (1 - d2 / r2) ** 2 * L[3]; }
  return l;
}

// Le fond (murs, sol, lumière), pixel par pixel. Fonction à part : plus petite, le navigateur l'optimise mieux.
function dessinerFond(temps, ox, oy) {
  const Ls = lumieres.filter(L => L[0] + L[2] > ox && L[0] - L[2] < ox + BW && L[1] + L[2] > oy && L[1] - L[2] < oy + BH);
  const Lr = []; // lumières qui touchent la ligne en cours (plus rapide : on ne teste que celles-là)
  for (let by = 0; by < BH; by++) {
    const y = oy + by, AMB = ambiance(y);
    let nL = 0;
    for (const L of Ls) if (Math.abs(y - L[1]) < L[2]) Lr[nL++] = L;
    for (let bx = 0; bx < BW; bx++) {
      const x = ox + bx;
      let r, g, b, em = 0, er = 0, eg = 0, eb = 0;
      if (!dans(x, y)) { pix[by * BW + bx] = pack(5, 5, 7); continue; }
      const i = y * W + x, t = type[i];
      if (t !== VIDE) {
        // Dessus du mur (ou objet enfoui)
        r = coul[i * 3]; g = coul[i * 3 + 1]; b = coul[i * 3 + 2];
        if (t === OBJET) {
          const z = zones[zoneO[i]];
          // Silhouette nette dès le départ (claire, contour d'encre, légère lueur) : on la repère de loin,
          // et on ne la confond pas avec le minerai (qui, lui, n'a ni contour ni lueur)
          const f = z.faits / (z.total || 1), k = 0.75 + 0.25 * f;
          r *= k; g *= k; b *= k;
          em = 0.5 + 0.12 * Math.sin(temps * 2.5 + z.cx); er = r; eg = g; eb = b;
          if (typeEn(x - 1, y) !== OBJET || typeEn(x + 1, y) !== OBJET || typeEn(x, y - 1) !== OBJET || typeEn(x, y + 1) !== OBJET) { r = 29; g = 23; b = 38; em = 0; }
          if (z.degats > 0 && hache(x, y, 31) < z.degats * 0.12) { r *= 0.35; g *= 0.3; b *= 0.3; } // fissures
          if (z.flash > 0) { em = z.flash * 2; er = 255; eg = 90; eb = 70; }
        } else if (cassable(t)) {
          // Fissures lumineuses sur la matière abîmée
          const fr = 1 - pv[i] / (PVBASE[t] * MULT[reg[i]]);
          if (fr > 0.05 && hache(x, y, 21) < fr * 0.8) { em = 0.6 + fr * 0.6; er = 255; eg = 150 + fr * 80; eb = 60; }
          if (t === MINERAI && coul[i * 3] > 150 && hache(x, y, (temps * 3) | 0) < 0.02) { em = 0.8; er = 255; eg = 255; eb = 230; } // scintille
        }
        // Contour franc : bord nord/ouest/est sombre, petite lèvre claire au sud
        if (!solide(x, y + 1)) { r *= 1.25; g *= 1.25; b *= 1.25; }
        else if (!solide(x, y - 1) || !solide(x - 1, y) || !solide(x + 1, y)) { r = 29; g = 23; b = 38; }
      } else {
        // Face avant d'un mur au-dessus ?
        let kf = 0, tt = 0;
        for (let k = 1; k <= FHMAX; k++) { tt = typeEn(x, y - k); if (tt !== VIDE) { if (k <= FH[tt]) kf = k; break; } }
        if (kf) {
          const j = (y - kf) * W + x, h = FH[tt];
          if (tt === ARBRE) { r = 92; g = 62; b = 40; if (kf === h) { r = 40; g = 30; b = 24; } else if (Math.abs(((x * 7) % 5) - 2) > 1) { r = 40; g = 70; b = 40; } } // tronc et ombre du feuillage
          else {
            const c = dans(x, y - kf) ? [coul[j * 3], coul[j * 3 + 1], coul[j * 3 + 2]] : [40, 34, 44];
            const f = kf === h ? 0.32 : 0.72 - 0.4 * kf / h;
            r = c[0] * f; g = c[1] * f; b = c[2] * f;
          }
          if (kf < h && (!solide(x - 1, y - kf) || !solide(x + 1, y - kf))) { r *= 0.6; g *= 0.6; b *= 0.6; } // arêtes
        } else {
          // Vieux sol (ou herbe), assombri près des murs
          r = sol[i * 3]; g = sol[i * 3 + 1]; b = sol[i * 3 + 2];
          if (solide(x - 1, y) || solide(x + 1, y) || solide(x, y + 1)) { r *= 0.6; g *= 0.6; b *= 0.6; }
          else if (solide(x - 2, y) || solide(x + 2, y) || solide(x, y + 2)) { r *= 0.8; g *= 0.8; b *= 0.8; }
          if (REGIONS[reg[i]].sol === "basalte" && y < FAL_HAUT && r > 150) { em = 0.5 + 0.2 * Math.sin(temps * 2 + x * 0.1); er = 255; eg = 80; eb = 30; } // fentes de lave
        }
      }
      // Lumière
      let lr = AMB, lg = AMB, lb = AMB < 1 ? AMB * 1.3 : 1;
      for (let n = 0; n < nL; n++) {
        const L = Lr[n], dx = x - L[0], dy = y - L[1], d2 = dx * dx + dy * dy, r2 = L[2] * L[2];
        if (d2 < r2) { const f = 1 - d2 / r2, q = f * f * L[3]; lr += q * L[4]; lg += q * L[5]; lb += q * L[6]; }
      }
      if (AMB >= 1) { lr = Math.min(lr, 1.25); lg = Math.min(lg, 1.25); lb = Math.min(lb, 1.25); }
      r = r * lr + em * er * 0.7; g = g * lg + em * eg * 0.7; b = b * lb + em * eb * 0.7;
      pix[by * BW + bx] = pack(r, g, b);
    }
  }
}
function dessinerMonde(temps) {
  const ox = Math.floor(camX), oy = Math.floor(camY);
  dessinerFond(temps, ox, oy);
  const plot = (x, y, c, k = 1) => { const px = Math.floor(x) - ox, py = Math.floor(y) - oy; if (px >= 0 && py >= 0 && px < BW && py < BH) pix[py * BW + px] = pack(c[0] * k, c[1] * k, c[2] * k); };
  const plotAdd = (x, y, c, a) => {
    const px = Math.floor(x) - ox, py = Math.floor(y) - oy;
    if (px < 0 || py < 0 || px >= BW || py >= BH) return;
    const v = pix[py * BW + px];
    pix[py * BW + px] = pack((v & 255) + c[0] * a, ((v >> 8) & 255) + c[1] * a, ((v >> 16) & 255) + c[2] * a);
  };
  const ombre = (x, y, l) => { for (let k = -l; k <= l; k++) { const px = Math.floor(x + k) - ox, py = Math.floor(y) - oy; if (px >= 0 && py >= 0 && px < BW && py < BH) { const v = pix[py * BW + px]; pix[py * BW + px] = pack((v & 255) * 0.55, ((v >> 8) & 255) * 0.55, ((v >> 16) & 255) * 0.55); } } };
  // Petit butin par terre : gemme avec contour, toujours un peu visible, qui scintille
  for (const b of butins) {
    const B = BUTINS[b.k], l = Math.max(0.55, Math.min(1.3, lumiereEn(b.x, b.y)));
    if (b.k === "bombe") { dessinerBombe(b.x, b.y, 0, l, temps, false); continue; }
    if (B.miette) { // bloc : petit cube (dessus clair, côté sombre), ombre au sol quand il saute
      const ll = Math.max(0.8, l), s = b.taille || 2, c = b.c, x0 = Math.floor(b.x - s / 2), y0 = Math.floor(b.y - s / 2 - (b.h || 0));
      if (b.h > 0.5) ombre(b.x, b.y + s / 2, s >> 1);
      const clair = [c[0] * 1.35, c[1] * 1.35, c[2] * 1.35], sombre = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
      if (s === 2) { plot(x0, y0, clair, ll); plot(x0 + 1, y0, c, ll); plot(x0, y0 + 1, c, ll); plot(x0 + 1, y0 + 1, sombre, ll); }
      else for (let j = -1; j <= s; j++) for (let q = -1; q <= s; q++) {
        const bord = j < 0 || q < 0 || j === s || q === s;
        if (bord) { if ((j < 0 || j === s) && (q < 0 || q === s)) continue; plot(x0 + q, y0 + j, [29, 23, 38]); } // contour d'encre (coins arrondis)
        else plot(x0 + q, y0 + j, j === 0 ? clair : j === s - 1 ? sombre : c, ll);
      }
      continue;
    }
    const c = B.c, cl = [c[0] * 1.4, c[1] * 1.4, c[2] * 1.4], fo = [c[0] * 0.65, c[1] * 0.65, c[2] * 0.65];
    const brille = Math.sin(temps * 6 + b.x) > 0.85;
    const G = B.special ? [".KKK.", "KwcwK", "KcwcK", "KwcwK", ".KKK."] : [".KKK.", "KwccK", "KcccK", "KcffK", ".KKK."];
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
      const ch = G[j][k]; if (ch === ".") continue;
      plot(b.x - 2 + k, b.y - 2 + j, ch === "K" ? [29, 23, 38] : ch === "w" ? (brille ? [255, 255, 255] : cl) : ch === "f" ? fo : c, ch === "K" ? 1 : l);
    }
  }
  // Bombes lancées : ombre au sol + bombe en l'air
  function dessinerBombe(x, y, z, l, temps, meche) {
    const G = ["..s..", ".KKK.", "KwbbK", "KbbbK", ".KKK."];
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
      const ch = G[j][k]; if (ch === ".") continue;
      const c = ch === "K" ? [20, 16, 26] : ch === "w" ? [150, 146, 176] : ch === "s" ? (Math.sin(temps * 30) > 0 ? [255, 230, 120] : [255, 120, 50]) : (meche && Math.sin(temps * 18) > 0.3 ? [150, 60, 60] : [70, 66, 92]);
      plot(x - 2 + k, y - 4 + j - z, c, ch === "s" ? 1 : l);
    }
  }
  for (const b of bombes) { ombre(b.x, b.y, 2); dessinerBombe(b.x, b.y, b.z, 1, temps, b.posee); }
  // Capsules encore dans la roche : on les voit à travers (contour qui clignote doucement)
  for (const c of capsules) {
    if (c.libre || c.x < ox - 3 || c.x > ox + BW + 3 || c.y < oy - 3 || c.y > oy + BH + 3) continue;
    const col = BUTINS[c.sorte].c, on = 0.75 + 0.35 * Math.sin(temps * 4 + c.x), cl = [col[0] * 1.3, col[1] * 1.3, col[2] * 1.3];
    const G = [".KKK.", "KwcwK", "KcwcK", "KwcwK", ".KKK."];
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) { const ch = G[j][k]; if (ch === ".") continue; plot(c.x - 2 + k, c.y - 2 + j, ch === "K" ? [29, 23, 38] : ch === "w" ? cl : col, ch === "K" ? 1 : on); }
  }
  // Scies orbitales : petites lames grises qui tournent
  if (run.c.scies) for (let k = 0; k <= run.c.scies; k++) {
    const a = scies.a + k * Math.PI * 2 / (run.c.scies + 1), x = m.x + Math.cos(a) * 14, y = m.y - 6 + Math.sin(a) * 11, r = scies.a * 3;
    plot(x, y, [230, 230, 240]);
    for (let j = 0; j < 4; j++) { const b = r + j * Math.PI / 2; plot(x + Math.cos(b) * 1.6, y + Math.sin(b) * 1.6, [170, 170, 186]); plot(x + Math.cos(b + 0.5) * 2.4, y + Math.sin(b + 0.5) * 2.4, [29, 23, 38]); }
  }
  // Drones : petit corps sombre, hélice qui clignote, œil bleu
  for (const d of drones) {
    const y = d.y + Math.sin(temps * 6 + d.x) * 0.8;
    for (let j = -1; j <= 1; j++) for (let k = -2; k <= 2; k++) plot(d.x + k, y + j, Math.abs(k) === 2 || Math.abs(j) === 1 ? [29, 23, 38] : [90, 96, 120]);
    plot(d.x, y, [140, 220, 255]);
    const h = Math.sin(temps * 40) > 0; plot(d.x - 2, y - 2, h ? [200, 200, 210] : [29, 23, 38]); plot(d.x + 2, y - 2, h ? [29, 23, 38] : [200, 200, 210]);
  }
  // Mineur (mêmes pixels que le monde)
  const cadre = Math.hypot(m.vx, m.vy) > 3 ? Math.floor(m.pas * 8) % 2 : 0, lignes = SPRITE.concat(JAMBES[cadre]);
  const rc = tir && tir.sorte === "jet" ? m.recul : [0, 0];
  const mx = Math.round(m.x) - 5 - ox + rc[0], my = Math.round(m.y) - 15 - oy - (cadre ? 1 : 0) + rc[1];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 10; x++) {
    const ch = lignes[y][m.sens > 0 ? x : 9 - x];
    if (ch === ".") continue;
    const px = mx + x, py = my + y;
    if (px < 0 || py < 0 || px >= BW || py >= BH) continue;
    const c = PAL[ch]; pix[py * BW + px] = pack(c[0] * 0.95, c[1] * 0.95, c[2] * 0.95);
  }
  // Pioche dans la main : manche + fer, qui balance à chaque coup
  if (outil === "pioche" && doigt) {
    const a = pioche.angle - pioche.anim * 1.3 * m.sens, hx = mainX(), hy = mainY() + 2;
    for (let k = 0; k <= 9; k++) plot(hx + Math.cos(a) * k, hy + Math.sin(a) * k, k < 8 ? [130, 88, 52] : [60, 44, 30]);
    const fx = hx + Math.cos(a) * 9, fy = hy + Math.sin(a) * 9;
    for (let k = -3; k <= 3; k++) plot(fx - Math.sin(a) * k, fy + Math.cos(a) * k, Math.abs(k) === 3 ? [120, 120, 132] : [196, 196, 206]);
  }
  // Pinceau : manche vers la main, poils sous le doigt
  if (tir && tir.sorte === "pinceau") {
    const a = Math.atan2(mainY() - tir.y, mainX() - tir.x);
    for (let k = 2; k <= 7; k++) plot(tir.x + Math.cos(a) * k, tir.y + Math.sin(a) * k, [160, 104, 60]);
    for (let k = -1; k <= 1; k++) for (let j = 0; j <= 1; j++) plot(tir.x + Math.cos(a) * j - Math.sin(a) * k, tir.y + Math.sin(a) * j + Math.cos(a) * k, [236, 214, 160]);
  }
  // Jet d'énergie : cœur blanc-jaune, halo orange, « pulsations » qui avancent
  if (tir && tir.sorte === "jet") for (const [ax, ay, bx2, by2, coeur, centre] of tir.traits) {
    const lg2 = Math.hypot(bx2 - ax, by2 - ay), n = Math.ceil(lg2 * 2), nx = -(by2 - ay) / (lg2 || 1), ny = (bx2 - ax) / (lg2 || 1);
    for (let k = 0; k <= n; k++) {
      const f = k / n, px = ax + (bx2 - ax) * f, py = ay + (by2 - ay) * f, d = f * lg2;
      const pulse = ((d - temps * 160) % 12 + 12) % 12 < 3;
      if (coeur) {
        plot(px, py, pulse ? [255, 255, 255] : [255, 244, 200]);
        if (Math.random() < 0.9) plotAdd(px + nx, py + ny, [255, 140, 50], 0.55);
        if (Math.random() < 0.9) plotAdd(px - nx, py - ny, [255, 140, 50], 0.55);
      } else if (Math.random() < 0.7) plotAdd(px, py, [255, 150, 60], 0.5);
    }
    if (centre && tir.impact) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy); if (d <= 2.2) plotAdd(tir.impact[0] + dx, tir.impact[1] + dy, [255, 230, 160], 1 - d / 2.6);
    }
  }
  // Particules : étincelles qui brillent, miettes et fumée éclairées
  for (const p of particules) {
    const f = p.vie / p.vie0;
    if (p.brille) plot(p.x, p.y, [p.c[0], p.c[1] * (0.5 + f * 0.5), p.c[2] * f]);
    else plot(p.x, p.y, p.c, Math.min(1.2, 0.3 + lumiereEn(p.x, p.y)) * (p.lent ? 0.4 + 0.6 * f : 0.85));
  }
  ctxM.putImageData(image, 0, 0);
}

// Calque du dessus (pleine résolution) : pointillés, %, ondes, chiffres, curseur, objets qui s'envolent
function dessinerDessus(temps) {
  cd.setTransform(dpr, 0, 0, dpr, 0, 0);
  cd.clearRect(0, 0, largeur, hauteur);
  const E = x => (x - camX) * P + sx, F = y => (y - camY) * P + sy;
  for (const z of zones) {
    if (z.cx < camX - 40 || z.cx > camX + largeur / P + 40 || z.cy < camY - 40 || z.cy > camY + hauteur / P + 40) continue;
    if (!z.fait && z.sorte === "mousse") {
      cd.fillStyle = "rgba(255,236,200,0.4)";
      for (const [x, y] of z.bord) if (solide(x, y)) cd.fillRect(E(x), F(y), P - 1, P - 1);
    }
    if (z.brille > 0) {
      cd.fillStyle = "rgba(255,255,235," + Math.min(1, z.brille) + ")";
      for (let k = 0; k < 30 * FX(); k++) { const a = Math.random() * Math.PI * 2, d = Math.random() * 22; cd.fillRect(E(z.cx + Math.cos(a) * d), F(z.cy + Math.sin(a) * d * 0.7), P, P); }
    }
    if (!z.fait && z.faits > 0 && z.touche > 0) {
      const p = Math.floor(z.faits / z.total * 100) + " %";
      cd.font = "bold 12px monospace"; cd.textAlign = "center";
      cd.lineWidth = 3; cd.strokeStyle = "#1d1726"; cd.strokeText(p, E(z.cx), F(z.cy) - 40);
      cd.fillStyle = z.degats > 0 ? "#ffb39a" : "#ffe7c2"; cd.fillText(p, E(z.cx), F(z.cy) - 40);
    }
  }
  for (const o of anneaux) {
    const duree = o.vite ? 0.5 : 0.8, r = o.t * (o.petit ? 50 : o.vite ? 160 : 110) * P, al = Math.max(0, 1 - o.t / duree);
    cd.strokeStyle = o.c ? "rgba(" + o.c.join(",") + "," + al + ")" : "rgba(255,240,200," + al + ")"; cd.lineWidth = (o.petit ? 3 : 5) * al + 1;
    cd.beginPath(); cd.arc(E(o.x), F(o.y), r, 0, Math.PI * 2); cd.stroke();
  }
  // Curseur du pinceau et de la pioche (pointillé si le doigt est trop loin : l'outil s'arrête au bout du bras)
  if (tir && (tir.sorte === "pinceau" || tir.sorte === "pioche")) {
    cd.strokeStyle = "rgba(255,240,210,0.5)"; cd.lineWidth = 1.5;
    cd.setLineDash(tir.loin ? [3, 3] : []);
    cd.beginPath(); cd.arc(E(tir.x), F(tir.y), (tir.sorte === "pioche" ? S.piocheR : 2.4) * P, 0, Math.PI * 2); cd.stroke();
    cd.setLineDash([]);
  }
  for (const t of textes) {
    const k = t.t < 0.15 ? 0.6 + t.t * 4 : 1.2 - Math.min(0.2, t.t - 0.15), al = t.t < 0.7 ? 1 : 1 - (t.t - 0.7) * 2;
    cd.save(); cd.globalAlpha = Math.max(0, al); cd.translate(E(t.x), F(t.y) - t.t * 26); cd.scale(k, k);
    cd.font = "bold " + (t.gros ? 22 : t.petit ? 11 : 13) + "px monospace"; cd.textAlign = "center"; cd.lineWidth = t.gros ? 5 : 3; cd.strokeStyle = "#1d1726"; cd.strokeText(t.txt, 0, 0);
    cd.fillStyle = t.c; cd.fillText(t.txt, 0, 0); cd.restore();
  }
  // Objets déterrés : ils s'élèvent, tournent un peu dans un halo de rayons, puis filent dans le sac
  for (const e of envols) {
    const M = e.z.modele, d = M.dessin, t = e.t;
    let x = E(e.z.cx), y = F(e.z.cy), s;
    if (t < 0.45) { const f = t / 0.45; s = 1 + 1.4 * f; y -= 30 * f; }
    else if (t < 1.5) { s = 2.4 + Math.sin(t * 6) * 0.08; y -= 30 + Math.sin(t * 3) * 3; }
    else {
      const f = Math.min(1, (t - 1.5) / 0.45), r = bSac.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const f2 = f * f; x += (cx - x) * f2; y = (y - 30) + (cy - (y - 30)) * f2; s = 2.4 * (1 - f) + 0.4 * f;
    }
    const cel = 3 * P * s; // taille d'une « case » du dessin à l'écran (1 case = 3 pixels du monde)
    cd.save(); cd.translate(x, y); cd.rotate(t < 1.5 ? Math.sin(t * 4) * 0.12 : t * 4);
    if (t > 0.2 && t < 1.6) { // rayons de lumière qui tournent
      const al = Math.min(1, (t - 0.2) * 3) * (t > 1.4 ? (1.6 - t) * 5 : 1);
      cd.fillStyle = "rgba(255,226,150," + 0.28 * al + ")";
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + t * 1.5; cd.beginPath(); cd.moveTo(0, 0); cd.lineTo(Math.cos(a - 0.12) * 90, Math.sin(a - 0.12) * 90); cd.lineTo(Math.cos(a + 0.12) * 90, Math.sin(a + 0.12) * 90); cd.fill(); }
    }
    const cw = d[0].length * cel, ch = d.length * cel;
    for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { // contour sombre
      cd.fillStyle = "#1d1726";
      d.forEach((l, j) => [...l].forEach((c, k) => { if (c !== ".") cd.fillRect(-cw / 2 + k * cel + ddx * 2, -ch / 2 + j * cel + ddy * 2, cel + 0.5, cel + 0.5); }));
    }
    d.forEach((l, j) => [...l].forEach((c, k) => {
      if (c === ".") return;
      const col = M.pal[c], q = e.qual === 0 ? 1 : 0.85;
      cd.fillStyle = "rgb(" + (col[0] * q | 0) + "," + (col[1] * q | 0) + "," + (col[2] * q | 0) + ")";
      cd.fillRect(-cw / 2 + k * cel, -ch / 2 + j * cel, cel + 0.5, cel + 0.5);
    }));
    if (e.qual > 0) { // fêlures
      cd.strokeStyle = "rgba(29,23,38,0.8)"; cd.lineWidth = Math.max(1, cel * 0.25);
      cd.beginPath(); cd.moveTo(-cw * 0.3, -ch * 0.4); cd.lineTo(0, 0); cd.lineTo(-cw * 0.1, ch * 0.4); if (e.qual > 1) { cd.moveTo(cw * 0.35, -ch * 0.2); cd.lineTo(0, 0); } cd.stroke();
    }
    if (t > 0.3 && t < 1.5) { cd.fillStyle = "rgba(255,255,240,0.9)"; for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, r = cw * 0.4 + Math.random() * 30; cd.fillRect(Math.cos(a) * r, Math.sin(a) * r, 3, 3); } }
    cd.restore();
  }
}

// ---------- 16. Compagnon ----------
const LIGNES_COMPAGNON = {
  bulbizarre: { noms: ["Bulbizarre", "Herbizarre", "Florizarre"], sprites: ["compagnons/001_left.gif", "compagnons/002_left.gif", "compagnons/003_left.gif"] },
  salameche:  { noms: ["Salamèche", "Reptincel", "Dracaufeu"],     sprites: ["compagnons/004_left.gif", "compagnons/005_left.gif", "compagnons/006_left.gif"] },
  carapuce:   { noms: ["Carapuce", "Carabaffe", "Tortank"],        sprites: ["compagnons/007_left.gif", "compagnons/008_left.gif", "compagnons/009_left.gif"] }
};
const SEUILS_XP = [40, 120];
const etatComp = Object.assign({ xp: { bulbizarre: 0, salameche: 0, carapuce: 0 }, actif: null }, lire("tunnel-compagnons", {}));
let compagnonActif = etatComp.actif in LIGNES_COMPAGNON ? etatComp.actif : null;
const sauverCompagnons = () => ecrire("tunnel-compagnons", { xp: etatComp.xp, actif: compagnonActif });
const stadeCompagnon = cle => { const xp = etatComp.xp[cle] || 0; return xp >= SEUILS_XP[1] ? 2 : xp >= SEUILS_XP[0] ? 1 : 0; };
function xpCompagnon() {
  if (!compagnonActif) return;
  const avant = stadeCompagnon(compagnonActif);
  etatComp.xp[compagnonActif] = (etatComp.xp[compagnonActif] || 0) + 1;
  const apres = stadeCompagnon(compagnonActif);
  if (apres > avant) {
    texte(comp.x, comp.y - 26, LIGNES_COMPAGNON[compagnonActif].noms[apres] + " !", "#ffd56a", true);
    eclats(comp.x, comp.y - 8, [255, 255, 255], 30, 70); secousse = Math.max(secousse, 0.3); ding(); vib([30, 40, 60], [20]);
  }
  sauverCompagnons(); calcStats();
}
const img = document.getElementById("compagnon"), comp = { x: m.x - 18, y: m.y, sens: 1 };
let dirX = 1, dirY = 0;
function majCompagnon(dt) {
  if (!compagnonActif) { img.hidden = true; return; }
  const src = LIGNES_COMPAGNON[compagnonActif].sprites[stadeCompagnon(compagnonActif)];
  if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  img.hidden = false;
  const v = Math.hypot(m.vx, m.vy);
  if (v > 3) { dirX = m.vx / v; dirY = m.vy / v; }
  const tx = m.x - dirX * 16, ty = m.y - dirY * 12, k = Math.min(1, dt * 5), avant = comp.x;
  comp.x += (tx - comp.x) * k; comp.y += (ty - comp.y) * k;
  if (Math.abs(comp.x - avant) > 0.05) comp.sens = comp.x > avant ? 1 : -1;
  const cote = Math.round(64 * P / 3);
  img.style.width = img.style.height = cote + "px";
  img.style.transform = "translate(" + ((comp.x - camX) * P - cote / 2 + sx).toFixed(1) + "px," + ((comp.y - camY) * P - cote * 29 / 32 + sy).toFixed(1) + "px)" + (comp.sens > 0 ? " scaleX(-1)" : "");
  img.style.filter = "brightness(" + Math.min(1.2, lumiereEn(comp.x, comp.y - 6)).toFixed(2) + ")";
}

// ---------- 17. Icônes (pixel, monochromes) ----------
const ICONES = {
  jet:     [".....XXX..", "....XXX...", "...XXX....", "..XXXXXXX.", "......XX..", ".....XX...", "....XX....", "...XX.....", "..X......."],
  pinceau: ["........XX", ".......XXX", "......XXX.", ".....XXX..", "....XXX...", "..XXXX....", ".XXXXX....", "XXXXX.....", "XXXX......", "XX........"],
  pioche:  ["..XXXXXX..", ".XX.XX.XX.", "XX..XX..XX", "X...XX...X", "....XX....", "....XX....", "....XX....", "....XX....", "....XX....", "....XX...."],
  bombe:   ["......X.X.", ".....X....", "...XXXX...", "..XXXXXX..", ".XX.XXXXX.", ".X.XXXXXX.", ".XXXXXXXX.", ".XXXXXXXX.", "..XXXXXX..", "...XXXX..."],
  sac:     ["...XXXX...", "..X....X..", "...XXXX...", "..XXXXXX..", ".XXXXXXXX.", "XXXX..XXXX", "XXXX..XXXX", "XXXXXXXXXX", "XXXXXXXXXX", ".XXXXXXXX."],
  livre:   ["XXXX..XXXX", "X..XXXX..X", "X.X.XX.X.X", "X..XXXX..X", "X.X.XX.X.X", "X..XXXX..X", "X.X.XX.X.X", "X..XXXX..X", "XXXXXXXXXX", "....XX...."],
  roue:    ["...X..X...", "..XXXXXX..", ".XXX..XXX.", "XXX....XXX", ".XX....XX.", ".XX....XX.", "XXX....XXX", ".XXX..XXX.", "..XXXXXX..", "...X..X..."],
  croix:   ["XX......XX", "XXX....XXX", ".XXX..XXX.", "..XXXXXX..", "...XXXX...", "...XXXX...", "..XXXXXX..", ".XXX..XXX.", "XXX....XXX", "XX......XX"],
  aimant:  ["XXX....XXX", "XXX....XXX", "XX......XX", "XX......XX", "XX......XX", "XX......XX", ".XX....XX.", ".XXX..XXX.", "..XXXXXX..", "...XXXX..."],
  bottes:  ["..XXXX....", "..XXXX....", "..XXXX....", "..XXXX....", "..XXXX....", "..XXXXX...", ".XXXXXXX..", "XXXXXXXXXX", "XXXXXXXXXX", ".........."],
  lampe:   ["....XX....", "...X..X...", "..XXXXXX..", "..X.XX.X..", "..XXXXXX..", "..X.XX.X..", "..XXXXXX..", "...XXXX...", "..XXXXXX..", ".XXXXXXXX."],
  foreuse: ["X.........", "XXX.......", ".XXXX.....", "..XXXXX...", "...XXXXXX.", "...XXXXXXX", "..XXXXX...", ".XXXX.....", "XXX.......", "X........."],
  etoile:  ["....X.....", "....X.....", "...XXX....", "XXXXXXXXX.", ".XXXXXXX..", "..XXXXX...", "..XX.XX...", ".XX...XX..", ".X.....X..", ".........."],
  scie:    ["....XX....", ".X.XXXX.X.", "..XXXXXX..", ".XXX..XXX.", "XXX....XXX", "XXX....XXX", ".XXX..XXX.", "..XXXXXX..", ".X.XXXX.X.", "....XX...."],
  drone:   ["XXX....XXX", "..X....X..", "..XXXXXX..", ".XXXXXXXX.", "XXX.XX.XXX", "XXXXXXXXXX", ".XXXXXXXX.", "..X....X..", ".X......X.", ".........."]
};
function iconeSvg(nom) {
  const g = ICONES[nom];
  let r = "";
  g.forEach((l, y) => [...l].forEach((c, x) => { if (c === "X") r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">${r}</svg>`;
}
document.querySelectorAll("[data-icone]").forEach(e => e.innerHTML = iconeSvg(e.dataset.icone));

// ---------- 18. Panneaux : réglages, sac, trouvailles, compagnon ----------
const panneau = document.getElementById("panneau"), corps = document.getElementById("panneau-corps");
function ouvrir(titre, remplir) { document.getElementById("panneau-titre").textContent = titre; corps.innerHTML = ""; remplir(corps); panneau.hidden = false; doigt = null; }
document.getElementById("panneau-fermer").addEventListener("click", () => panneau.hidden = true);
function ligneChoix(parent, libelle, cle, choix) {
  const l = document.createElement("div"); l.className = "ligne";
  l.innerHTML = `<span>${libelle}</span><div class="choix"></div>`;
  for (const [v, txt] of choix) {
    const b = document.createElement("button"); b.textContent = txt; b.classList.toggle("actif", REG[cle] === v);
    b.addEventListener("click", () => {
      REG[cle] = v; sauverReglages();
      l.querySelectorAll("button").forEach(x => x.classList.toggle("actif", x === b));
      if (cle === "son" && maitre) maitre.gain.value = v ? 1 : 0;
      if (cle === "vibration") vib(30, 12);
    });
    l.lastChild.appendChild(b);
  }
  parent.appendChild(l);
}
// Curseur (glissière) : libellé, glissière, valeur affichée
function ligneCurseur(parent, libelle, cle, min, max, pas, format, quandChange) {
  const l = document.createElement("div"); l.className = "ligne curseur";
  l.innerHTML = `<span>${libelle}</span><input type="range" min="${min}" max="${max}" step="${pas}" value="${REG[cle]}"><b></b>`;
  const ent = l.querySelector("input"), val = l.querySelector("b");
  val.textContent = format(REG[cle]);
  ent.addEventListener("input", () => {
    REG[cle] = +ent.value; val.textContent = format(REG[cle]); sauverReglages();
    if (quandChange) quandChange(REG[cle]);
  });
  parent.appendChild(l);
}
function ligneLien(parent, html, action) {
  const l = document.createElement("div"); l.className = "ligne lien"; l.innerHTML = `<span>${html}</span>`;
  l.addEventListener("click", action); parent.appendChild(l);
}
function ouvrirReglages() {
  ouvrir("Réglages", c => {
    ligneChoix(c, "Son", "son", [[true, "Activé"], [false, "Coupé"]]);
    ligneChoix(c, "Vibration", "vibration", [["fort", "Fort"], ["leger", "Léger"], ["coupe", "Coupé"]]);
    ligneChoix(c, "Effets", "effets", [["complets", "Complets"], ["simples", "Simples"]]);
    ligneCurseur(c, "Zoom", "zoom", 1.8, 3.6, 0.2, v => "×" + v.toFixed(1), v => { P = v; redim(); });
    ligneCurseur(c, "Portée pinceau/pioche", "portee", 8, 32, 2, v => v, () => calcStats());
    const nom = compagnonActif ? LIGNES_COMPAGNON[compagnonActif].noms[stadeCompagnon(compagnonActif)] : "Aucun";
    ligneLien(c, `Compagnon <small>· ${nom}</small>`, ouvrirCompagnon);
    ligneLien(c, `Atelier <small>· ${pieces} pièces</small>`, ouvrirAtelier);
    ligneLien(c, "Remonter <small>· finir l'expédition</small>", () => { if (confirm("Finir l'expédition maintenant ? Le butin du sac devient des pièces.")) { panneau.hidden = true; finExpedition(true); } });
    ligneLien(c, "Ancienne version <small>· vue de côté</small>", () => location.href = "ancienne/");
    const v = document.createElement("div"); v.className = "ligne"; v.innerHTML = `<span><small>Version ${VERSION}</small></span>`; c.appendChild(v);
  });
}
function miniButin(k) {
  const can = document.createElement("canvas"); can.width = 5; can.height = 5;
  const x = can.getContext("2d"), c = BUTINS[k].c;
  const G = BUTINS[k].miette ? [".....", ".KKK.", "KcccK", ".KfK.", "....."] : k === "bombe" ? ["..s..", ".KKK.", "KwbbK", "KbbbK", ".KKK."] : [".KKK.", "KwccK", "KcccK", "KcffK", ".KKK."];
  G.forEach((l, j) => [...l].forEach((ch, i) => {
    if (ch === ".") return;
    const col = ch === "K" ? [29, 23, 38] : ch === "w" ? (k === "bombe" ? [150, 146, 176] : [c[0] * 1.4, c[1] * 1.4, c[2] * 1.4]) : ch === "f" ? [c[0] * 0.65, c[1] * 0.65, c[2] * 0.65] : ch === "s" ? [255, 200, 90] : c;
    x.fillStyle = `rgb(${Math.min(255, col[0]) | 0},${Math.min(255, col[1]) | 0},${Math.min(255, col[2]) | 0})`; x.fillRect(i, j, 1, 1);
  }));
  return can;
}
function ouvrirSac() {
  ouvrir("Sac", c => {
    for (const k in BUTINS) {
      const n = sac.comptes[k] || 0;
      if (!n && k !== "bombe") continue;
      const l = document.createElement("div"); l.className = "butin";
      l.appendChild(miniButin(k));
      l.insertAdjacentHTML("beforeend", `<span>${BUTINS[k].nom}</span><b>× ${n}</b><small>${BUTINS[k].val ? n * BUTINS[k].val : ""}</small>`);
      c.appendChild(l);
    }
    if (sac.tresor) c.insertAdjacentHTML("beforeend", `<div class="butin"><span style="padding-left:30px">Trouvailles</span><b></b><small>${sac.tresor}</small></div>`);
    c.insertAdjacentHTML("beforeend", `<div class="total"><span>Total</span><span>${totalSac()}</span></div>`);
    c.insertAdjacentHTML("beforeend", `<div class="butin"><span>Pièces gardées (Atelier)</span><small>${pieces}</small></div>`);
  });
}
function dessinObjet(M, connu) {
  const d = M.dessin, can = document.createElement("canvas");
  can.width = 16; can.height = 16;
  const x = can.getContext("2d"), ox = Math.floor((16 - d[0].length * 2) / 2), oy = Math.floor((16 - d.length * 2) / 2);
  d.forEach((l, j) => [...l].forEach((ch, i) => {
    if (ch === ".") return;
    const col = connu ? M.pal[ch] : [52, 46, 60];
    x.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; x.fillRect(ox + i * 2, oy + j * 2, 2, 2);
  }));
  return can;
}
function ouvrirCollection() {
  const n = OBJETS.filter(o => collection[o.nom]).length;
  ouvrir("Trouvailles · " + n + " / " + OBJETS.length, c => {
    const g = document.createElement("div"); g.className = "grille";
    for (const M of OBJETS) {
      const f = collection[M.nom], e = document.createElement("div");
      e.className = "case" + (f ? "" : " inconnue");
      e.appendChild(dessinObjet(M, !!f));
      e.insertAdjacentHTML("beforeend", f ? `<span>${M.nom}</span><small>× ${f.n} · ${QUALITES[f.meilleure]}</small>` : `<span>???</span><small>${REGIONS[M.r].nom.split(" ")[0]}</small>`);
      g.appendChild(e);
    }
    c.appendChild(g);
  });
}
function ouvrirCompagnon() {
  ouvrir("Compagnon", c => {
    const ajouter = (cle, nom, sprite, txt) => {
      const b = document.createElement("button"); b.className = "ligne-compagnon" + (compagnonActif === cle ? " actif" : "");
      b.innerHTML = (sprite ? `<img src="${sprite}" alt="">` : `<i></i>`) + `<span>${nom}</span><small>${txt}</small>`;
      b.addEventListener("click", () => { compagnonActif = cle; sauverCompagnons(); calcStats(); comp.x = m.x - 16; comp.y = m.y; ouvrirCompagnon(); });
      c.appendChild(b);
    };
    ajouter(null, "Aucun", null, "");
    for (const cle in LIGNES_COMPAGNON) {
      const L = LIGNES_COMPAGNON[cle], s = stadeCompagnon(cle), xp = etatComp.xp[cle] || 0;
      ajouter(cle, L.noms[s], L.sprites[s], s < 2 ? xp + " / " + SEUILS_XP[s] : "Évolution complète");
    }
  });
}
document.getElementById("b-reglages").addEventListener("click", ouvrirReglages);
bSac.addEventListener("click", ouvrirSac);
document.getElementById("b-collection").addEventListener("click", ouvrirCollection);

// ---------- 19. Commandes ----------
const boutonsOutils = document.querySelectorAll("[data-outil]");
function choisirOutil(o) {
  outil = o; ecrire("tunnel2-outil", o);
  boutonsOutils.forEach(b => b.classList.toggle("actif", b.dataset.outil === o));
}
boutonsOutils.forEach(b => b.addEventListener("click", () => { initSon(); choisirOutil(b.dataset.outil); vib(8, 4); }));
const joy = { x: 0, y: 0, id: null };
const joystick = document.getElementById("joystick"), joyB = document.getElementById("joy");
function lireJoy(e) {
  const r = joystick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy), k = Math.min(1, 34 / (d || 1));
  joyB.style.transform = "translate(" + dx * k + "px," + dy * k + "px)";
  joy.x = Math.max(-1, Math.min(1, dx / 34)); joy.y = Math.max(-1, Math.min(1, dy / 34));
  if (Math.hypot(joy.x, joy.y) < 0.2) joy.x = joy.y = 0;
}
joystick.addEventListener("pointerdown", e => { e.preventDefault(); initSon(); joy.id = e.pointerId; joystick.setPointerCapture(e.pointerId); lireJoy(e); });
joystick.addEventListener("pointermove", e => { if (e.pointerId === joy.id) lireJoy(e); });
for (const ev of ["pointerup", "pointercancel"]) joystick.addEventListener(ev, e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; joyB.style.transform = ""; });
const touches = new Set();
addEventListener("keydown", e => {
  touches.add(e.key.toLowerCase());
  const o = { "1": "jet", "2": "pinceau", "3": "pioche", "4": "bombe" }[e.key];
  if (o) choisirOutil(o);
});
addEventListener("keyup", e => touches.delete(e.key.toLowerCase()));
canDessus.addEventListener("pointerdown", e => {
  initSon();
  if (!panneau.hidden) { panneau.hidden = true; return; } // toucher le jeu ferme le panneau
  if (outil === "bombe") { lancerBombe(camX + e.clientX / P, camY + e.clientY / P, performance.now() / 1000); return; }
  doigt = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
  pioche.t = 9; // premier coup tout de suite
  canDessus.setPointerCapture(e.pointerId);
});
canDessus.addEventListener("pointermove", e => { if (doigt && e.pointerId === doigt.id) { doigt.sx = e.clientX; doigt.sy = e.clientY; } });
for (const ev of ["pointerup", "pointercancel"]) canDessus.addEventListener(ev, e => { if (doigt && e.pointerId === doigt.id) doigt = null; });

// ---------- 19b. Expédition : XP, cartes, lampe, bilan, Atelier ----------
let pause = false; // vrai pendant le choix des cartes et sur les écrans de fin : le jeu s'arrête
function gagnerXP(n) {
  if (run.fini) return;
  run.xp += n;
  while (run.xp >= besoin(run.niv)) { run.xp -= besoin(run.niv); run.niv++; run.aChoisir++; }
  if ((run.aChoisir || run.capsules) && !pause) ouvrirCartes();
}
// Tire 3 cartes différentes (pondérées par rareté). Capsule = seulement des rares et épiques.
function tirerCartes(rares) {
  const dispo = CARTES.filter(c => (run.c[c.id] || 0) < c.max && (!c.si || c.si()) && (!rares || c.r > 0));
  const choix = [];
  while (choix.length < 3 && dispo.length) {
    let tot = 0; for (const c of dispo) tot += POIDS[c.r];
    let r = Math.random() * tot, j = 0;
    while (j < dispo.length - 1 && r > POIDS[dispo[j].r]) { r -= POIDS[dispo[j].r]; j++; }
    choix.push(dispo.splice(j, 1)[0]);
  }
  while (choix.length < 3) choix.push({ id: "pieces", nom: "Bourse", ic: "sac", r: 0, max: 99, d: "+50 pièces" }); // tout est au maximum
  return choix;
}
const choixEl = document.getElementById("choix");
function ouvrirCartes() {
  const rares = run.capsules > 0;
  if (rares) run.capsules--; else if (run.aChoisir > 0) run.aChoisir--; else return;
  pause = true; doigt = null; joy.id = null; joy.x = joy.y = 0; joyB.style.transform = "";
  const remplir = () => {
    const cartes = tirerCartes(rares);
    choixEl.innerHTML = `<b class="choix-titre">${rares ? "Capsule !" : "Niveau " + run.niv + " !"}</b>`;
    for (const c of cartes) {
      const n = (run.c[c.id] || 0) + 1, d = typeof c.d === "function" ? c.d(n) : c.d;
      const b = document.createElement("button");
      b.className = "carte r" + c.r;
      b.innerHTML = `<i>${iconeSvg(c.ic)}</i><span><em>${RARETES[c.r]}${n === 1 && c.max > 1 && c.id !== "pieces" ? " · nouveau" : n > 1 ? " · niv. " + n : ""}</em><b>${c.nom}</b><small>${d}</small></span>`;
      b.addEventListener("click", () => prendreCarte(c));
      choixEl.appendChild(b);
    }
    if (run.relances > 0) {
      const r = document.createElement("button"); r.className = "relance"; r.textContent = "Relancer (" + run.relances + ")";
      r.addEventListener("click", () => { run.relances--; remplir(); vib(10, 5); });
      choixEl.appendChild(r);
    }
  };
  remplir();
  choixEl.hidden = false;
  ding(); vib([20, 30, 40], [10, 20, 20]);
}
function prendreCarte(c) {
  if (c.id === "pieces") pieces += 50;
  else run.c[c.id] = (run.c[c.id] || 0) + 1;
  if (c.id === "bombe" && run.c.bombe === 1) { sac.comptes.bombe = (sac.comptes.bombe || 0) + 3; majBombes(); }
  if (["jet", "pinceau", "bombe"].includes(c.id) && run.c[c.id] === 1) choisirOutil(c.id); // nouvel outil : on le prend en main
  calcStats();
  choixEl.hidden = true; pause = false;
  bip(12); vib(15, 8);
  texte(m.x, m.y - 26, c.nom + (run.c[c.id] > 1 ? " " + run.c[c.id] : ""), "#ffd56a", true);
  if (run.aChoisir || run.capsules) setTimeout(() => { if (!pause) ouvrirCartes(); }, 350); // plusieurs niveaux d'un coup
}

// Barres du haut (2A) : XP (or) et lampe (crème)
const barreXP = document.querySelector("#b-xp span"), barreLampe = document.querySelector("#b-lampe span"), etiqNiv = document.getElementById("niveau");
let dejaXP = -1, dejaLampe = -1, dejaNiv = -1;
function majBarres() {
  const x = Math.round(run.xp / besoin(run.niv) * 200), l = Math.round(run.energie * 200);
  if (x !== dejaXP) { dejaXP = x; barreXP.style.width = x / 2 + "%"; }
  if (l !== dejaLampe) { dejaLampe = l; barreLampe.style.width = l / 2 + "%"; barreLampe.classList.toggle("faible", run.energie < 0.15); }
  if (run.niv !== dejaNiv) { dejaNiv = run.niv; etiqNiv.textContent = "Niv. " + run.niv; }
}
// La lampe s'use seulement dans la mine. À zéro : le noir tombe, puis le bilan.
let noirT = 0;
const noir = document.getElementById("noir");
function majLampe(dt) {
  if (run.fini) {
    noirT += dt; noir.style.opacity = Math.min(1, noirT / 1.5);
    if (noirT > 1.8 && document.getElementById("ecran").hidden) afficherBilan();
    return;
  }
  if (!dansMine) return;
  run.energie -= dt / S.duree * S.usure;
  if (run.energie <= 0) { run.energie = 0; finExpedition(); }
  // Bombes qui reviennent toutes seules (carte Bombes niveau 2+)
  if (run.c.bombe > 1) { run.bombeT += dt; if (run.bombeT >= 60 / (run.c.bombe - 1)) { run.bombeT = 0; sac.comptes.bombe = (sac.comptes.bombe || 0) + 1; majBombes(); } }
}
// Fin de l'expédition : le butin devient des pièces (gardées)
let bilan = null;
function finExpedition(volontaire) {
  if (run.fini) return;
  run.fini = true; noirT = 0; noir.hidden = false; doigt = null;
  let blocsVal = 0; for (const k in sac.comptes) if (BUTINS[k] && BUTINS[k].miette) blocsVal += BUTINS[k].val * sac.comptes[k];
  const gain = totalSac() + Math.round(blocsVal * 0.1 * nivA("sac"));
  const nouveauRecord = gain > record;
  pieces += gain; if (nouveauRecord) record = gain;
  bilan = { titre: volontaire ? "Retour à la surface" : "La lampe s'éteint…", gain, nouveauRecord, blocs: run.blocs, gemmes: run.gemmes, trouv: run.trouv, nouv: run.nouv, niv: run.niv, zone: REGIONS[run.zoneMax].nom };
  sac.comptes = { bombe: 0 }; sac.tresor = 0; sauverSac(); sauverProgres();
  bruitCourt(300, 0.5, 0.4, 1.4, 60);
}
const ecran = document.getElementById("ecran");
function afficherBilan() {
  pause = true;
  const b = bilan, ligne = (a, v) => `<div class="ligne-b"><span>${a}</span><span>${v}</span></div>`;
  ecran.innerHTML = `<div class="ecran-corps"><div class="discret centre">${b.titre}</div><div class="gros">+ <span id="defile">0</span> pièces</div>` +
    ligne("Blocs", b.blocs) + ligne("Gemmes", b.gemmes) + ligne("Trouvailles", b.trouv + (b.nouv ? " (" + b.nouv + " nouvelle" + (b.nouv > 1 ? "s" : "") + ")" : "")) +
    ligne("Niveau atteint", b.niv) + ligne("Zone la plus loin", b.zone) + ligne("Record", b.nouveauRecord ? '<span class="vert">nouveau !</span>' : record) +
    `<div class="espace"></div><button class="btn" id="vers-atelier">Atelier</button><button class="btn sombre" id="repartir">Repartir tout de suite</button></div>`;
  ecran.hidden = false;
  document.getElementById("vers-atelier").onclick = ouvrirAtelier;
  document.getElementById("repartir").onclick = nouvelleExpedition;
  // Les chiffres défilent
  const el = document.getElementById("defile"), t0 = performance.now();
  const tic = () => { const f = Math.min(1, (performance.now() - t0) / 1200); el.textContent = Math.round(b.gain * f * (2 - f)); if (f < 1) requestAnimationFrame(tic); else { ding(); vib(30, 15); } };
  tic();
}
function ouvrirAtelier() {
  pause = true;
  const remplir = () => {
    let h = `<div class="ecran-corps"><div class="tete-a"><b>Atelier</b><span class="or">${pieces} pièces</span></div>`;
    for (const d of ATELIER_DEF) {
      const n = nivA(d.id), plein = n >= d.max, prix = prixA(d);
      h += `<button class="atel" data-id="${d.id}" ${plein || prix > pieces ? "disabled" : ""}><span>${d.nom}<small>${d.txt}</small></span><span class="pips">${"<i class=on></i>".repeat(n)}${"<i></i>".repeat(d.max - n)}</span><span class="prix">${plein ? "max" : prix}</span></button>`;
    }
    h += `<div class="espace"></div><button class="btn" id="partir">Nouvelle expédition</button>${run.fini ? "" : '<button class="btn sombre" id="retour">Retour à la mine</button>'}</div>`;
    ecran.innerHTML = h;
    ecran.querySelectorAll(".atel").forEach(b => b.onclick = () => {
      const d = ATELIER_DEF.find(x => x.id === b.dataset.id), prix = prixA(d);
      if (pieces < prix || nivA(d.id) >= d.max) return;
      pieces -= prix; atelier[d.id] = nivA(d.id) + 1; sauverProgres();
      accord(3, true); vib(20, 10); remplir();
    });
    document.getElementById("partir").onclick = () => { if (!run.fini && !confirm("Finir cette expédition et en commencer une nouvelle ?")) return; if (!run.fini) finExpedition(true); nouvelleExpedition(); };
    const r = document.getElementById("retour"); if (r) r.onclick = () => { ecran.hidden = true; pause = false; calcStats(); };
  };
  remplir();
  ecran.hidden = false; panneau.hidden = true;
}
function nouvelleExpedition() {
  Object.assign(run, { niv: 1, xp: 0, c: {}, relances: nivA("relance"), energie: 1, fini: false, blocs: 0, gemmes: 0, trouv: 0, nouv: 0, zoneMax: 0, aChoisir: 0, capsules: 0, bombeT: 0 });
  if (nivA("outil")) run.c.jet = 1;
  sac.comptes = { bombe: 0 }; sac.tresor = 0; sauverSac();
  drones.length = 0; tirs.length = 0; boums.length = 0;
  calcStats();
  choisirOutil(run.c.jet ? "jet" : "pioche");
  majBombes(); document.getElementById("sac-total").textContent = 0;
  nouvelleMine(true);
  ecran.hidden = true; choixEl.hidden = true; noir.hidden = true; noir.style.opacity = 0; pause = false;
}

// ---------- 20. Nouvelle mine ----------
let regionVue = -1, dansMine = false;
const regionsVues = new Set();
function nouvelleMine(nouvelleGraine) {
  if (nouvelleGraine) GRAINE = (Math.random() * 1e6) | 0;
  generer();
  particules.length = anneaux.length = textes.length = butins.length = bombes.length = envols.length = eclairs.length = 0;
  for (const c of caillouxSol) butins.push({ x: c.x, y: c.y, vx: 0, vy: 0, k: c.k, t: 0, n: 1 });
  m.x = DEPART.x; m.y = DEPART.y; m.px = m.py = 0; comp.x = m.x - 18; comp.y = m.y;
  regionsVues.clear(); regionVue = -1; dansMine = false;
  camX = m.x - largeur / P / 2; camY = m.y - 8 - hauteur / P / 2;
}

// ---------- 21. Boucle ----------
function etape(dt, temps) {
  if (joy.id === null) {
    joy.x = (touches.has("arrowright") || touches.has("d") ? 1 : 0) - (touches.has("arrowleft") || touches.has("q") ? 1 : 0);
    joy.y = (touches.has("arrowdown") || touches.has("s") ? 1 : 0) - (touches.has("arrowup") || touches.has("z") ? 1 : 0);
  }
  m.vx = joy.x * S.marche; m.vy = joy.y * S.marche;
  bouger((m.vx + m.px) * dt, (m.vy + m.py) * dt);
  const amorti = Math.exp(-dt * 6); m.px *= amorti; m.py *= amorti;
  if (Math.abs(joy.x) > 0.15 && !doigt) m.sens = joy.x > 0 ? 1 : -1;
  if (Math.hypot(m.vx, m.vy) > 3) m.pas += dt; else m.pas = 0;
  // Nouvelle zone de la mine : petit bandeau la première fois
  const dedans = m.y < FAL_HAUT;
  if (dedans) {
    const r = regionDe(m.x, m.y);
    if (r > run.zoneMax) run.zoneMax = r;
    if (r !== regionVue) { regionVue = r; if (!regionsVues.has(r)) { regionsVues.add(r); montrerBandeau(REGIONS[r].nom, true); } }
  }
  dansMine = dedans;
  eclatsImage = 0;
  utiliserOutil(dt, temps);
  foreuse(dt); majScies(dt); majDrones(dt); majEtincelles(dt); majBoums();
  majLampe(dt); majBarres();
  majSon();
  majBombesVol(dt);
  majButins(dt);
  tremble = tir && (tir.sorte === "jet" || (tir.sorte === "pinceau" && tir.n)) ? (tir.sorte === "jet" ? 1 : 0.3) : 0;
  const cx = m.x - largeur / P / 2, cy = m.y - 8 - hauteur / P / 2;
  camX += (cx - camX) * Math.min(1, dt * 6); camY += (cy - camY) * Math.min(1, dt * 6);
  camX = Math.max(0, Math.min(W - largeur / P, camX)); camY = Math.max(0, Math.min(H - hauteur / P, camY));
  for (const p of particules) {
    p.vie -= dt;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (solide(Math.floor(nx), Math.floor(p.y))) p.vx *= -0.5; else p.x = nx;
    if (solide(Math.floor(p.x), Math.floor(ny))) p.vy *= -0.5; else p.y = ny;
    const fr = p.lent ? 4 : 2.5; p.vx *= 1 - dt * fr; p.vy *= 1 - dt * fr;
  }
  for (let k = particules.length - 1; k >= 0; k--) if (particules[k].vie <= 0) particules.splice(k, 1);
  for (const o of anneaux) o.t += dt;
  for (const e of eclairs) e[2] += dt;
  for (let k = eclairs.length - 1; k >= 0; k--) if (eclairs[k][2] > 0.6) eclairs.splice(k, 1);
  for (let k = anneaux.length - 1; k >= 0; k--) if (anneaux[k].t > (anneaux[k].vite ? 0.5 : 0.8)) anneaux.splice(k, 1);
  for (const t of textes) t.t += dt;
  for (let k = textes.length - 1; k >= 0; k--) if (textes[k].t > 1.2) textes.splice(k, 1);
  for (const z of zones) { z.touche -= dt; z.brille = Math.max(0, z.brille - dt); if (z.flash > 0) z.flash -= dt; }
  for (let k = envols.length - 1; k >= 0; k--) { envols[k].t += dt; if (envols[k].t >= 1.95) { finEnvol(envols[k]); envols.splice(k, 1); } }
  if (flashBoum) { flashBoum.t += dt; if (flashBoum.t > 0.4) flashBoum = null; }
  pioche.anim = Math.max(0, pioche.anim - dt * 6);
  secousse = Math.max(0, secousse - dt);
  const amp = (secousse * 10 + tremble * 1.2) * FX();
  sx = amp ? (Math.random() - 0.5) * amp : 0; sy = amp ? (Math.random() - 0.5) * amp : 0;
  majLumieres(temps);
  dessinerMonde(temps);
  const fx = (camX - Math.floor(camX)) * P, fy = (camY - Math.floor(camY)) * P;
  canMonde.style.transform = "translate(" + (-fx + sx).toFixed(2) + "px," + (-fy + sy).toFixed(2) + "px)";
  majCompagnon(dt);
  dessinerDessus(temps);
}
let avant = performance.now();
function boucle(maintenant) {
  const dt = Math.min(0.05, (maintenant - avant) / 1000); avant = maintenant;
  if (pause) { requestAnimationFrame(boucle); return; } // choix de cartes ou écran de fin : tout est figé
  // Petit ralenti quand un gros trésor sort (le temps du jeu passe à 30 %, puis revient en douceur)
  let dtJeu = dt;
  if (ralenti > 0) { dtJeu = dt * (ralenti > 0.1 ? 0.3 : 0.3 + (0.1 - ralenti) * 7); ralenti -= dt; }
  etape(dtJeu, maintenant / 1000);
  requestAnimationFrame(boucle);
}
addEventListener("resize", redim);
redim();
// Butin d'une expédition interrompue (appli fermée) : il est rangé en pièces
{ const reste = totalSac(); if (reste > 0) { pieces += reste; sauverProgres(); setTimeout(() => montrerBandeau("Butin précédent rangé : +" + reste + " pièces", true), 800); } }
nouvelleExpedition();
requestAnimationFrame(boucle);

// ---------- 22. Mise à jour automatique (service worker) ----------
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {});
  const avaitUneVersion = !!navigator.serviceWorker.controller;
  let dejaRecharge = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!avaitUneVersion || dejaRecharge) return;
    dejaRecharge = true;
    // On attend qu'aucun panneau ne soit ouvert
    const essayer = () => { if (panneau.hidden) location.reload(); else setTimeout(essayer, 1000); };
    essayer();
  });
}
