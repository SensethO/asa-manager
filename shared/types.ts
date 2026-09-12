/**
 * Types partages entre l'API Node et l'interface React.
 * Aucune dependance runtime : ce fichier est compile par les deux cotes.
 */

export type ServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'installing'
  | 'updating'
  | 'error';

export interface ModEntry {
  /** Identifiant CurseForge du mod */
  id: string;
  name?: string;
  enabled: boolean;
}

export interface RestartSchedule {
  enabled: boolean;
  /** Heures quotidiennes au format "HH:MM", heure locale de la machine */
  dailyTimes: string[];
  /** Minutes avant l'arret auxquelles un avertissement est diffuse en jeu */
  warningMinutes: number[];
}

export interface UpdatePolicy {
  enabled: boolean;
  /** Verifie la disponibilite d'une mise a jour a cet intervalle */
  checkIntervalMinutes: number;
  /** Applique la mise a jour au prochain redemarrage planifie plutot qu'immediatement */
  onlyOnScheduledRestart: boolean;
}

export interface BackupPolicy {
  enabled: boolean;
  intervalMinutes: number;
  /** Nombre d'archives conservees ; les plus anciennes sont supprimees */
  retain: number;
  /** Dossier de destination ; vide = <installDir>/Backups */
  targetDir: string;
}

export interface ServerProfile {
  id: string;
  name: string;
  /** Racine d'installation du serveur ASA (contient ShooterGame/) */
  installDir: string;
  map: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  maxPlayers: number;
  adminPassword: string;
  serverPassword: string;
  rconEnabled: boolean;
  /** Identifiant de cluster partage, vide si le serveur est isole */
  clusterId: string;
  mods: ModEntry[];
  /** Arguments supplementaires bruts, ex. "-NoBattlEye" */
  extraArgs: string[];
  restart: RestartSchedule;
  update: UpdatePolicy;
  backup: BackupPolicy;
  createdAt: string;
}

export interface ProfileRuntime {
  profileId: string;
  status: ServerStatus;
  pid: number | null;
  startedAt: string | null;
  /** Derniere erreur rencontree, effacee au demarrage suivant */
  lastError: string | null;
  /** Progression d'une operation longue (installation, mise a jour) */
  progress: string | null;
  playersOnline: number | null;
  installedBuildId: string | null;
}

export interface PlayerInfo {
  index: number;
  name: string;
  /** Identifiant EOS tel que renvoye par ListPlayers */
  id: string;
}

/** Position dans le monde et sur la carte du jeu */
export interface WorldPosition {
  x: number;
  y: number;
  z: number;
  lat: number;
  lon: number;
}

/** Detail d'un joueur, disponible uniquement via le plugin AsaQoL */
export interface PlayerDetail {
  index: number;
  name: string;
  platformName: string;
  eosId: string;
  playerId: number;
  tribeId: number;
  dead: boolean;
  riding: boolean;
  position: WorldPosition | null;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  /** Nom de classe abrege, ex. PrimalItem_WeaponStoneHatchet */
  blueprint: string;
  /** True pour un engramme appris, range par ARK dans l'inventaire */
  engram: boolean;
  /** True pour un skin ou un costume possede, egalement stocke en inventaire */
  skin: boolean;
  /** EPrimalItemType : 0 consommable, 1 equipement, 2 arme, 3 munition, 4 structure, 5 ressource, 6 skin */
  type: number;
  isBlueprint: boolean;
  quality: number;
}

export interface PlayerInventory {
  eosId: string;
  name: string;
  /** Nombre total d'entrees, categories cosmetiques comprises */
  count: number;
  engrams: number;
  skins: number;
  /** Objets reellement portes : ce que le joueur voit dans son inventaire */
  carried: number;
  items: InventoryItem[];
}

/** Coffre, structure a inventaire ou monture, avec son contenu */
export interface ContainerInfo {
  /** 'structure' pour un coffre ou une forge, 'creature' pour une monture */
  kind: 'structure' | 'creature';
  name: string;
  position: WorldPosition;
  /** Nombre d'objets contenus, avant plafonnement de la liste */
  itemCount: number;
  returned: number;
  items: InventoryItem[];
}

