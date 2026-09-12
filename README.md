# Gestionnaire de serveurs ASA

Outil de gestion de serveurs dédiés **ARK: Survival Ascended**, inspiré d'[ASADedicatedManager](https://asadedicatedmanager.eu/). Application web locale : un service Node qui pilote les serveurs, et une interface React consultée dans le navigateur.

---

## Ce que fait l'outil

| Domaine | Fonctions |
|---|---|
| **Comptes** | Authentification par session, trois rôles (administrateur, opérateur, lecteur), gestion des comptes réservée aux administrateurs |
| **Réglages** | Dossier par défaut des serveurs et des sauvegardes, durée des sessions |
| **Profils** | Plusieurs serveurs gérés côte à côte, chacun avec ses ports, sa carte, son dossier d'installation, son cluster |
| **Installation** | Téléchargement de SteamCMD, installation et vérification du serveur (AppID `2430930`, ~11 Gio), lecture du build installé |
| **Cycle de vie** | Démarrage, arrêt gracieux avec préavis diffusés en jeu, redémarrage, annulation d'un arrêt en cours, terminaison forcée |
| **Planification** | Redémarrages quotidiens, mises à jour automatiques, sauvegardes périodiques avec rétention |
| **Configuration** | Édition de `Game.ini` et `GameUserSettings.ini`, en mode assisté ou texte brut, avec un catalogue de **206 réglages** documentés et l'ajout assisté de ceux absents du fichier |
| **Mods** | Liste ordonnée d'identifiants CurseForge, activation individuelle, génération de `-mods=` |
| **RCON** | Console intégrée avec historique, raccourcis, liste des joueurs connectés et de leurs identifiants |
| **Joueurs** | Position en direct et coordonnées carte, inventaire, constructions de tribu avec coordonnées (nécessite le plugin AsaQoL) |
| **Créatures** | Recensement de la carte : espèce, statut sauvage/apprivoisé, niveau, sexe, coordonnées ; recherche et niveau minimum filtrés côté serveur, tri par colonne |
| **Niveaux sauvages** | Niveau minimum et maximum imposés aux créatures sauvages, ventilation en pourcentage par tranche de 10, aperçu de ce que le plugin applique et relevé de la répartition réelle sur la carte |
| **Annonces** | Bandeau à l'écran de tous les joueurs, durée réglable via le plugin, repli sur `Broadcast` sinon |
| **Sauvegardes** | Archives ZIP des mondes et de la configuration, restauration réversible, purge automatique |

L'état des serveurs et les journaux remontent en direct dans l'interface par un flux SSE.

---

## Prérequis

- **Windows.** L'outil lance `ArkAscendedServer.exe` et s'appuie sur `taskkill` et `Expand-Archive`.
- **Node.js 20 ou supérieur** (développé et vérifié sous Node 24).
- Environ **15 Go** libres par serveur installé.

---

## Démarrage

```bash
npm install
```

En développement — API et interface avec rechargement à chaud :

```bash
npm run dev
```

L'interface est alors sur `http://localhost:5273`, l'API sur `http://127.0.0.1:8477`.

En production — l'interface compilée est servie par l'API sur un seul port :

```bash
npm run build && npm start
```

L'outil est ensuite disponible sur `http://127.0.0.1:8477`. **C'est le mode à utiliser dès qu'un serveur de jeu tourne** : voir l'avertissement sur le mode développement plus bas.

### Première connexion

Au tout premier lancement, aucun compte n'existe : l'application affiche un écran de **première configuration** avec l'adresse `sylvain@monheure.fr` pré-remplie. Vous y choisissez le mot de passe — il n'est jamais écrit en clair, seulement sous forme de dérivation scrypt salée. Ce premier compte est forcément administrateur, et l'écran ne peut pas être rejoué une fois le compte créé.

### Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `ASA_MANAGER_PORT` | `8477` | Port d'écoute de l'API |
| `ASA_MANAGER_HOST` | `127.0.0.1` | Interface d'écoute |
| `ASA_MANAGER_DATA` | `./data` | Profils, comptes, réglages, SteamCMD, configurations en attente |
| `ASA_MANAGER_SECURE_COOKIE` | `false` | Passez à `true` derrière un reverse proxy TLS |
| `ASA_MANAGER_LOG_LEVEL` | `info` | Verbosité du journal serveur |

