# Tunnel — journal des nouveautés

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