export interface PlayerContainers {
  eosId: string;
  name: string;
  tribeId: number;
  radius: number;
  /** Contenants non vides trouves */
  matched: number;
  /** Contenants vides, comptes mais non detailles */
  empty: number;
  returned: number;
  totalItems: number;
  truncated: boolean;
  center: WorldPosition;
  containers: ContainerInfo[];
}

export type DinoFilter = 'tamed' | 'wild' | 'all';

export interface DinoInfo {
  species: string;
  /** Nom donne a la creature apprivoisee, vide si sauvage */
  name: string;
  tamed: boolean;
  /** Niveau effectif : niveau d'origine plus montees post-apprivoisement */
  level: number;
  baseLevel: number;
  female: boolean;
  tribeId: number;
  lat: number;
  lon: number;
}

export interface DinoCensus {
  filter: DinoFilter;
  radius: number;
  /** Total correspondant aux criteres sur la carte, avant pagination */
  matched: number;
  offset: number;
  returned: number;
  /** True si la page a atteint la limite : d'autres resultats existent */
  truncated: boolean;
  dinos: DinoInfo[];
}

/** Tranche de niveaux et sa part dans le tirage a l'apparition */
export interface WildLevelBand {
  from: number;
  to: number;
  /** Part relative ; les parts sont normalisees par le plugin */
  percent: number;
}

/**
 * Niveaux imposes aux creatures sauvages.
 *
 * ARK n'a aucun reglage natif equivalent : `OverrideOfficialDifficulty` ne fixe
 * que le plafond, sans plancher ni ponderation. Ces reglages vivent donc dans
 * la configuration du plugin AsaQoL, pas dans les fichiers .ini du jeu.
 */
export interface WildLevelSettings {
  enabled: boolean;
  minLevel: number;
  maxLevel: number;
  bands: WildLevelBand[];
}

/** Etat renvoye par le plugin, incluant ce qu'il applique reellement */
export interface WildLevelState extends WildLevelSettings {
  /** False si l'interception n'a pas pu etre posee : les reglages sont sans effet */
  hooked: boolean;
  /** Repartition mesuree sur un tirage a blanc, par tranche de 10 */
  sample?: Array<WildLevelBand & { count: number }>;
  sampleSize?: number;
}

/** Objet du catalogue du serveur, lu dans le MasterItemList du jeu */
export interface GameItem {
  /** Index dans le MasterItemList, stable pour une version donnee */
  index: number;
  name: string;
  /** Chemin complet, celui qu'attend la remise */
  blueprint: string;
  /**
   * EPrimalItemType tel que declare par le jeu : 0 consommable, 1 equipement,
   * 2 arme, 3 munition, 4 structure, 5 ressource, 6 skin, 7 accessoire d'arme,
   * 8 artefact. -1 quand il n'a pu etre lu.
   */
  type: number;
  /** Nom du mod dont provient l'objet ; absent pour le contenu du jeu de base */
  mod?: string;
}

/**
 * Objet ajoute a la main, absent du catalogue lu dans le jeu.
 *
 * Un mod qui remplace les donnees de jeu rend ses objets invisibles au
 * `MasterItemList` de base : les saisir ici les rend utilisables comme les
 * autres, recherche et remise comprises.
 */
export interface CustomItem {
  name: string;
  blueprint: string;
  /** Meme echelle qu'EPrimalItemType, pour heriter du classement et de la qualite */
  type: number;
}

export interface ItemCatalog {
  /** Chemin de l'objet de donnees d'ou vient la liste */
  source: string;
  /** Taille du catalogue complet, avant recherche */
  total: number;
  /** Nombre correspondant a la recherche */
  matched: number;
  offset: number;
  returned: number;
  truncated: boolean;
  items: GameItem[];
}

export interface GiveItemRequest {
  blueprint: string;
  quantity: number;
  /** 0 = commun ; les paliers superieurs suivent les qualites du jeu */
  quality: number;
  /** Remettre le plan plutot que l'objet fini */
  asBlueprint: boolean;
}