---

## Lancement

Un raccourci **« Gestionnaire de serveurs ASA »** est posé sur le Bureau ; il pointe sur `Lancer-Gestionnaire-ASA.bat` à la racine du projet. Un double-clic démarre le service et ouvre la page une fois qu'elle répond — pas avant, pour éviter une erreur de connexion pendant le démarrage. Relancé alors que le gestionnaire tourne déjà, il se contente d'ouvrir la page au lieu de créer un doublon sur un port occupé.

Fermer la fenêtre arrête le gestionnaire. **Le serveur ARK, lui, continue de tourner** et sera repris au lancement suivant grâce à son fichier PID.

Équivalent en ligne de commande :

```bash
cd E:\Claude\asa-manager && npm start
```

Trois pièges rencontrés en écrivant ce lanceur, qui valent d'être notés :

- **Un fichier `.bat` doit être en CRLF et en ASCII pur.** Avec des fins de ligne LF, `cmd` découpe mal les lignes : les `set "VAR=valeur"` sont tronqués et les commentaires accentués finissent exécutés comme des commandes.
- **`findstr /R /C:"motif"` traite le motif comme une chaîne littérale**, pas comme une expression régulière. La détection du port ne correspondait donc jamais, et le lanceur tentait d'ouvrir un second service sur un port occupé.
- **`localhost` se résout d'abord en IPv6 `::1`**, sur lequel le service n'écoute pas. La sonde interroge donc `127.0.0.1` — 135 ms au lieu de dépasser le délai — tandis que le navigateur ouvre `localhost`, l'origine des sessions déjà ouvertes.

---

## Comptes et rôles

| Rôle | Peut faire |
|---|---|
| **Administrateur** | Tout, plus la gestion des comptes et des réglages de l'application |
| **Opérateur** | Piloter les serveurs, éditer la configuration, les mods, les sauvegardes |
| **Lecteur** | Consulter uniquement : toute requête modifiante est refusée |

Les règles appliquées côté service :

- Toute route `/api/` autre que l'état d'authentification, la première configuration et la connexion exige une session valide.
- Un lecteur reçoit `403` sur toute méthode autre que `GET`.
- Les routes `/api/users` et l'écriture des réglages sont réservées aux administrateurs.
- Le dernier administrateur ne peut être ni rétrogradé ni supprimé, sans quoi la gestion des comptes deviendrait inaccessible.
- Personne ne peut supprimer son propre compte.
- Changer un mot de passe ferme toutes les sessions ouvertes du compte concerné.

L'interface grise les actions interdites, mais **l'autorité reste le service** : le contrôle est fait à chaque requête, indépendamment de ce que l'interface affiche.

### Traitement des mots de passe

Dérivation **scrypt** (N = 16384, r = 8, p = 1, clé de 64 octets) avec un sel aléatoire de 16 octets par compte, comparaison à temps constant. Une tentative de connexion sur une adresse inexistante vérifie quand même un haché factice, pour que la durée de réponse ne révèle pas quelles adresses existent — et le message d'erreur est identique dans les deux cas.

Les sessions sont des jetons de 32 octets aléatoires, transmis par cookie `HttpOnly` en `SameSite=Lax`, et **gardées en mémoire du service** : redémarrer le gestionnaire déconnecte tout le monde. C'est délibéré — un jeton persisté sur disque serait un secret de plus à protéger pour un gain faible sur un outil local.

---

## Réglages de l'application

Accessibles depuis la barre latérale, modifiables par les administrateurs.

| Réglage | Défaut | Effet |
|---|---|---|
| Dossier par défaut des serveurs | `E:\ServersASA` | Dossier parent des nouveaux profils. Chacun reçoit un sous-dossier dérivé de son nom : « Mon Serveur Été » donne `E:\ServersASA\mon-serveur-ete` |
| Dossier par défaut des sauvegardes | vide | Proposé aux nouveaux profils ; vide signifie un dossier `Backups` dans chaque installation |
| Durée d'une session | 12 h | Validité d'une session ouverte |

