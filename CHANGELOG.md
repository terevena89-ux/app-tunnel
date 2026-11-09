# Tunnel — journal des nouveautés

## 0.14.0 — 2026-11-09
- **Blocs à ramasser** : en creusant, des petits cubes (2×2) de la couleur de la matière sautent du mur, rebondissent, restent un instant par terre puis filent vers le mineur ; parfois un gros cube (4×4, contour sombre) qui vaut 4 et fait un « clac ». Ils ont une petite valeur (terre 1, roche 2, roche dure 3, minerai 4) : le total du sac monte en creusant.
- **Collision avec les murs du haut** : le mineur s'arrête au pied de la face avant du mur au lieu de grimper dessus.

## 0.13.0 — 2026-11-09
- **Vue plus large** (dézoom) + curseur **Zoom** dans Réglages.
- **Jet = un gros rayon**, plus lent : il creuse un couloir où le mineur se faufile. Curseurs **Largeur du jet** et **Vitesse du jet**.
- **Pinceau et pioche à visée libre** près du mineur : le doigt peut être n'importe où, sa distance règle finement la position de l'outil (grand geste = petit geste précis). Curseur **Portée pinceau/pioche**.
- **Une miette par pixel cassé** (terre, roche, mousse…), attirée par l'aimant, comptée dans le sac, avec petit « tic » et « +N » qui se cumule.
- **Trésors plus marquants** selon la rareté : éclat de lumière de leur couleur, gerbe, accord qui monte, secousse et vibration plus fortes, petit ralenti pour les plus rares (et pour les objets déterrés). Ils luisent un peu par terre.
- **Objets enfouis plus visibles** : silhouette claire dès le départ, contour sombre et légère lueur qui respire (le minerai reste comme avant, sans contour ni lueur : on ne les confond pas).
- **Mineur un peu plus petit** (10 × 15 pixels au lieu de 12 × 18), pieds plus étroits pour se faufiler.
- Lumière calculée plus vite (moins de travail par image).

## 0.12.0 — 2026-11-08
- **Nouvelle version en vue de dessus** (remplace la vue de côté, gardée à part dans « Réglages › Ancienne version »).
- **Départ en pleine nature** : clairière (herbe, fleurs, arbres, petit chemin) au pied d'une falaise ; l'entrée de la mine est dans la paroi. Lumière du jour dehors, mine sombre dedans.
- **Progression** : 5 zones de plus en plus loin de l'entrée (Galerie d'entrée, Grotte humide, Veine de cristal, Ruines anciennes, Cœur de la montagne), chacune avec ses couleurs, son vieux sol et son butin ; la roche est 1,4 fois plus dure à chaque zone. Nom de la zone affiché la première fois qu'on y entre.
- **4 outils** (colonne à droite) : jet d'énergie (loin, rapide), pinceau (au contact, précis et doux), pioche (au contact, gros coups), bombes (trouvées en creusant, lancées vers le doigt ; le mineur est juste soufflé).
- **Objets fragiles** : 12 objets enfouis (ammonite, cristal, amphore, œuf de dragon…). Le jet trop longtemps dessus, la pioche ou une bombe les fêlent puis les cassent ; le pinceau jamais. Qualité au final : intacte, fêlée ou abîmée.
- **Collecte** : mini-butin attiré par l'aimant, « +N » qui saute, bip qui monte en série ; objet déterré = cérémonie (il s'élève, rayons de lumière, file dans le sac) ; sac qui se remplit ; écran « Trouvailles » à compléter.
- **Vibrations différentes par outil** (réglage Fort / Léger / Coupé), son activé par défaut, réglage Effets Complets / Simples.

## 0.11.0 — 2026-11-07
- Style graphique harmonisé avec les sprites de créatures :
  - Mineur redessiné plus finement (12 × 18 pixels au lieu de 8 × 12) : contour sombre franc, ombrage en 2 tons, couleurs plus vives.
  - Créature compagnon agrandie (environ les 2/3 du mineur) et bien posée sur le sol.
  - Blocs « contour franc » : liseré sombre au bord des galeries, reflet clair sur le sol, 3 tons par matière, grain 3 × 3 (même finesse que le mineur).
  - Mini-objets (pépites, éclats, os, capsules, miettes) redessinés à la même finesse, avec contour sombre et ombrage ; contour des gros cristaux et fossiles plus net.
  - Boutons « pixel sombre » : coins en escalier, contour d'encre, petit reflet ; icônes avec contour.