export interface GiveItemResult extends GiveItemRequest {
  given: boolean;
  eosId: string;
  error: string;
}

/** Joueur deja vu sur ce serveur, connecte ou non */
export interface KnownPlayer {
  eosId: string;
  name: string;
  /** Horodatages ISO */
  firstSeen: string;
  lastSeen: string;
  /** Nombre de connexions observees */
  sessions: number;
  online: boolean;
  /** Objets en attente de remise a la prochaine connexion */
  pending: number;
}

/** Remise differee, appliquee des que le joueur reapparait */
export interface PendingDelivery extends GiveItemRequest {
  /** Nom lisible de l'objet, fige au moment de la mise en attente */
  name: string;
  queuedAt: string;
}

export interface StructureInfo {
  name: string;
  position: WorldPosition;
}

export interface PlayerStructures {
  eosId: string;
  name: string;
  tribeId: number;
  /** Rayon de recherche en unites Unreal */
  radius: number;
  /** Nombre total trouve, avant plafonnement */
  matched: number;
  returned: number;
  /** True si le plafond a ete atteint et la liste tronquee */
  truncated: boolean;
  center: WorldPosition;
  structures: StructureInfo[];
}

export interface BackupInfo {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export type IniFileName = 'Game.ini' | 'GameUserSettings.ini';

export interface IniEntry {
  key: string;
  value: string;
  /** Index d'occurrence quand la meme cle apparait plusieurs fois dans la section */
  occurrence: number;
}

export interface IniSection {
  name: string;
  entries: IniEntry[];
}

export interface IniDocument {
  file: IniFileName;
  sections: IniSection[];
  /** True si des modifications attendent le prochain redemarrage */
  pendingChanges: boolean;
}

/** Descripteur d'un reglage connu, pour afficher un libelle et un type dans l'UI */
export interface SettingDescriptor {
  section: string;
  key: string;
  label: string;
  description: string;
  type: 'bool' | 'int' | 'float' | 'string';
  /** Valeur du jeu par defaut, proposee lors de l'ajout du reglage au fichier */
  defaultValue: string;
  /** Fichier auquel ce reglage appartient */
  file: IniFileName;
  /**
   * True pour les reglages a syntaxe composee, souvent repetables
   * (listes d'engrammes, paliers d'experience, multiplicateurs par ressource).
   * L'interface les presente en texte libre plutot qu'avec un controle type.
   */
  advanced?: boolean;
  min?: number;
  max?: number;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  profileId: string;
  at: string;
  level: LogLevel;
  source: 'manager' | 'server' | 'steamcmd' | 'rcon' | 'plugin';
  text: string;
}

export type ServerEvent =
  | { type: 'runtime'; runtime: ProfileRuntime }
  | { type: 'log'; line: LogLine }
  | { type: 'profiles' };

export interface RconResult {
  command: string;
  response: string;
}

export interface ApiError {
  error: string;
}

/** Reglages valables pour toute l'application, independants des profils */
export interface AppSettings {
  /** Dossier parent sous lequel les nouveaux serveurs sont installes */
  defaultServerDir: string;
  /** Duree de validite d'une session ouverte, en heures */
  sessionHours: number;
  /** Dossier de sauvegarde propose par defaut ; vide = <installation>/Backups */
  defaultBackupDir: string;
}

/**
 * admin    : tout, y compris la gestion des comptes et des reglages globaux
 * operator : pilotage des serveurs et de leur configuration
 * viewer   : consultation seule
 */
export type UserRole = 'admin' | 'operator' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SessionInfo {
  user: User;
  expiresAt: string;
}

/** Etat renvoye avant authentification, pour savoir quel ecran afficher */
export interface AuthState {
  /** True tant qu'aucun compte n'existe : l'ecran de premiere configuration s'impose */
  needsSetup: boolean;
  /** Adresse pre-remplie sur l'ecran de premiere configuration */
  suggestedAdminEmail: string;
  session: SessionInfo | null;
}