Changer le dossier par défaut n'affecte **que les profils créés ensuite** : déplacer une installation existante reviendrait à déplacer une dizaine de gigaoctets sous les pieds d'un serveur peut-être en marche. À la création d'un profil, le chemin proposé reste modifiable au cas par cas.

---

## Sécurité — à lire avant d'exposer l'outil

L'accès est protégé par mot de passe, mais deux points restent à connaître :

- **Les mots de passe administrateur des serveurs ARK sont stockés en clair** dans `data/profiles.json` — ARK les exige en clair sur sa ligne de commande, ils ne peuvent pas être hachés. Ceux des comptes du gestionnaire, eux, ne le sont jamais.
- **Le service parle HTTP**, sans TLS. Sur la boucle locale c'est sans conséquence ; sur un réseau, le mot de passe de connexion circulerait en clair.

L'écoute est donc limitée à `127.0.0.1` par défaut. Passer `ASA_MANAGER_HOST` à `0.0.0.0` n'a de sens que derrière un reverse proxy assurant TLS, avec `ASA_MANAGER_SECURE_COOKIE=true`.

---

## Premiers pas

1. **Première configuration** — créez le compte administrateur et choisissez son mot de passe.
2. **Réglages de l'application** — vérifiez le dossier par défaut des serveurs.
3. **Nouveau profil** — donnez un nom ; le dossier est proposé automatiquement.
4. Onglet **Paramètres** — carte, nom de session, ports, mot de passe administrateur du serveur. Ce mot de passe sert aussi de mot de passe RCON : sans lui, l'arrêt gracieux et le comptage des joueurs sont impossibles.
5. Onglet **Vue d'ensemble** → **Installer / Vérifier**. SteamCMD est téléchargé au premier usage, puis le serveur. Comptez un long moment.
6. Onglet **Mods** si nécessaire, puis **Démarrer**.

Le serveur est signalé « En ligne » quand le RCON répond, pas quand le processus démarre : ARK met plusieurs minutes à charger une carte, et le processus existe bien avant d'accepter des joueurs.

---

## Points de conception

### Le parseur INI ne perd rien

`Game.ini` et `GameUserSettings.ini` violent plusieurs hypothèses des parseurs INI courants : une même clé peut apparaître plusieurs fois dans une section (`OverrideNamedEngramEntries`, `LevelExperienceRampOverrides`, `ConfigOverrideItemMaxQuantity`), les valeurs contiennent des `=` et des virgules, et certaines clés portent un indice (`PerLevelStatsMultiplier_Player[0]`).

Un parseur classique écrase les doublons et détruit silencieusement la configuration. Le modèle retenu conserve chaque ligne brute et ne réécrit que la portion valeur des lignes réellement modifiées. Commentaires, ordre, espacement, fins de ligne et clés inconnues du gestionnaire traversent un aller-retour sans altération.

### Les modifications de configuration attendent le redémarrage

ARK réécrit `GameUserSettings.ini` quand le serveur s'arrête. Éditer le fichier pendant que le serveur tourne revient donc à perdre ses changements. Quand le serveur est en marche, l'outil écrit dans un tampon (`data/pending/`), affiche un badge « Modifications en attente », et bascule le tampon vers le vrai fichier juste avant le lancement suivant.

### Le RCON d'ARK n'accepte aucun paquet derrière une commande

Le protocole Source prévoit d'envoyer, juste après une commande, un paquet sentinelle vide dont l'écho marque la fin d'une réponse multi-paquets. **ARK: Survival Ascended ne le supporte pas** : en présence de ce second paquet, le serveur cesse purement et simplement de répondre à la commande.

Constaté sur un serveur réel, trace à l'appui :

| Envoi | Réponse |
|---|---|
| `ListPlayers` seul | `"No Players Connected"` en 6 ms |
| `ListPlayers` + sentinelle | rien, hormis un `Keep Alive` spontané |

