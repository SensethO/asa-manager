import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import type {
  ServerProfile,
  WildLevelBand,
  WildLevelSettings,
  WildLevelState,
} from '../../../shared/types.js';
import { hasAsaApi, pluginConfigFile } from './paths.js';
import { exec } from './serverProcess.js';

/**
 * Niveaux des creatures sauvages.
 *
 * ARK ne sait pas imposer un niveau minimum ni ponderer les niveaux :
 * `OverrideOfficialDifficulty` ne fixe que le plafond, les creatures
 * apparaissant ensuite de 1 a ce maximum. Ces reglages vivent donc dans la
 * configuration du plugin AsaQoL, qui redefinit le niveau a l'apparition.
 */

export class WildLevelsUnavailable extends Error {
  constructor(message = "Le plugin AsaQoL n'est pas installe sur ce serveur") {
    super(message);
  }
}

export const DEFAULT_WILD_LEVELS: WildLevelSettings = {
  enabled: false,
  minLevel: 1,
  maxLevel: 150,
  bands: [],
};

/** Tranches de 10 couvrant l'intervalle, reparties a parts egales */
export function evenBands(minLevel: number, maxLevel: number): WildLevelBand[] {
  const bands: WildLevelBand[] = [];
  const start = Math.max(1, Math.floor(minLevel / 10) * 10 || 1);

  for (let from = start; from <= maxLevel; from += 10) {
    bands.push({ from: Math.max(from, minLevel), to: Math.min(from + 9, maxLevel), percent: 0 });
  }

  const share = bands.length > 0 ? Number((100 / bands.length).toFixed(2)) : 0;
  return bands.map((band) => ({ ...band, percent: share }));
}

/**
 * Normalise ce qui arrive du client.
 *
 * Les bornes sont recalees plutot que refusees : une saisie incoherente doit
 * produire une configuration utilisable, pas une erreur qui perd le travail.
 */
export function sanitize(input: Partial<WildLevelSettings>): WildLevelSettings {
  const minLevel = clampLevel(input.minLevel ?? DEFAULT_WILD_LEVELS.minLevel);
  const maxLevel = Math.max(minLevel, clampLevel(input.maxLevel ?? DEFAULT_WILD_LEVELS.maxLevel));

  const bands = (input.bands ?? [])
    .map((band) => {
      // Bornes echangees plutot que rabotees, comme le fait le plugin : une
      // tranche saisie a l'envers reste la tranche voulue
      const low = clampLevel(band.from);
      const high = clampLevel(band.to);
      return {
        from: Math.min(low, high),
        to: Math.max(low, high),
        percent: Math.max(0, Number(band.percent) || 0),
      };
    })
    // Une tranche hors des bornes ne serait jamais tiree : la retirer evite
    // d'afficher une part qui ne se realise pas
    .filter((band) => band.percent > 0 && band.to >= minLevel && band.from <= maxLevel)
    .sort((left, right) => left.from - right.from);

  return {
    enabled: Boolean(input.enabled),
    minLevel,
    maxLevel,
    bands,
  };
}

function clampLevel(value: number): number {
  const level = Math.round(Number(value));
  if (!Number.isFinite(level)) return 1;
  return Math.min(9999, Math.max(1, level));
}

/** Parts ramenees a 100 %, pour l'affichage comme pour le tirage */
export function normalizedShares(bands: WildLevelBand[]): number[] {
  const total = bands.reduce((sum, band) => sum + band.percent, 0);
  if (total <= 0) return bands.map(() => 0);
  return bands.map((band) => (100 * band.percent) / total);
}

async function readPluginConfig(profile: ServerProfile): Promise<Record<string, unknown>> {
  const file = pluginConfigFile(profile);
  if (!existsSync(file)) return {};

  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`config.json du plugin illisible : ${(cause as Error).message}`);
  }
}

export async function readWildLevels(profile: ServerProfile): Promise<WildLevelSettings> {
  if (!hasAsaApi(profile)) throw new WildLevelsUnavailable();

  const config = await readPluginConfig(profile);
  const section = (config.WildLevels ?? {}) as Record<string, unknown>;

  const bands = Array.isArray(section.Bands)
    ? (section.Bands as Record<string, number>[]).map((band) => ({
        from: Number(band.From ?? 1),
        to: Number(band.To ?? 10),
        percent: Number(band.Percent ?? 0),
      }))
    : [];

  return sanitize({
    enabled: Boolean(section.Enabled),
    minLevel: Number(section.MinLevel ?? DEFAULT_WILD_LEVELS.minLevel),
    maxLevel: Number(section.MaxLevel ?? DEFAULT_WILD_LEVELS.maxLevel),
    bands,
  });
}

/**
 * Ecrit la section et demande au plugin de la relire.
 *
 * Le reste du fichier est preserve tel quel : il contient les maisons, kits et
 * messages, qu'une reecriture complete ecraserait.
 */
export async function writeWildLevels(
  profile: ServerProfile,
  input: Partial<WildLevelSettings>,
): Promise<WildLevelState> {
  if (!hasAsaApi(profile)) throw new WildLevelsUnavailable();

  const settings = sanitize(input);
  const config = await readPluginConfig(profile);

  config.WildLevels = {
    Enabled: settings.enabled,
    MinLevel: settings.minLevel,
    MaxLevel: settings.maxLevel,
    Bands: settings.bands.map((band) => ({ From: band.from, To: band.to, Percent: band.percent })),
  };

  await writeFile(pluginConfigFile(profile), `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return applyWildLevels(profile, settings);
}

/**
 * Demande au plugin de relire sa configuration et renvoie ce qu'il applique.
 *
 * L'etat vient du plugin, jamais du fichier : c'est la seule facon de savoir si
 * l'interception a bien ete posee, et donc si les reglages ont un effet reel.
 * Serveur arrete, on renvoie le fichier en signalant que rien n'est actif.
 */
export async function applyWildLevels(
  profile: ServerProfile,
  fallback?: WildLevelSettings,
): Promise<WildLevelState> {
  const onDisk = fallback ?? (await readWildLevels(profile));

  try {
    const response = (await exec(profile, 'qol.wildlevels reload simulate=20000')).trim();
    const payload = JSON.parse(response) as {
      enabled: boolean;
      hooked: boolean;
      minLevel: number;
      maxLevel: number;
      bands: WildLevelBand[];
      sample?: Array<WildLevelBand & { count: number }>;
      sampleSize?: number;
    };

    return {
      enabled: payload.enabled,
      minLevel: payload.minLevel,
      maxLevel: payload.maxLevel,
      bands: payload.bands ?? [],
      hooked: payload.hooked,
      sample: payload.sample,
      sampleSize: payload.sampleSize,
    };
  } catch {
    // Serveur arrete, ou plugin trop ancien : le fichier fait foi, mais rien
    // n'est applique tant que le serveur n'a pas redemarre
    return { ...onDisk, hooked: false };
  }
}
