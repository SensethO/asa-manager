import type { IniFileName, SettingDescriptor } from '../../../shared/types.js';

/**
 * Catalogue des reglages d'ARK: Survival Ascended.
 *
 * Source : documentation officielle (ark.wiki.gg/wiki/Server_configuration),
 * filtree sur les entrees marquees compatibles ASA. Les noms, types et valeurs
 * par defaut en sont extraits tels quels ; les libelles et descriptions sont
 * traduits.
 *
 * Ce catalogue sert uniquement a l'affichage et a l'ajout assiste. L'editeur
 * presente aussi toute cle absente d'ici, en texte libre : ARK en ajoute a
 * chaque mise a jour, et une cle inconnue du gestionnaire ne doit jamais
 * devenir invisible ni non modifiable.
 */

const SERVER_SETTINGS = 'ServerSettings';
const GAME_MODE = '/Script/ShooterGame.ShooterGameMode';

type Type = SettingDescriptor['type'];

/** [cle, type, valeur par defaut, libelle, description, avance ?] */
type Entry = [string, Type, string, string, string, true?];

// --- GameUserSettings.ini / [ServerSettings] --------------------------------

const SERVER: Entry[] = [
  ['ActiveMods', 'string', '', 'Mods actifs', "Identifiants de mods separes par des virgules, sans espace. L'ordre fixe la priorite de chargement.", true],
  ['ActiveMapMod', 'string', '', 'Mod de carte actif', 'Identifiant du mod fournissant la carte a charger.'],
  ['AdminLogging', 'bool', 'False', 'Journaliser les commandes admin', 'Affiche toutes les commandes administrateur dans le chat du jeu.'],
  ['AllowAnyoneBabyImprintCuddle', 'bool', 'False', 'Empreinte par tous', "Autorise n'importe qui a s'occuper d'un bebe, pas seulement celui qui l'a fait eclore."],
  ['AllowCaveBuildingPvE', 'bool', 'False', 'Construction en grotte (PVE)', 'Autorise les constructions dans les grottes en mode PVE.'],
  ['AllowCaveBuildingPvP', 'bool', 'True', 'Construction en grotte (PVP)', 'Mettre a False empeche de construire dans les grottes en mode PVP.'],
  ['AllowCryoFridgeOnSaddle', 'bool', 'False', 'Cryofrigo sur plateforme', 'Autorise les cryofrigos sur les selles-plateformes et les radeaux.'],
  ['AllowFlyerCarryPvE', 'bool', 'False', 'Portage par volant (PVE)', 'Autorise les creatures volantes a saisir des creatures sauvages en PVE.'],
  ['AllowHideDamageSourceFromLogs', 'bool', 'True', "Masquer l'origine des degats", 'Mettre a False affiche la source des degats dans les journaux de tribu.'],
  ['AllowHitMarkers', 'bool', 'True', 'Marqueurs de touche', 'Mettre a False desactive les marqueurs des attaques a distance.'],
  ['AllowMultipleAttachedC4', 'bool', 'False', 'Plusieurs C4 par creature', "Autorise a fixer plus d'un C4 sur une meme creature."],
  ['AllowRaidDinoFeeding', 'bool', 'False', 'Nourrir les creatures de raid', 'Permet de tamer definitivement les Titanosaures en les nourrissant.'],
  ['AllowThirdPersonPlayer', 'bool', 'True', 'Vue a la troisieme personne', 'Mettre a False impose la vue subjective.'],
  ['AlwaysAllowStructurePickup', 'bool', 'False', 'Ramassage sans delai', 'Supprime le compte a rebours du ramassage rapide des structures.'],
  ['ArmadoggoDeathCooldown', 'float', '3600', 'Delai de retour de l Armadoggo', "Temps en secondes avant qu'un Armadoggo ne reapparaisse apres des degats mortels."],
  ['AutoSavePeriodMinutes', 'float', '15.0', 'Periode de sauvegarde automatique', 'Intervalle en minutes entre deux sauvegardes du monde. 0 provoque des sauvegardes continues.'],
  ['BanListURL', 'string', '', 'Liste de bannissement distante', 'URL entre guillemets, relue toutes les dix minutes.'],
  ['ClampItemSpoilingTimes', 'bool', 'False', 'Plafonner la peremption', "Limite les durees de peremption au maximum propre a chaque objet."],
  ['ClampResourceHarvestDamage', 'bool', 'False', 'Plafonner les degats de recolte', "Limite les degats infliges a une ressource par une creature lors de la recolte."],
  ['CosmeticWhitelistOverride', 'string', '', 'Cosmetiques autorises', 'URL vers la liste blanche des cosmetiques personnalises.'],
  ['CosmoWeaponAmmoReloadAmount', 'float', '1', 'Recharge du lance-toile Cosmo', 'Quantite de munitions regeneree progressivement par le lance-toile.'],
  ['CustomLiveTuningUrl', 'string', '', 'Reglage a chaud', 'Lien direct vers le fichier de reglage dynamique.'],
  ['DayCycleSpeedScale', 'float', '1.0', 'Vitesse du cycle jour/nuit', "Facteur d'ecoulement du temps sur le cycle complet."],
  ['DayTimeSpeedScale', 'float', '1.0', 'Vitesse du jour', "Facteur d'ecoulement du temps pendant la journee."],
  ['DestroyTamesOverTheSoftTameLimit', 'bool', 'False', 'Detruire au-dela de la limite souple', 'Les creatures depassant la limite souple sont marquees puis supprimees.'],
  ['DifficultyOffset', 'float', '1.0', 'Decalage de difficulte', 'Entre 0 et 1. Combine a la difficulte forcee, fixe le niveau des creatures.', ],
  ['DinoCharacterFoodDrainMultiplier', 'float', '1.0', 'Faim des creatures', 'Une valeur haute accelere la consommation de nourriture des creatures.'],
  ['DinoCharacterHealthRecoveryMultiplier', 'float', '1.0', 'Regeneration des creatures', 'Une valeur haute accelere la recuperation de vie des creatures.'],
  ['DinoCharacterStaminaDrainMultiplier', 'float', '1.0', 'Endurance des creatures', "Une valeur haute accelere la consommation d'endurance des creatures."],
  ['DinoDamageMultiplier', 'float', '1.0', 'Degats des creatures sauvages', 'Multiplie les degats infliges par les creatures sauvages.'],
  ['DinoResistanceMultiplier', 'float', '1.0', 'Resistance des creatures sauvages', 'Une valeur basse rend les creatures sauvages plus resistantes.'],
  ['DisableBurrowDecayTimers', 'bool', 'False', 'Desactiver la decrepitude des terriers', 'Supprime entierement les minuteurs de decrepitude des terriers de Burrowbuck.'],
  ['DisableCryopodEnemyCheck', 'bool', 'False', 'Cryopode pres des ennemis', "Autorise l'usage des cryopodes en presence d'ennemis."],
  ['DisableCryopodFridgeRequirement', 'bool', 'False', 'Cryopode sans frigo', "Autorise l'usage des cryopodes hors de portee d'un cryofrigo."],
  ['DisableDinoDecayPvE', 'bool', 'False', 'Desactiver la decrepitude des creatures (PVE)', 'Empeche les creatures apprivoisees de deperir en PVE.'],
  ['DisableImprintDinoBuff', 'bool', 'False', "Desactiver le bonus d'empreinte", "Supprime le bonus de statistiques accorde par l'empreinte."],
  ['DisablePvEGamma', 'bool', 'False', 'Interdire le gamma (PVE)', 'Empeche la commande console gamma en mode PVE.'],
  ['DisableStructureDecayPvE', 'bool', 'False', 'Desactiver la decrepitude des structures', 'Empeche la degradation automatique des constructions.'],
  ['DisableWeatherFog', 'bool', 'False', 'Desactiver le brouillard', 'Supprime le brouillard meteorologique.'],
  ['DontAlwaysNotifyPlayerJoined', 'bool', 'False', 'Masquer les connexions', 'Desactive les notifications de connexion des joueurs.'],
  ['EnableExtraStructurePreventionVolumes', 'bool', 'False', 'Zones interdites supplementaires', 'Interdit la construction dans certaines zones riches en ressources.'],
  ['EnablePvPGamma', 'bool', 'False', 'Autoriser le gamma (PVP)', 'Autorise la commande console gamma en mode PVP.'],
  ['ForceAllStructureLocking', 'bool', 'False', 'Verrouiller par defaut', 'Toutes les structures sont verrouillees a la construction.'],
  ['ForceGachaUnhappyInCaves', 'bool', 'True', 'Gachas malheureux en grotte', 'Les Gachas deviennent malheureux dans les grottes.'],
  ['globalVoiceChat', 'bool', 'False', 'Chat vocal global', 'Rend le chat vocal audible par tout le serveur.'],
  ['HarvestAmountMultiplier', 'float', '1.0', 'Quantite recoltee', 'Multiplie le rendement de toutes les activites de recolte.'],
  ['HarvestHealthMultiplier', 'float', '1.0', 'Resistance des ressources', 'Multiplie la vie des elements recoltables : ils fournissent davantage avant de disparaitre.'],
  ['IgnoreLimitMaxStructuresInRangeTypeFlag', 'bool', 'False', 'Ignorer la limite de decorations', 'Supprime la limite de 150 structures decoratives dans une zone.'],
  ['IgnorePVPMountedWeaponryRestrictions', 'bool', 'False', 'Armes montees sans restriction', 'Autorise les armes en monture sur les creatures normalement exclues.'],
  ['ImplantSuicideCD', 'float', '28800', 'Delai entre deux suicides', "Temps en secondes entre deux usages de l'implant pour se suicider."],
  ['ItemStackSizeMultiplier', 'float', '1.0', 'Taille des piles', 'Multiplie globalement le nombre d objets par pile.'],
  ['KickIdlePlayersPeriod', 'float', '3600.0', 'Expulsion des inactifs', "Duree d'inactivite en secondes avant expulsion."],
  ['MaxCosmoWeaponAmmo', 'float', '-1', 'Munitions maximales du Cosmo', 'Plafond de munitions du lance-toile. -1 conserve la valeur du jeu.'],
  ['MaxPersonalTamedDinos', 'int', '0', 'Creatures par tribu', 'Limite de creatures apprivoisees par tribu. 0 desactive la limite.'],
  ['MaxTamedDinos', 'float', '5000.0', 'Creatures sur le serveur', 'Nombre maximal de creatures apprivoisees, toutes tribus confondues.'],
  ['MaxTamedDinos_SoftTameLimit', 'int', '5000', 'Limite souple de creatures', 'Seuil au-dela duquel les creatures sont marquees pour suppression differee.'],
  ['MaxTamedDinos_SoftTameLimit_CountdownForDeletionDuration', 'int', '604800', 'Delai avant suppression', 'Temps en secondes avant destruction des creatures au-dela de la limite souple.'],
  ['MaxTrainCars', 'int', '8', 'Wagons par train', 'Nombre maximal de wagons attelables a un train.'],
  ['MaxTributeDinos', 'int', '20', 'Creatures televersables', 'Emplacements pour les creatures deposees dans les donnees ARK.'],
  ['MaxTributeItems', 'int', '50', 'Objets televersables', 'Emplacements pour les objets et ressources deposes dans les donnees ARK.'],
  ['NightTimeSpeedScale', 'float', '1.0', 'Vitesse de la nuit', "Facteur d'ecoulement du temps pendant la nuit."],
  ['NonPermanentDiseases', 'bool', 'False', 'Maladies non permanentes', 'Les maladies permanentes disparaissent a la reapparition du joueur.'],
  ['OverrideOfficialDifficulty', 'float', '0.0', 'Difficulte forcee', 'Niveau maximal des creatures = valeur x 30. 5 donne des creatures jusqu au niveau 150.'],
  ['OverrideStructurePlatformPrevention', 'bool', 'False', 'Tourelles sur plateforme', 'Rend les tourelles constructibles et fonctionnelles sur les selles-plateformes.'],
  ['OxygenSwimSpeedStatMultiplier', 'float', '1.0', 'Vitesse de nage par oxygene', "Multiplie le gain de vitesse de nage apporte par les points d'oxygene."],
  ['PerPlatformMaxStructuresMultiplier', 'float', '1.0', 'Structures par plateforme', 'Multiplie le nombre de structures posables sur selles et radeaux.'],
  ['PlatformSaddleBuildAreaBoundsMultiplier', 'float', '1.0', 'Portee de construction sur plateforme', 'Autorise a construire plus loin du centre de la plateforme.'],
  ['PlayerCharacterFoodDrainMultiplier', 'float', '1.0', 'Faim des joueurs', 'Une valeur haute accelere la consommation de nourriture des joueurs.'],
  ['PlayerCharacterHealthRecoveryMultiplier', 'float', '1.0', 'Regeneration des joueurs', 'Une valeur haute accelere la recuperation de vie des joueurs.'],
  ['PlayerCharacterStaminaDrainMultiplier', 'float', '1.0', 'Endurance des joueurs', "Une valeur haute accelere la consommation d'endurance des joueurs."],
  ['PlayerCharacterWaterDrainMultiplier', 'float', '1.0', 'Soif des joueurs', "Une valeur haute accelere la consommation d'eau des joueurs."],
  ['PlayerDamageMultiplier', 'float', '1.0', 'Degats des joueurs', 'Multiplie les degats infliges par les joueurs.'],
  ['PlayerResistanceMultiplier', 'float', '1.0', 'Resistance des joueurs', 'Une valeur basse rend les joueurs plus resistants.'],
  ['PreventDiseases', 'bool', 'False', 'Supprimer les maladies', 'Desactive completement les maladies, dont la fievre des marais.'],
  ['PreventMateBoost', 'bool', 'False', 'Supprimer le bonus de couple', 'Desactive le bonus accorde aux creatures accouplees.'],
  ['PreventOfflinePvP', 'bool', 'False', 'Protection hors ligne', 'Active la protection des tribus dont tous les membres sont deconnectes.'],
  ['PreventOfflinePvPInterval', 'float', '0.0', 'Delai de protection hors ligne', 'Secondes avant activation de la protection apres la derniere deconnexion.'],
  ['PreventSpawnAnimations', 'bool', 'False', 'Supprimer l animation de reveil', 'Les joueurs apparaissent sans animation de reveil.'],
  ['PreventTribeAlliances', 'bool', 'False', 'Interdire les alliances', 'Empeche les tribus de former des alliances.'],
  ['ProximityChat', 'bool', 'False', 'Chat de proximite', 'Seuls les joueurs proches voient les messages ecrits.'],
  ['PvEAllowStructuresAtSupplyDrops', 'bool', 'False', 'Construire pres des largages (PVE)', 'Autorise la construction pres des points de largage en PVE.'],
  ['PvEDinoDecayPeriodMultiplier', 'float', '1.0', 'Decrepitude des creatures (PVE)', 'Multiplie le delai de deperissement des creatures en PVE.'],
  ['PvPDinoDecay', 'bool', 'False', 'Decrepitude des creatures (PVP)', 'Active le deperissement des creatures pendant la protection hors ligne.'],
  ['RaidDinoCharacterFoodDrainMultiplier', 'float', '1.0', 'Faim des creatures de raid', 'Vitesse a laquelle les creatures de raid, comme le Titanosaure, ont faim.'],
  ['RandomSupplyCratePoints', 'bool', 'False', 'Largages aleatoires', 'Place les caisses de ravitaillement a des endroits aleatoires.'],
  ['RCONPort', 'int', '27020', 'Port RCON', 'Port TCP du RCON. A ne pas exposer publiquement.'],
  ['RCONServerGameLogBuffer', 'float', '600.0', 'Tampon de journal RCON', 'Nombre de lignes de journal transmises par le RCON.'],
  ['ResourcesRespawnPeriodMultiplier', 'float', '1.0', 'Repousse des ressources', 'Une valeur basse accelere la reapparition des arbres, rochers et buissons.'],
  ['ServerAdminPassword', 'string', '', 'Mot de passe administrateur', 'Necessaire pour les commandes admin et le RCON.'],
  ['ServerCrosshair', 'bool', 'True', 'Reticule de visee', 'Mettre a False supprime le reticule au centre de l ecran.'],
  ['ServerForceNoHUD', 'bool', 'False', 'Masquer l interface', 'Masque en permanence le HUD des creatures hors tribu.'],
  ['ServerHardcore', 'bool', 'False', 'Mode hardcore', 'A la mort, le personnage repart au niveau 1.'],
  ['ServerPassword', 'string', '', 'Mot de passe du serveur', 'Exige ce mot de passe pour rejoindre. Vide = serveur public.'],
  ['serverPVE', 'bool', 'False', 'Mode PVE', 'Desactive le PVP et active le PVE.'],
  ['ShowFloatingDamageText', 'bool', 'False', 'Degats affiches', 'Affiche les degats en chiffres flottants, facon jeu de role.'],
  ['ShowMapPlayerLocation', 'bool', 'True', 'Position sur la carte', 'Mettre a False masque au joueur sa propre position precise.'],
  ['StructurePickupHoldDuration', 'float', '0.5', 'Duree de maintien au ramassage', 'Temps de maintien pour le ramassage rapide. 0 le rend instantane.'],
  ['StructurePickupTimeAfterPlacement', 'float', '30.0', 'Fenetre de ramassage', 'Secondes apres la pose pendant lesquelles le ramassage rapide reste possible.'],
  ['StructurePreventResourceRadiusMultiplier', 'float', '1.0', 'Rayon de blocage des ressources', 'Controle la distance a laquelle les structures empechent la repousse.'],
  ['StructureResistanceMultiplier', 'float', '1.0', 'Resistance des structures', 'Une valeur basse rend les structures plus resistantes.'],
  ['TamingSpeedMultiplier', 'float', '1.0', 'Vitesse d apprivoisement', 'Une valeur haute accelere l apprivoisement.'],
  ['TheMaxStructuresInRange', 'int', '10500', 'Structures par zone', 'Nombre maximal de structures constructibles dans une meme zone.'],
  ['TribeNameChangeCooldown', 'float', '15.0', 'Delai de renommage de tribu', 'Minutes entre deux changements de nom de tribu.'],
  ['UseAstraeosTraversalBuff', 'bool', 'True', 'Teleportation de biome (Astraeos)', 'Active la teleportation entre biomes en maintenant la touche dediee.'],
  ['XPMultiplier', 'float', '1.0', "Multiplicateur d'experience", 'Multiplie l experience gagnee par les joueurs, tribus et creatures.'],
  ['YoungIceFoxDeathCooldown', 'float', '3600', 'Delai de retour du Veilwyn', 'Temps en secondes avant reapparition apres des degats mortels.'],
  ['CrossARKAllowForeignDinoDownloads', 'bool', 'False', 'Creatures etrangeres sur Aberration', 'Autorise le telechargement de creatures non natives sur Aberration.'],
  ['noTributeDownloads', 'bool', 'False', 'Bloquer tous les telechargements', 'Empeche toute recuperation depuis les donnees ARK.'],
  ['PreventDownloadDinos', 'bool', 'False', 'Bloquer le telechargement de creatures', 'Empeche de recuperer des creatures depuis les donnees ARK.'],
  ['PreventDownloadItems', 'bool', 'False', 'Bloquer le telechargement d objets', 'Empeche de recuperer des objets depuis les donnees ARK.'],
  ['PreventDownloadSurvivors', 'bool', 'False', 'Bloquer le telechargement de survivants', 'Empeche de recuperer des personnages depuis les donnees ARK.'],
  ['PreventUploadDinos', 'bool', 'False', 'Bloquer le televersement de creatures', 'Empeche de deposer des creatures dans les donnees ARK.'],
  ['PreventUploadItems', 'bool', 'False', 'Bloquer le televersement d objets', 'Empeche de deposer des objets dans les donnees ARK.'],
  ['PreventUploadSurvivors', 'bool', 'False', 'Bloquer le televersement de survivants', 'Empeche de deposer des personnages dans les donnees ARK.'],
  ['BadWordListURL', 'string', '', 'Liste de mots interdits', 'URL de la liste des mots filtres dans les noms et le chat.'],
  ['BadWordWhiteListURL', 'string', '', 'Exceptions aux mots interdits', 'URL de la liste des mots explicitement autorises.'],
  ['LimitBunkersPerTribe', 'bool', 'True', 'Limiter les bunkers par tribu', 'Applique un plafond de bunkers par tribu.'],
  ['LimitBunkersPerTribeNum', 'int', '3', 'Bunkers par tribu', 'Nombre de bunkers autorises par tribu.'],
  ['AllowBunkersInPreventionZones', 'bool', 'False', 'Bunkers en zone interdite', 'Autorise les bunkers dans les zones de construction interdite.'],
  ['AllowRidingDinosInsideBunkers', 'bool', 'True', 'Montures dans les bunkers', 'Autorise a circuler en monture a l interieur des bunkers.'],
  ['AllowBunkerModulesAboveGround', 'bool', 'False', 'Modules de bunker en surface', 'Autorise la pose de modules de bunker hors sous-sol.'],
  ['AllowDinoAIInsideBunkers', 'bool', 'True', 'Creatures actives dans les bunkers', "Laisse l'intelligence artificielle des creatures fonctionner dans les bunkers."],
  ['AllowBunkerModulesInPreventionZones', 'bool', 'False', 'Modules en zone interdite', 'Autorise les modules de bunker dans les zones de construction interdite.'],
  ['MinDistanceBetweenBunkers', 'float', '3000.0', 'Distance entre bunkers', 'Distance minimale, en unites Unreal, entre deux bunkers.'],
  ['EnemyAccessBunkerHPThreshold', 'float', '0.25', 'Seuil d acces ennemi au bunker', 'Fraction de points de vie sous laquelle un bunker devient accessible aux ennemis.'],
  ['BunkerUnderHPThresholdDmgMultiplier', 'float', '0.05', 'Degats sous le seuil', 'Multiplicateur de degats appliques a un bunker sous son seuil de vie.'],
  ['CryoHospitalHoursToRegenHP', 'float', '1.0', 'Heures pour regenerer la vie', 'Duree de soin en cryo-hopital pour restaurer les points de vie.'],
  ['CryoHospitalHoursToRegenFood', 'float', '24.0', 'Heures pour regenerer la nourriture', 'Duree de soin en cryo-hopital pour restaurer la satiete.'],
  ['CryoHospitalHoursToDrainTorpor', 'float', '1.0', 'Heures pour dissiper la torpeur', 'Duree de soin en cryo-hopital pour faire retomber la torpeur.'],
  ['CryoHospitalMatingCooldownReduction', 'float', '2.0', 'Reduction du delai de reproduction', 'Facteur de reduction du delai entre deux accouplements apres soin.'],
  ['BloodforgeReinforceExtraDurability', 'float', '0.3', 'Durabilite du renforcement', 'Durabilite supplementaire apportee par le renforcement a la forge de sang.'],
  ['BloodforgeReinforceResourceCostMultiplier', 'float', '3.0', 'Cout du renforcement', 'Multiplie le cout en ressources du renforcement.'],
  ['BloodforgeReinforceSpeedMultiplier', 'float', '0.1', 'Vitesse du renforcement', 'Multiplie la vitesse du renforcement a la forge de sang.'],
  ['MaxActiveOutposts', 'int', '', 'Avant-postes actifs', "Nombre maximal d'avant-postes actifs simultanement."],
  ['MaxActiveResourceCaches', 'int', '', 'Caches de ressources actives', 'Nombre maximal de caches de ressources actives simultanement.'],
  ['MaxActiveCityOutposts', 'int', '', 'Avant-postes urbains actifs', "Nombre maximal d'avant-postes urbains actifs simultanement."],
  ['OutpostSigilRewardMultiplier', 'float', '1.0', 'Recompenses des avant-postes', 'Multiplie les sceaux gagnes lors des missions d avant-poste.'],
  ['AdminListURL', 'string', '', 'Liste d administrateurs distante', 'URL remplacant le fichier local des comptes administrateurs.'],
  ['AutoRestartIntervalSeconds', 'float', '', 'Redemarrage automatique', 'Secondes avant redemarrage automatique du serveur. Non documente officiellement.'],
  ['UpdateAllowedCheatersInterval', 'float', '600.0', 'Rafraichissement des administrateurs', 'Secondes entre deux relectures de la liste distante d administrateurs.'],
  ['UseCharacterTracker', 'bool', 'False', 'Suivi des personnages', 'Active le systeme de suivi des donnees de personnage.'],
];