Le client n'émet donc **qu'une seule écriture** par commande, et détecte la fin de réponse au silence qui suit le dernier fragment. ARK émet par ailleurs des paquets `Keep Alive` non sollicités portant l'identifiant 0, filtrés côté client.

Cette panne est vicieuse : l'authentification réussit, seules les commandes restent muettes. Le symptôme visible est un arrêt qui semble bloqué, puisque `SaveWorld` et `DoExit` n'atteignent jamais le serveur. Le script `npm run rcon:check` distingue les trois cas (port fermé, mot de passe refusé, commandes sans réponse).

### Le RCON d'ARK ne supporte qu'une connexion à la fois

Une seconde connexion ouverte pendant qu'une première travaille reste sans réponse à l'authentification. Le gestionnaire sonde pourtant les joueurs toutes les 30 secondes, pendant que l'administrateur peut taper une commande et que la séquence d'arrêt enchaîne `SaveWorld` puis `DoExit`.

Sans précaution, les commandes échouent donc **au hasard**, selon qu'une sonde de fond tourne au même instant — le pire type de panne à diagnostiquer. Tous les accès RCON passent en conséquence par une file d'attente, une par serveur (`SerialQueue`). Le délai d'attente est par ailleurs porté à 12 secondes : l'authentification d'ARK est lente tant que la carte finit de charger.

### Sans RCON, l'arrêt gracieux est impossible et doit le dire

Les préavis, la sauvegarde du monde et l'extinction propre passent tous par le RCON. Le gestionnaire vérifie donc qu'il répond **avant** d'entamer la séquence. S'il ne répond pas, il ne diffuse pas des avertissements pendant un quart d'heure dans le vide : il l'écrit dans le journal, prévient que les progrès depuis la dernière sauvegarde automatique seront perdus, et termine directement le processus.

### N'utilisez pas le mode développement pendant qu'un serveur tourne

`npm run dev` lance l'API sous `tsx watch`, qui **tue l'arbre de processus complet** à chaque modification d'un fichier source — serveur ARK compris, sans sauvegarde ni préavis. Le serveur est lancé dans un groupe de processus distinct pour limiter la casse, mais cela ne protège pas d'une terminaison d'arbre.

Pour un usage réel, utilisez `npm run build && npm start` : l'API ne redémarre alors que sur votre décision.

### Les journaux sont lus dans les fichiers, pas sur la sortie standard

Avec AsaApi, le gestionnaire lance `AsaApiLoader.exe`, qui démarre à son tour `ArkAscendedServer.exe` **dans un processus séparé doté de sa propre console**. La sortie du jeu n'arrive donc plus dans le tuyau du processus enfant, et le journal de l'application se vidait de tout ce qui venait du serveur.

Plutôt que de courir après cette sortie, le gestionnaire suit les fichiers qu'ARK et l'API écrivent de toute façon :

| Fichier | Source affichée |
|---|---|
| `ShooterGame/Saved/Logs/ShooterGame.log` | `server` |
| `ShooterGame/Binaries/Win64/logs/ArkApi_*.log` | `plugin` |

C'est plus robuste : indépendant du lanceur, actif même pour un serveur que le gestionnaire n'a pas démarré, et capable de capter ce qui est écrit avant qu'il ne commence à regarder. Le nom du journal d'AsaApi portant l'horodatage du lancement, il est résolu à la volée. Les lignes purement répétitives — télémétrie `GameAnalytics`, passages du ramasse-miettes, notes d'explorateur — sont écartées pour ne pas noyer le journal.

### Un serveur survivant est repris, pas ignoré

Quand le gestionnaire redémarre alors qu'un serveur tourne, il n'a plus de handle sur le processus. Afficher « Arrêté » pendant que des joueurs y jouent serait mensonger, et proposer « Démarrer » ferait naître un second serveur sur les mêmes sauvegardes.

Le fichier PID écrit au lancement permet donc de reprendre la main : le processus est vérifié vivant via `tasklist`, l'état repasse à « En ligne », et le comptage des joueurs reprend. L'arrêt gracieux reste possible, puisqu'il passe par le RCON ; seule la disparition du processus est constatée par scrutation au lieu d'un événement.