## 0.10.0 — 2026-11-07
- **Compagnon (test)** : un petit bouton (en bas à gauche, icône patte) permet de choisir un starter parmi les 3 de la 1re génération (Bulbizarre, Salamèche, Carapuce), ou aucun. Il marche derrière le mineur et augmente la portée de l'aimant qui ramasse les trouvailles (de plus en plus selon son évolution).
- Il gagne de l'XP à chaque bloc miné et évolue deux fois (paliers raccourcis pour tester vite : 40 puis 120 blocs), avec un petit effet (texte, étincelles, secousse) à chaque évolution.
- Choix et progression gardés sur ce téléphone (comme le reste de Tunnel).
- Sprites et noms officiels des 3 starters utilisés tels quels (risque de droits d'auteur assumé pour cet usage personnel) ; seuls les 9 sprites nécessaires sont dans le dépôt, le reste du dossier fourni reste local.

## 0.9.0 — 2026-11-07
- « Jus » (effets qui rendent chaque geste satisfaisant), réglable avec le curseur « Intensité des effets » (0 à ×2) : petite secousse quand un bloc casse, éclats qui sautent, chiffres « +N » qui pop au-dessus du mineur en ramassant, ligne du compteur qui grossit un instant, bip de ramassage qui monte d'une note en série. Gros cristal ou fossile : grosse secousse, gerbe d'étincelles, anneau de lumière et « Cristal ! » / « Fossile ! ».
- Blocs abîmés mais pas cassés : ils se réparent tout seuls (curseurs « attente » 2 s et « durée » 10 s ; 0 = jamais).
- Gratter : seul le mode « Allers-retours » est gardé ; en grattant, la zone rétrécit (curseur « Rétrécit en grattant », ×0,6 par défaut), l'inverse du doigt immobile qui l'élargit.
- Puissance du lancer : 120 par défaut.

## 0.8.0 — 2026-11-07
- Bouton saut rond en bas à droite ; le joystick ne sert plus qu'à marcher.
- Gratter accélère le minage, avec 3 modes à essayer dans les réglages : « Vitesse » (plus on frotte vite, plus les coups s'enchaînent), « Allers-retours » (un coup en plus à chaque changement de sens), « Petite zone » (en frottant, coups plus rapides). Réglage « Accélération en grattant ».
- Marches : le mineur monte et descend les marches en douceur, et la caméra suit la hauteur plus calmement quand il marche.

## 0.7.1 — 2026-11-07
- Valeurs par défaut des réglages de démo remplacées par celles choisies en jouant (rythme ×0,8, marche 20, saut 6, gravité 184, rampage 35 %, pinceau ×3, grossissement ×2,9, portée 37, cristaux 290 px/s, lancer 91).
- Pinceau et grossissement : curseurs jusqu'à ×5 (la valeur choisie touchait le maximum).

## 0.7.0 — 2026-11-07
- Échelle ×2 : le mineur fait 4 × 6 blocs (même dessin, même taille à l'écran) ; les blocs sont 2 fois plus fins. La mine garde la même taille « réelle » (2 fois plus de cases en largeur et en profondeur) ; cristaux, fossiles, grottes, filons à la même échelle visuelle.
- Minage en coups rythmés (4 par seconde par défaut) : centre plus fort que le bord, petit « tic » et vibration à chaque coup, 5 étapes de fissures avant de casser.
- Panneau « Réglages de démo » (roue dentée en bas à gauche) : 17 curseurs chiffrés (rythme, marche, saut, gravité, rampage, squishy, bouncy, coups, pinceau, portée, cristaux, lancer, aimant, lampe, sable/eau), « Valeurs par défaut » et « Copier les valeurs ».
- Dessin du monde accéléré ; zoom de 1,5 à 12 px par case.

## 0.6.0 — 2026-11-07
- Rythme général plus posé (tout à 65 % : marche, chute, saut, sable, eau, aimant, grattage, caméra). Portée du lance-pierre réduite.
- Gros cristaux : un seul grand cristal sur plusieurs cases, de forme toujours différente (aiguilles, grappe, géode ; bleu ou améthyste). Il faut le déterrer tout autour, puis le gratter doucement ; sinon il se fissure et casse en débris.
- Gros fossiles (ammonite, grand os, poisson, crâne, trilobite) : à déterrer aussi ; ils ne cassent pas mais demandent plus de travail.
- Bandeau en haut avec le dessin et le nom de la trouvaille quand on ramasse un cristal ou un fossile.
- Visuel de la zone qu'on creuse : cercle fin sous le doigt + cases visées légèrement éclaircies (cercle pâle si trop loin du mineur).
- Lance-pierre actif : petit cercle pointillé qui tourne autour du mineur.
- Mineur « squishy » : il se tasse pour se faufiler dans un passage de 2 cases de haut, plus lentement.
- Joystick en bas à gauche à la place de la barre : gauche / droite pour marcher, vers le haut pour sauter.

## 0.5.0 — 2026-11-07
- Énergie : chaque bloc creusé use la lampe (plus la roche est dure, plus ça coûte ; marcher et lancer sont gratuits). Sa lumière porte moins loin et vacille plus quand elle faiblit ; un trait très fin en haut de l'écran la montre aussi.
- Recharges : les capsules vertes ramassées redonnent de l'énergie. Coincé dans le sable, la lampe s'use.
- Cristaux fragiles : il faut d'abord dégager la roche autour (au moins 2 côtés), puis gratter doucement (~1 seconde). Pris dans la roche ou gratté trop vite, il se fissure puis casse en débris sans valeur (bruit de verre).
- Fin d'expédition : quand la lampe s'éteint, bilan (profondeur et butin) et bouton « Nouvelle expédition » (nouvelle mine).
- Minage : les blocs ont des points de vie ; nouvelles roches dures de couleurs différentes (caillou gris, schiste brun-rouge, obsidienne violet-noir), presque absentes au départ puis de plus en plus nombreuses. Fissures en 3 étapes sur un bloc entamé.
- Grattoir : si le doigt reste immobile, la zone s'élargit autour du centre (jusqu'à 2 fois en 1 seconde).
- Commandes : plus de toucher pour marcher ; grande barre gauche / droite en bas et bouton saut au-dessus à droite ; bouton pour activer ou non le lance-pierre ; profondeur et version passées en haut.
- Saut plus haut, lancer moins puissant ; contre un mur, le mineur rebondit au lieu de s'accrocher ou de rester figé, et glisse sur les coins pour passer.
- Démo : couches rapprochées du départ et quelques cristaux tout près pour tester vite.

## 0.4.0 — 2026-11-07
- Le sable s'écroule quand on creuse dessous (il glisse aussi en biais). S'il tombe sur le mineur, il est coincé jusqu'à ce qu'on le dégage.
- L'eau coule vraiment : elle descend, s'étale et se met à niveau, et continue de couler même quand on ne touche plus l'écran. Si elle atteint le mineur, il revient à la dernière corniche sûre (ou au départ).
- Gouttes qui tombent du plafond près des poches d'eau (indice), grondement et vibration quand ça se met à couler.
- Mineur plus agile : marche 2 fois plus vite, boîte de collision aux coins arrondis (il ne se coince plus sur les petites bosses), enjambe les marches, suit les petites descentes, contourne les coins en vol.
- Grappin : contre un mur, il glisse doucement vers le bas (saut de mur possible) ; au plafond, il pend toujours.
- Zoom jusqu'à 24 px par bloc.

## 0.3.0 — 2026-11-07
- Nouveau mineur « mignon » (grosse tête, grands yeux), plus petit : 2 × 3 blocs, dessiné finement (4 × 4 pixels par bloc) sur un calque net. Il est « rebondi » : s'aplatit en atterrissant, s'étire en vol, sautille en marchant, respire au repos.
- Blocs avec un grain fin et des arêtes douces au bord des galeries (visibles en zoomant).
- Ce qu'on creuse tombe en mini-objets (grains, pépites, éclats, os…) avec un petit contour ; un aimant les attire quand on passe près ; compteur discret en haut à gauche.
- Grattoir un peu plus grand, et curseur en bas à gauche pour régler sa taille (démo).
- Son (coupé au départ, bouton en bas à gauche) : grattage selon la matière, ramassage, élastique et « fwip » du lance-pierre, chocs.
- Touches pour bouger : flèches / Q-D / espace sur PC ; boutons gauche / droite / saut à l'écran, affichés avec le bouton « manette ».

## 0.2.0 — 2026-11-07
- Toucher brièvement un endroit creusé : le mineur y marche, et monte tout seul les petites marches.
- Lance-pierre : poser le doigt sur le mineur, tirer en arrière, lâcher. Seul le début du trajet est montré.
- 3 outils en haut à droite : grappin (s'accroche à la roche), rebond (rebondit), perce (casse la terre et le sable). L'outil choisi est retenu.
- Accroché au grappin : un toucher ailleurs le fait lâcher ; si la roche disparaît, il tombe.
- Zoom : pincer à deux doigts, ou boutons − / + en bas à droite (retenu sur l'appareil). Le grattoir garde la même taille sous le doigt : de loin il est large mais lent, de près fin mais rapide.

## 0.1.0 — 2026-11-07
- Première démo : une mine générée au hasard (terre, argile rouge, basalte), avec grottes à stalactites, poches de sable, poches d'eau, minerais, cristaux, fossiles et recharges.
- On gratte la roche du doigt, près du mineur ; les roches dures demandent d'insister.
- Lumière de bougie qui vacille et se propage dans les galeries ; les zones déjà vues restent faiblement visibles ; les nouvelles zones apparaissent en fondu.
- Le mineur tombe dans les trous creusés ; la caméra le suit. Deux doigts pour regarder ailleurs.
- Poussière en grattant, scintillement des minerais, petites vibrations.