// --- Game.ini / [/Script/ShooterGame.ShooterGameMode] -----------------------

const GAME: Entry[] = [
  ['BabyCuddleGracePeriodMultiplier', 'float', '1.0', 'Tolerance avant perte d empreinte', "Multiplie le delai avant que la qualite d'empreinte ne commence a baisser."],
  ['BabyCuddleIntervalMultiplier', 'float', '1.0', 'Intervalle de calins', 'Une valeur basse rapproche les demandes d attention des bebes.'],
  ['BabyCuddleLoseImprintQualitySpeedMultiplier', 'float', '1.0', 'Vitesse de perte d empreinte', "Multiplie la vitesse a laquelle la qualite d'empreinte se degrade."],
  ['BabyFoodConsumptionSpeedMultiplier', 'float', '1.0', 'Faim des bebes', 'Une valeur basse ralentit la consommation de nourriture des bebes.'],
  ['BabyImprintAmountMultiplier', 'float', '1.0', "Gain par empreinte", 'Multiplie le pourcentage accorde par chaque empreinte.'],
  ['BabyImprintingStatScaleMultiplier', 'float', '1.0', "Effet de l'empreinte", "Multiplie l'effet de l'empreinte sur les statistiques. 0 le desactive."],
  ['BabyMatureSpeedMultiplier', 'float', '1.0', 'Vitesse de croissance', 'Une valeur haute accelere la maturation des bebes.'],
  ['bAllowFlyerSpeedLeveling', 'bool', 'False', 'Vitesse ameliorable des volants', 'Autorise a monter la vitesse de deplacement des creatures volantes.'],
  ['bAllowSpeedLeveling', 'bool', 'False', 'Vitesse ameliorable', 'Autorise joueurs et creatures terrestres a monter leur vitesse de deplacement.'],
  ['bAllowUnlimitedRespecs', 'bool', 'False', 'Reinitialisations illimitees', 'Supprime le delai de 24 heures entre deux toniques mnemoniques.'],
  ['bDisableFriendlyFire', 'bool', 'False', 'Desactiver le tir ami', 'Empeche les degats entre membres d une meme tribu.'],
  ['bDisablePhotoMode', 'bool', 'False', 'Desactiver le mode photo', 'Interdit le mode photo.'],
  ['bDisableStructurePlacementCollision', 'bool', 'False', 'Ignorer les collisions de placement', 'Permet aux structures de traverser le decor.'],
  ['bDisableWirelessCrafting', 'bool', 'False', 'Desactiver la fabrication sans fil', 'Empeche de fabriquer a distance depuis le stockage Tek dedie.'],
  ['bDisableWirelessCraftingForDinos', 'bool', 'False', 'Fabrication sans fil : creatures', 'Empeche la fabrication sans fil depuis l inventaire d une creature.'],
  ['bDisableWirelessCraftingForPlayers', 'bool', 'False', 'Fabrication sans fil : joueurs', 'Empeche la fabrication sans fil depuis l inventaire du joueur.'],
  ['bDisableWirelessCraftingForStructures', 'bool', 'False', 'Fabrication sans fil : structures', 'Empeche la fabrication sans fil depuis une structure.'],
  ['bIgnoreStructuresPreventionVolumes', 'bool', 'False', 'Ignorer les zones interdites', 'Autorise la construction dans les zones normalement protegees.'],
  ['bPvEDisableFriendlyFire', 'bool', 'False', 'Desactiver le tir ami (PVE)', 'Empeche les degats entre membres d une meme tribu en PVE.'],
  ['bShowCreativeMode', 'bool', 'False', 'Bouton mode creatif', 'Ajoute un bouton de bascule du mode creatif au menu pause. Sans effet constate sur serveur dedie : utilisez le bouton « Accorder le mode creatif » de l onglet Joueurs.'],
  ['bUseDinoLevelUpAnimations', 'bool', 'True', 'Animations de montee de niveau', 'Mettre a False supprime l animation des creatures qui gagnent un niveau.'],
  ['bUseSingleplayerSettings', 'bool', 'False', 'Reglages solo', 'Applique l equilibrage prevu pour une partie solo.'],
  ['CheatTeleportLocations', 'string', '', 'Points de teleportation nommes', 'Cree un point utilisable avec la commande TP. Syntaxe composee, repetable.', true],
  ['ConfigAddNPCSpawnEntriesContainer', 'string', '', 'Ajout de creatures a l apparition', 'Ajoute des creatures dans les zones d apparition. Syntaxe composee, repetable.', true],
  ['CraftingSkillBonusMultiplier', 'float', '1.0', 'Bonus de competence de fabrication', 'Multiplie le bonus obtenu en montant la competence de fabrication.'],
  ['CraftXPMultiplier', 'float', '1.0', 'Experience de fabrication', 'Multiplie l experience gagnee en fabriquant.'],
  ['CropDecaySpeedMultiplier', 'float', '1.0', 'Deperissement des cultures', 'Une valeur basse ralentit le deperissement des plantations.'],
  ['CropGrowthSpeedMultiplier', 'float', '1.0', 'Croissance des cultures', 'Une valeur haute accelere la pousse dans les parcelles.'],
  ['CustomRecipeEffectivenessMultiplier', 'float', '1.0', 'Efficacite des recettes', 'Multiplie l efficacite des recettes personnalisees.'],
  ['CustomRecipeSkillMultiplier', 'float', '1.0', 'Competence dans les recettes', 'Multiplie le poids de la competence de fabrication dans les recettes personnalisees.'],
  ['DestroyTamesOverLevelClamp', 'int', '0', 'Detruire au-dela d un niveau', 'Les creatures depassant ce niveau sont supprimees au demarrage du serveur.'],
  ['EggHatchSpeedMultiplier', 'float', '1.0', 'Vitesse d eclosion', 'Une valeur haute accelere l eclosion des oeufs fecondes.'],
  ['ExcludeItemIndices', 'string', '', 'Objets exclus des caisses', 'Retire un objet des caisses de ravitaillement par son identifiant. Repetable.', true],
  ['LimitGeneratorsNum', 'int', '3', 'Generateurs par zone', 'Nombre de generateurs autorises dans le rayon defini.'],
  ['LimitGeneratorsRange', 'int', '15000', 'Rayon de limitation des generateurs', 'Rayon en unites Unreal auquel la limite de generateurs s applique.'],
  ['GenericXPMultiplier', 'float', '1.0', 'Experience passive', 'Multiplie l experience gagnee simplement avec le temps.'],
  ['GlobalItemDecompositionTimeMultiplier', 'float', '1.0', 'Duree des objets au sol', 'Une valeur haute prolonge la duree de vie des objets et sacs au sol.'],
  ['GlobalSpoilingTimeMultiplier', 'float', '1.0', 'Duree avant peremption', 'Une valeur haute prolonge la conservation des denrees.'],
  ['HairGrowthSpeedMultiplier', 'float', '0', 'Pousse des cheveux', 'Une valeur haute accelere la pousse des cheveux et de la barbe.'],
  ['HarvestResourceItemAmountClassMultipliers', 'string', '', 'Rendement par ressource', 'Ajuste le rendement ressource par ressource. Syntaxe composee, repetable.', true],
  ['HarvestXPMultiplier', 'float', '1.0', 'Experience de recolte', 'Multiplie l experience gagnee en recoltant.'],
  ['KillXPMultiplier', 'float', '1.0', 'Experience de mise a mort', 'Multiplie l experience gagnee en tuant une creature.'],
  ['LayEggIntervalMultiplier', 'float', '1.0', 'Intervalle de ponte', 'Une valeur haute espace la ponte des oeufs.'],
  ['LevelExperienceRampOverrides', 'string', '', 'Paliers de niveaux', 'Redefinit le nombre de niveaux et l experience requise. Syntaxe composee, repetable.', true],
  ['MatingIntervalMultiplier', 'float', '1.0', 'Intervalle de reproduction', 'Une valeur basse raccourcit le delai entre deux accouplements.'],
  ['MatingSpeedMultiplier', 'float', '1.0', 'Vitesse d accouplement', 'Une valeur haute accelere l accouplement.'],
  ['MaxFallSpeedMultiplier', 'float', '1.0', 'Seuil de degats de chute', 'Multiplie la vitesse de chute a partir de laquelle les degats surviennent.'],
  ['OverrideNamedEngramEntries', 'string', '', 'Engrammes personnalises', 'Modifie le statut et les prerequis d un engramme. Syntaxe composee, repetable.', true],
  ['PerLevelStatsMultiplier_Player', 'string', '', 'Statistiques par niveau (joueur)', 'Ajuste le gain par niveau, statistique par statistique. Cle indicee, repetable.', true],
  ['PhotoModeRangeLimit', 'int', '3000', 'Portee du mode photo', 'Distance maximale entre la camera du mode photo et le joueur.'],
  ['PoopIntervalMultiplier', 'float', '1.0', 'Intervalle de defecation', 'Une valeur haute espace les besoins des survivants.'],
  ['PreventBreedingForClassNames', 'string', '', 'Reproduction interdite', 'Empeche la reproduction de creatures designees par leur nom de classe. Repetable.', true],
  ['ResourceNoReplenishRadiusPlayers', 'float', '1.0', 'Repousse pres des joueurs', 'Une valeur haute permet aux ressources de repousser plus pres des joueurs.'],
  ['ResourceNoReplenishRadiusStructures', 'float', '1.0', 'Repousse pres des structures', 'Une valeur haute permet aux ressources de repousser plus pres des constructions.'],
  ['SpecialXPMultiplier', 'float', '1.0', 'Experience d evenement', 'Multiplie l experience gagnee lors des evenements speciaux.'],
  ['TribeTowerBonusMultiplier', 'float', '2.0', 'Bonus de tour de tribu', 'Multiplie le bonus accorde par la tour de tribu.'],
  ['WildDinoCharacterFoodDrainMultiplier', 'float', '1.0', 'Faim des creatures sauvages', 'Une valeur haute accelere la consommation de nourriture des creatures sauvages.'],
  ['WirelessCraftingRangeOverride', 'int', '3000', 'Portee de fabrication sans fil', 'Portee en unites Unreal du stockage Tek dedie.'],
  ['ValgueroMemorialEntries', 'string', '', 'Memorial de Valguero', 'Noms separes par des points-virgules, sur une seule ligne.', true],
  ['BaseHexagonRewardMultiplier', 'float', '1.0', 'Recompenses en hexagones', 'Multiplie les hexagones gagnes lors des missions.'],
  ['HexagonCostMultiplier', 'float', '1.0', 'Cout en hexagones', 'Multiplie le prix des objets de la boutique a hexagones.'],
];

