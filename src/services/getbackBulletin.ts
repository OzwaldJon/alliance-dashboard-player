import { getAppContext } from '../app/global';
import { normalizeMilestones, normalizeOverrides, normalizeTargetsTiers, saveTargetsMilestones, saveTargetsOverrides, saveTargetsTiers } from '../tabs/targets/model';
import { normalizeAssignments, normalizeTeams, saveAssignments, saveTeams } from '../tabs/teams/model';

export const GETBACK_BASE_URL = 'https://getback.easycnc.be';

export type GetBackConfig = {
  uuid: string;
  readPassphrase: string;
};

export type BulletinPayload = {
  schema?: string;
  schemaVersion?: number;
  exportedAt?: number;
  teams?: any[];
  teamAssignments?: Record<string, string>;
  targets?: {
    tiers?: any;
    milestones?: any[];
    overrides?: any;
  };
};

export function loadLastBulletin(): BulletinPayload | null {
  const ctx = getAppContext();
  const key = ctx.storage.LS_PREFIX + 'getback_last_bulletin_v1';
  try {
    const raw = ctx.storage.load<any>(key, null);
    if (!raw || typeof raw !== 'object') return null;
    return raw as BulletinPayload;
  } catch {
    return null;
  }
}

export function applyTeamsFromBulletin(payload: BulletinPayload): void {
  try {
    if (payload && Array.isArray(payload.teams)) {
      saveTeams(normalizeTeams(payload.teams));
    }
  } catch {
    // ignore
  }

  try {
    if (payload && payload.teamAssignments && typeof payload.teamAssignments === 'object') {
      saveAssignments(normalizeAssignments(payload.teamAssignments));
    }
  } catch {
    // ignore
  }
}

export function saveLastBulletin(payload: BulletinPayload): void {
  const ctx = getAppContext();
  const key = ctx.storage.LS_PREFIX + 'getback_last_bulletin_v1';
  try {
    ctx.storage.save(key, payload && typeof payload === 'object' ? payload : null);
  } catch {
    // ignore
  }
}

export function loadGetBackConfig(): GetBackConfig {
  const ctx = getAppContext();
  const uuidKey = ctx.storage.LS_PREFIX + 'getback_uuid_v1';
  const passKey = ctx.storage.LS_PREFIX + 'getback_read_passphrase_v1';

  return {
    uuid: String(ctx.storage.load<string>(uuidKey, '') || ''),
    readPassphrase: String(ctx.storage.load<string>(passKey, '') || '')
  };
}

export function saveGetBackConfig(next: Partial<GetBackConfig>): void {
  const ctx = getAppContext();
  const uuidKey = ctx.storage.LS_PREFIX + 'getback_uuid_v1';
  const passKey = ctx.storage.LS_PREFIX + 'getback_read_passphrase_v1';

  try {
    if (next.uuid !== undefined) ctx.storage.save(uuidKey, String(next.uuid || ''));
  } catch {
    // ignore
  }
  try {
    if (next.readPassphrase !== undefined) ctx.storage.save(passKey, String(next.readPassphrase || ''));
  } catch {
    // ignore
  }
}

export function applyTargetsFromBulletin(payload: BulletinPayload): void {
  const t = payload && payload.targets ? payload.targets : null;
  if (!t) return;

  try {
    if (t.tiers) saveTargetsTiers(normalizeTargetsTiers(t.tiers));
  } catch {
    // ignore
  }

  try {
    if (Array.isArray(t.milestones)) saveTargetsMilestones(normalizeMilestones(t.milestones));
  } catch {
    // ignore
  }

  try {
    if (t.overrides && typeof t.overrides === 'object') saveTargetsOverrides(normalizeOverrides(t.overrides));
  } catch {
    // ignore
  }
}

export async function fetchBulletin(cfg: GetBackConfig): Promise<BulletinPayload> {
  const baseUrl = String(GETBACK_BASE_URL).trim().replace(/\/+$/, '');
  const uuid = String(cfg.uuid || '').trim();
  if (!uuid) throw new Error('Missing bulletin UUID');

  const url = baseUrl + '/' + encodeURIComponent(uuid);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const pass = String(cfg.readPassphrase || '').trim();
  if (pass) headers['X-Read-Passphrase'] = pass;

  const res = await fetch(url, { method: 'GET', headers, credentials: 'omit' });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Not found / expired / no access (check UUID + read passphrase)');
    }
    throw new Error('GetBack error: HTTP ' + String(res.status));
  }

  const json = (await res.json()) as BulletinPayload;
  return json;
}