### Le gestionnaire ne tue pas les serveurs en s'arrêtant

Redémarrer le gestionnaire — mise à jour, rechargement à chaud en développement — ne doit pas couper une partie en cours. Les processus serveur lui survivent donc. En contrepartie, le gestionnaire perd leur suivi : au lancement suivant, il détecte qu'un `ArkAscendedServer.exe` tourne déjà depuis le dossier du profil et refuse d'en démarrer un second, qui se disputerait les mêmes ports et les mêmes fichiers de sauvegarde.

La réattachement complet à un serveur orphelin (retrouver son état et son journal) n'est pas implémenté : il faut le terminer depuis le gestionnaire des tâches avant de le relancer.

### Un build indéterminé ne déclenche jamais de mise à jour

La détection compare le build installé à celui publié sur la branche publique. Si l'un des deux est illisible, l'outil ne conclut rien : ni « à jour », ni « mise à jour disponible ».

### Le profil fait autorité sur les réglages qu'il affiche

Cinq réglages existent à la fois dans l'onglet Paramètres et dans `GameUserSettings.ini` : nom de session, mot de passe de connexion, mot de passe administrateur, activation et port du RCON.

Les passer uniquement sur la ligne de commande ne suffit pas : ARK **réécrit son fichier INI en s'arrêtant**, et le relit au démarrage suivant. Vider le mot de passe de connexion dans l'interface le retirait donc de la ligne de commande, mais le serveur continuait de lire l'ancienne valeur restée dans le fichier — il restait protégé par un mot de passe que l'interface affichait comme absent.

Ces cinq clés sont donc réécrites dans `GameUserSettings.ini` juste avant chaque lancement, après application des modifications en attente. Les autres réglages du fichier ne sont jamais touchés : si vous éditez ces cinq clés précises depuis l'onglet Configuration, la valeur du profil reprendra la main au démarrage suivant.

### Un corps de requête vide n'est pas une erreur

Beaucoup d'actions de l'API n'ont pas de corps : démarrer un serveur, lancer une installation, supprimer une sauvegarde. Fastify refuse par défaut, en `400`, toute requête annonçant `application/json` avec un corps vide. Un client qui pose cet en-tête par réflexe voit alors toutes ces actions échouer sur un « Bad Request » incompréhensible.

Le correctif est double : le client ne pose l'en-tête que lorsqu'il y a effectivement un corps, et le service traite un corps vide comme un objet vide. Un corps présent mais malformé continue d'être rejeté.

### Les écritures sensibles passent par un fichier temporaire

`profiles.json`, `users.json`, `settings.json` et les sauvegardes sont écrits sous un nom temporaire puis renommés. Une coupure en cours d'écriture ne peut pas laisser un fichier tronqué. Un `users.json` illisible fait échouer le démarrage plutôt que d'être remplacé par une liste vide — sans quoi la première configuration se rouvrirait et donnerait un accès administrateur au premier venu.

### Les niveaux des créatures sauvages ne sont pas un réglage du jeu

ARK **ne sait pas** imposer un niveau minimum aux créatures sauvages, ni pondérer les niveaux. `OverrideOfficialDifficulty` et `DifficultyOffset` ne fixent qu'un plafond — niveau maximum = 30 × difficulté — et les créatures apparaissent ensuite de 1 à ce maximum. Il n'existe aucune clé `.ini` pour un plancher ou une répartition.

L'onglet **Niveaux sauvages** ne modifie donc aucun fichier du jeu : il écrit dans le `config.json` du plugin AsaQoL, qui intercepte l'apparition des créatures et leur impose un niveau tiré selon les tranches configurées. Trois conséquences assumées :

- **Sans le plugin, l'onglet ne peut rien faire.** L'API renvoie 501 plutôt qu'un succès trompeur.
- **L'état affiché vient du plugin, pas du fichier.** Le service écrit la section puis demande `qol.wildlevels reload`, et affiche ce que le plugin déclare appliquer, y compris son indicateur `hooked`. Un fichier correct dont l'interception a échoué serait sinon indiscernable d'un réglage actif.
- **Le fichier du plugin est modifié section par section.** Il contient aussi les points de retour, kits et messages : une réécriture complète les perdrait.