/** Reglages vivant hors de [ServerSettings] mais pilotes depuis l'interface */
const OTHER: SettingDescriptor[] = [
  {
    section: 'SessionSettings',
    key: 'SessionName',
    label: 'Nom de la session',
    description: 'Nom affiche dans la liste des serveurs du jeu.',
    type: 'string',
    defaultValue: '',
    file: 'GameUserSettings.ini',
  },
  {
    section: '/Script/Engine.GameSession',
    key: 'MaxPlayers',
    label: 'Joueurs maximum',
    description: "Capacite du serveur. En ASA, l'argument -WinLiveMaxPlayers fait foi.",
    type: 'int',
    defaultValue: '70',
    file: 'GameUserSettings.ini',
  },
  {
    section: 'MessageOfTheDay',
    key: 'Message',
    label: 'Message du jour',
    description: "Texte affiche a l'arrivee sur le serveur. Les retours a la ligne s'ecrivent \\n.",
    type: 'string',
    defaultValue: '',
    file: 'GameUserSettings.ini',
  },
  {
    section: 'MessageOfTheDay',
    key: 'Duration',
    label: 'Duree du message du jour',
    description: "Secondes d'affichage du message d'accueil.",
    type: 'int',
    defaultValue: '20',
    file: 'GameUserSettings.ini',
  },
];

