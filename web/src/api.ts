import type {
  AppSettings,
  AuthState,
  BackupInfo,
  DinoCensus,
  DinoFilter,
  GameItem,
  GiveItemRequest,
  GiveItemResult,
  CustomItem,
  ItemCatalog,
  KnownPlayer,
  PendingDelivery,
  IniDocument,
  IniFileName,
  LogLine,
  ModEntry,
  PlayerContainers,
  PlayerDetail,
  PlayerInfo,
  PlayerInventory,
  PlayerStructures,
  ProfileRuntime,
  ServerEvent,
  ServerProfile,
  SettingDescriptor,
  User,
  UserRole,
  WildLevelSettings,
  WildLevelState,
} from '../../shared/types.js';

export class ApiError extends Error {}

/** Levee quand la session a expire : l'interface doit revenir a l'ecran de connexion */
export class UnauthenticatedError extends ApiError {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  // Content-Type uniquement quand il y a reellement un corps : annoncer du JSON
  // sur une requete vide fait echouer Fastify en 400 (FST_ERR_CTP_EMPTY_JSON_BODY),
  // ce qui casserait toutes les actions sans corps (demarrer, installer, supprimer...)
  if (init?.body !== undefined && init.body !== null) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });

  if (!response.ok) {
    // L'API renvoie systematiquement { error }. Quand ce n'est pas le cas, le
    // corps est repris tel quel : un « Erreur HTTP 400 » nu n'apprend rien et
    // rend le diagnostic impossible.
    let message = `Erreur HTTP ${response.status}`;
    const raw = await response.text().catch(() => '');

    try {
      const body = JSON.parse(raw) as { error?: string; message?: string };
      const detail = body.error ?? body.message;
      if (detail) message = detail;
    } catch {
      const snippet = raw.trim().slice(0, 200);
      if (snippet) message = `${message} - ${snippet}`;
    }

    if (message === `Erreur HTTP ${response.status}`) {
      message = `${message} sur ${init?.method ?? 'GET'} ${path}`;
    }

    if (response.status === 401) throw new UnauthenticatedError(message);
    throw new ApiError(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface ProfileDetail {
  profile: ServerProfile;
  runtime: ProfileRuntime;
  installed: boolean;
  pendingUpdate: boolean;
  /** True si AsaApi est deploye : les annonces a duree reglable sont disponibles */
  asaApi: boolean;
}

export const api = {
  listProfiles: () => request<ServerProfile[]>('/api/profiles'),

  getProfile: (id: string) => request<ProfileDetail>(`/api/profiles/${id}`),

  createProfile: (name: string, installDir?: string) =>
    request<ServerProfile>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name, installDir }),
    }),

  updateProfile: (id: string, patch: Partial<ServerProfile>) =>
    request<ServerProfile>(`/api/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteProfile: (id: string) => request<{ ok: true }>(`/api/profiles/${id}`, { method: 'DELETE' }),

  runtime: (id: string) => request<ProfileRuntime>(`/api/profiles/${id}/runtime`),

  logs: (id: string) => request<LogLine[]>(`/api/profiles/${id}/logs`),

  install: (id: string) => request<{ started: true }>(`/api/profiles/${id}/install`, { method: 'POST' }),

  update: (id: string) => request<{ started: true }>(`/api/profiles/${id}/update`, { method: 'POST' }),

  /**
   * Build publie sur la branche publique, tel que Steam le connait.
   * `buildId` vaut null quand la reponse de SteamCMD n'est pas exploitable :
   * l'etat est alors inconnu, ce qui n'est pas la meme chose qu'a jour.
   */
  latestBuild: (id: string) => request<{ buildId: string | null }>(`/api/profiles/${id}/latest-build`),

  start: (id: string) => request<{ ok: true }>(`/api/profiles/${id}/start`, { method: 'POST' }),

  stop: (id: string, immediate: boolean) =>
    request<{ started: true }>(`/api/profiles/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({ immediate }),
    }),

  restart: (id: string, immediate: boolean) =>
    request<{ started: true }>(`/api/profiles/${id}/restart`, {
      method: 'POST',
      body: JSON.stringify({ immediate }),
    }),

  cancelStop: (id: string) =>
    request<{ cancelled: boolean }>(`/api/profiles/${id}/cancel-stop`, { method: 'POST' }),

  kill: (id: string) => request<{ ok: true }>(`/api/profiles/${id}/kill`, { method: 'POST' }),

  players: (id: string) => request<PlayerInfo[]>(`/api/profiles/${id}/players`),

  dinos: (
    id: string,
    query: { filter: DinoFilter; species: string; minLevel: number; offset: number; limit: number },
  ) => {
    const params = new URLSearchParams({
      filter: query.filter,
      species: query.species,
      minLevel: String(query.minLevel),
      offset: String(query.offset),
      limit: String(query.limit),
    });
    return request<DinoCensus>(`/api/profiles/${id}/dinos?${params.toString()}`);
  },

  wildLevels: (id: string) => request<WildLevelState>(`/api/profiles/${id}/wild-levels`),

  saveWildLevels: (id: string, settings: WildLevelSettings) =>
    request<WildLevelState>(`/api/profiles/${id}/wild-levels`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  items: (id: string, query: { search: string; offset: number; limit: number; refresh?: boolean }) => {
    const params = new URLSearchParams({
      search: query.search,
      offset: String(query.offset),
      limit: String(query.limit),
    });
    if (query.refresh) params.set('refresh', '1');
    return request<ItemCatalog>(`/api/profiles/${id}/items?${params.toString()}`);
  },

  giveItem: (id: string, eosId: string, body: GiveItemRequest) =>
    request<GiveItemResult>(`/api/profiles/${id}/players/${eosId}/give`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  customItems: (id: string) => request<CustomItem[]>(`/api/profiles/${id}/custom-items`),

  addCustomItem: (id: string, item: CustomItem) =>
    request<CustomItem[]>(`/api/profiles/${id}/custom-items`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  removeCustomItem: (id: string, blueprint: string) =>
    request<CustomItem[]>(
      `/api/profiles/${id}/custom-items?blueprint=${encodeURIComponent(blueprint)}`,
      { method: 'DELETE' },
    ),

  roster: (id: string) => request<KnownPlayer[]>(`/api/profiles/${id}/roster`),

  pending: (id: string, eosId: string) =>
    request<PendingDelivery[]>(`/api/profiles/${id}/players/${eosId}/pending`),

  queuePending: (id: string, eosId: string, items: (GiveItemRequest & { name: string })[]) =>
    request<PendingDelivery[]>(`/api/profiles/${id}/players/${eosId}/pending`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  clearPending: (id: string, eosId: string) =>
    request<{ ok: true }>(`/api/profiles/${id}/players/${eosId}/pending`, { method: 'DELETE' }),

  playerDetails: (id: string) => request<PlayerDetail[]>(`/api/profiles/${id}/player-details`),

  playerInventory: (id: string, eosId: string) =>
    request<PlayerInventory>(`/api/profiles/${id}/players/${eosId}/inventory`),

  playerContainers: (id: string, eosId: string, radius: number) =>
    request<PlayerContainers>(`/api/profiles/${id}/players/${eosId}/containers?radius=${radius}`),

  playerStructures: (id: string, eosId: string, radius: number) =>
    request<PlayerStructures>(`/api/profiles/${id}/players/${eosId}/structures?radius=${radius}`),

  announce: (id: string, message: string, seconds: number) =>
    request<{ mode: 'plugin' | 'broadcast'; seconds: number; response: string }>(
      `/api/profiles/${id}/announce`,
      { method: 'POST', body: JSON.stringify({ message, seconds }) },
    ),

  rcon: (id: string, command: string) =>
    request<{ command: string; response: string }>(`/api/profiles/${id}/rcon`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  readIni: (id: string, file: IniFileName) =>
    request<{ document: IniDocument; text: string }>(`/api/profiles/${id}/ini/${file}`),

  writeIniChanges: (
    id: string,
    file: IniFileName,
    changes: { section: string; key: string; occurrence: number; value: string | null }[],
    additions: { section: string; key: string; value: string }[] = [],
  ) =>
    request<IniDocument>(`/api/profiles/${id}/ini/${file}`, {
      method: 'PUT',
      body: JSON.stringify({ changes, additions }),
    }),

  writeIniText: (id: string, file: IniFileName, text: string) =>
    request<IniDocument>(`/api/profiles/${id}/ini/${file}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    }),

  discardPendingIni: (id: string, file: IniFileName) =>
    request<{ ok: true }>(`/api/profiles/${id}/ini/${file}/pending`, { method: 'DELETE' }),

  getMods: (id: string) => request<ModEntry[]>(`/api/profiles/${id}/mods`),

  setMods: (id: string, mods: ModEntry[]) =>
    request<ModEntry[]>(`/api/profiles/${id}/mods`, { method: 'PUT', body: JSON.stringify({ mods }) }),

  listBackups: (id: string) => request<BackupInfo[]>(`/api/profiles/${id}/backups`),

  createBackup: (id: string) => request<BackupInfo>(`/api/profiles/${id}/backups`, { method: 'POST' }),

  restoreBackup: (id: string, name: string) =>
    request<{ ok: true }>(`/api/profiles/${id}/backups/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
    }),

  deleteBackup: (id: string, name: string) =>
    request<{ ok: true }>(`/api/profiles/${id}/backups/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  settingsCatalog: () => request<SettingDescriptor[]>('/api/settings-catalog'),

  gameModeSettings: (id: string) =>
    request<{ settings: Record<string, number | boolean> }>(`/api/profiles/${id}/gamemode`),

  // --- Authentification ---------------------------------------------------

  authState: () => request<AuthState>('/api/auth/state'),

  setup: (email: string, password: string) =>
    request<{ user: User; expiresAt: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ user: User; expiresAt: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true; reconnectRequired: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // --- Comptes (administrateurs) -----------------------------------------

  listUsers: () => request<User[]>('/api/users'),

  createUser: (email: string, password: string, role: UserRole) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify({ email, password, role }) }),

  updateUser: (id: string, patch: { email?: string; role?: UserRole }) =>
    request<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  setUserPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  deleteUser: (id: string) => request<{ ok: true }>(`/api/users/${id}`, { method: 'DELETE' }),

  // --- Reglages de l'application -----------------------------------------

  getSettings: () => request<AppSettings>('/api/settings'),

  saveSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
};

/**
 * Abonnement au flux SSE. Le navigateur relance seul la connexion en cas de
 * coupure, il n'y a donc pas de logique de reconnexion a ecrire ici.
 */
export function subscribeEvents(onEvent: (event: ServerEvent) => void): () => void {
  const source = new EventSource('/api/events');

  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as ServerEvent);
    } catch {
      /* fragment illisible : ignore */
    }
  };

  return () => source.close();
}