L'onglet distingue trois choses que rien n'oblige à coïncider : ce qui est **saisi**, ce que le plugin **tirerait** (tirage à blanc de 20 000 valeurs qu'il effectue lui-même), et ce qui **vit réellement sur la carte** (relevé d'un échantillon de créatures). Les créatures déjà présentes gardant leur niveau, l'écart entre les deux derniers est normal tant que la faune n'a pas été renouvelée — d'où le bouton qui le fait.

### Les refus d'ARK sont traduits, pas laissés dans le journal

ARK annonce certains refus au milieu de centaines de lignes techniques, puis s'arrête. L'administrateur se retrouve avec un serveur éteint et aucune explication — c'est exactement ce qui s'est produit deux fois avec les mods.

Le suivi du journal reconnaît donc ces lignes et en publie une traduction au niveau *manager* :

| Ligne d'ARK | Message affiché |
|---|---|
| `Error querying server mods: … 404` | identifiant inconnu du catalogue CurseForge |
| `Detected an unavailable mod: <nom> (<id>)` | le mod existe mais n'a aucun fichier publié |

**Un mod ASA ne peut pas être installé localement.** Le serveur délègue ses mods au cœur CurseForge (`"modsDirectoryMode": "CFCore"`) : il ignore un dossier déposé à la main sous `ShooterGame\Binaries\Win64\ShooterGame\Mods`, interroge le catalogue, et s'arrête si la réponse ne convient pas. La cuisson locale du Dev Kit ne sert qu'à remplacer les fichiers d'un mod **déjà publié**.

### L'attente d'un arrêt se juge sur l'activité, pas sur une montre

L'arrêt attendait la fermeture pendant deux minutes fixes, puis forçait la terminaison. Mesure faite sur un serveur réel : après `Closing by request`, l'extinction d'ARK a mis **1 min 43** rien que pour atteindre la fermeture de son rapporteur d'erreurs. Le processus a donc été tué **16 secondes après sa dernière écriture de journal**, alors qu'il travaillait encore — et l'extinction d'ARK est d'autant plus longue que la carte est peuplée, donc le seuil n'aurait fait qu'empirer.

Rien ne distingue un serveur lent d'un serveur bloqué sur la seule durée. Le journal, lui, fait la différence : tant qu'il s'écrit, le processus avance. L'attente se fonde donc sur le silence — 90 secondes sans aucune écriture — avec un plafond absolu pour qu'un journal bavard ne fasse pas patienter indéfiniment.

### Une terminaison forcée n'est acquise qu'une fois constatée

`forceKill` lançait `taskkill` puis rendait la main immédiatement. Rien n'attendait la disparition effective du processus, ne vidait son identifiant, n'effaçait le fichier PID ni ne repassait l'état à « arrêté ». Le profil restait donc figé sur « arrêt en cours » alors que le processus était bel et bien mort, et tout démarrage était refusé par « Le serveur tourne déjà » : un état mensonger, pire qu'une erreur franche.

La terminaison attend désormais la disparition constatée avant de nettoyer. Si le processus survit au-delà de 30 secondes, l'état passe en erreur avec un message nommant le PID, plutôt que de rester bloqué.

### Les fichiers de l'interface sont résolus à la demande

`@fastify/static` était enregistré avec `wildcard: false`, ce qui déclare **une route par fichier présent au démarrage**. Conséquence : après un `npm run build`, les nouveaux assets — dont le nom porte une empreinte qui change à chaque construction — n'avaient plus de route et retombaient sur le repli de l'application React. Le serveur répondait donc `200 text/html` à une requête de module JavaScript, et le navigateur affichait une page blanche avec une erreur de type MIME plutôt qu'un `404` explicite.

La résolution se fait désormais à la demande. Un fichier créé après le démarrage est servi avec le bon type, et une route inconnue retombe toujours sur l'application React.