function expand(entries: Entry[], section: string, file: IniFileName): SettingDescriptor[] {
  return entries.map(([key, type, defaultValue, label, description, advanced]) => ({
    section,
    key,
    label,
    description,
    type,
    defaultValue,
    file,
    ...(advanced ? { advanced: true as const } : {}),
  }));
}

export const SETTINGS_CATALOG: SettingDescriptor[] = [
  ...expand(SERVER, SERVER_SETTINGS, 'GameUserSettings.ini'),
  ...OTHER,
  ...expand(GAME, GAME_MODE, 'Game.ini'),
];

const index = new Map<string, SettingDescriptor>();
for (const descriptor of SETTINGS_CATALOG) {
  index.set(`${descriptor.section}::${descriptor.key}`, descriptor);
}

export function describeSetting(section: string, key: string): SettingDescriptor | null {
  // Les cles indicees comme PerLevelStatsMultiplier_Player[0] partagent un descripteur
  const base = key.replace(/\[\d+\]$/, '');
  return index.get(`${section}::${key}`) ?? index.get(`${section}::${base}`) ?? null;
}

/** Reglages connus d'un fichier qui ne figurent pas encore dans le document */
export function missingSettings(file: IniFileName, present: Set<string>): SettingDescriptor[] {
  return SETTINGS_CATALOG.filter(
    (descriptor) => descriptor.file === file && !present.has(`${descriptor.section}::${descriptor.key}`),
  );
}