### La restauration est réversible

Restaurer une archive commence par archiver l'état courant sous `avant-restauration-*.zip`. La restauration exige par ailleurs un serveur arrêté, faute de quoi ARK réécrirait les fichiers en s'éteignant et annulerait l'opération.

---

## Structure

```
shared/types.ts          Types partagés entre l'API et l'interface
server/src/
  index.ts               Bootstrap Fastify, arrêt propre
  plugins/
    jsonBody.ts          Tolérance aux corps JSON vides (+ jsonBody.test.ts)
  routes/
    api.ts               Routes métier et flux SSE
    auth.ts              Garde globale, authentification, comptes, réglages
  services/
    ini.ts               Parseur INI sans perte      (+ ini.test.ts)
    rcon.ts              Client RCON Source          (+ rcon.test.ts)
    users.ts             Comptes, scrypt, sessions   (+ users.test.ts)
    serialQueue.ts       File d'exécution par clé    (+ serialQueue.test.ts)
    settings.ts          Réglages globaux, dérivation des dossiers
    iniFiles.ts          Lecture/écriture, tampon d'attente
    serverProcess.ts     Lancement, supervision, arrêt gracieux (+ serverProcess.test.ts)
    steamcmd.ts          Installation et mise à jour
    backup.ts            Archivage, rétention, restauration
    scheduler.ts         Redémarrages, mises à jour, sauvegardes
    store.ts             Persistance des profils
    settingsCatalog.ts   Libellés français des réglages ARK connus
    wildLevels.ts        Niveaux des créatures sauvages via le plugin (+ wildLevels.test.ts)
    paths.ts             Disposition des dossiers, AppID
web/src/                 Interface React (composants par écran et par onglet)
```

---

## Tests

```bash
npm test
```

**99 tests** couvrent les endroits où une erreur silencieuse coûterait le plus cher :

- **Parseur INI** — aller-retour sans perte, clés dupliquées, commentaires contenant un `=`, suppressions multiples, création de section.
- **Client RCON** — encodage, fragments TCP coupés, authentification refusée, réponses multi-paquets, absence de paquet sentinelle derrière une commande, serveur reproduisant le comportement d'ARK, `Keep Alive` spontanés.
- **Comptes** — hachage et vérification, sel aléatoire, absence de mot de passe en clair sur disque, normalisation des adresses, indiscernabilité entre compte inexistant et mot de passe erroné, invalidation des sessions, protection du dernier administrateur.
- **Corps de requête** — un corps JSON vide est accepté, un corps invalide reste rejeté (voir ci-dessous).
- **File d'exécution** — absence de chevauchement à clé égale, parallélisme entre clés différentes, ordre respecté, une tâche en échec ne bloque pas la suite.
- **Réconciliation INI** — un mot de passe vidé dans le profil efface bien celui resté dans le fichier, les réglages non pilotés et les commentaires sont préservés, un fichier déjà conforme n'est pas réécrit.
- **Niveaux sauvages** — bornes incohérentes recalées plutôt que refusées, tranches saisies à l'envers échangées, tranches de part nulle ou hors bornes écartées avant d'être affichées comme actives, découpage par dizaines aligné, normalisation des parts sans division par zéro.
- **Attente d'arrêt** — un serveur lent mais actif continue d'être attendu, un serveur silencieux est abandonné, le silence se compte depuis la dernière écriture et non depuis le début, et le plafond absolu prime sur une activité continue.
- **Traduction des pannes d'ARK** — un mod sans fichier publié est annoncé avec son nom et son numéro, un identifiant inconnu du catalogue est signalé, un nom contenant parenthèses et espaces reste lisible, et une ligne de journal ordinaire ne déclenche rien.
- **Suivi des journaux** — les lignes ajoutées sont remontées sans rejouer l'historique, une ligne incomplète attend sa fin, un fichier tronqué est relu depuis le début, le bruit est écarté, et un journal apparaissant tardivement est capté dès sa création.

### Diagnostics

```bash
npm run rcon:check
```

Se connecte au RCON du premier profil enregistré (ou de celui passé en argument) et distingue les pannes qui se ressemblent depuis l'interface : port fermé, mot de passe refusé, ou commandes sans réponse.

```bash
npm run start:check
```

Déroule le chemin de démarrage complet — vérifications, lancement, attente de disponibilité, commande RCON — puis arrête le serveur. Chronomètre chaque étape, ce qui rend visible toute lenteur introduite avant le lancement.

---

## État de validation

**Vérifié :**

- 99/99 tests unitaires, dont le client RCON contre un vrai serveur TCP factice.
- `tsc` sans erreur sur l'API et sur l'interface ; build de production réussi.
- Parcours navigateur complet : première configuration, session administrateur, écrans de réglages et de comptes, sept onglets de profil.
- Contrôle d'accès éprouvé par requêtes réelles : `401` sans session et après déconnexion, première configuration non rejouable (`400`), et pour un compte lecteur `200` en lecture mais `403` sur le démarrage d'un serveur, la liste des comptes et l'écriture des réglages.
- Dérivation du dossier d'installation : « Mon Serveur Été » → `E:\ServersASA\mon-serveur-ete` ; un chemin explicite est respecté tel quel ; un nom vide est refusé.
- Aller-retour complet d'un `Game.ini` par HTTP : texte restitué à l'identique, commentaire contenant un `=` préservé, CRLF conservés, modification ciblée de la seconde occurrence d'une clé dupliquée sans toucher à la première.
- Journaux transmis en direct par SSE.
- Requête sans corps annonçant `application/json` : atteint désormais la route au lieu d'être rejetée en « Bad Request » par le parseur, tandis qu'un corps valide reste traité normalement.

**Vérifié contre un vrai serveur ARK :**

- Installation SteamCMD complète (~12 Go) et lancement d'`ArkAscendedServer.exe` jusqu'à *« Server has completed startup and is now advertising for join »*.
- Ports 7777 (UDP), 27015 (UDP) et 27020 (TCP) effectivement en écoute.
- Cycle complet `npm run start:check` : lancement rendu en 436 ms, serveur en ligne après 50 s, `ListPlayers` répondant, puis arrêt gracieux effectif — `SaveWorld` et `DoExit` reçus, sans recours à la terminaison forcée.
- RCON : authentification et commandes, dont la trace protocolaire qui a mis au jour le rejet du paquet sentinelle par ARK et l'intolérance aux connexions concurrentes.
- **Niveaux des créatures sauvages appliqués et mesurés.** Consigne : minimum 100, maximum 150, ventilation 40/25/20/10/5 % par tranche de 10. Avant : population sauvage de niveaux 1 à 19. Après renouvellement de la faune : échantillon de 200 créatures, minimum 100, maximum 150, parts relevées 42,5 / 18,5 / 23,5 / 12,5 / 3,0 %. Le tirage à blanc du plugin sur 20 000 valeurs donne 39,8 / 25,4 / 20,1 / 10,0 / 4,6 %.
- **Un joueur réel connecté depuis le client du jeu**, apparaissant dans l'onglet Console RCON avec son identifiant EOS, la console acceptant `ServerChat`.
- Réconciliation INI effective : un mot de passe de connexion vidé dans le profil laisse bien `ServerPassword=` dans le fichier au lancement suivant, et le serveur devient public.

**Non vérifié :**

- Mise à jour incrémentale par SteamCMD sur une nouvelle version du jeu.
- Préavis diffusés à des joueurs réellement connectés.
- Chargement effectif des mods, sauvegardes et restaurations sur des données de partie conséquentes.
- Rendu de l'onglet **Niveaux sauvages** dans le navigateur : l'application exige une session, et le mot de passe appartient à son propriétaire. Les routes et le panneau sont présents dans la construction, le service et le plugin sont éprouvés bout en bout par RCON.

---

## Écarts avec ASADedicatedManager

Non couverts pour l'instant : bot Discord, CDN privé de mise à jour, mise à jour échelonnée entre serveurs d'un cluster, verrouillage en lecture seule des fichiers de configuration, traductions au-delà du français.
