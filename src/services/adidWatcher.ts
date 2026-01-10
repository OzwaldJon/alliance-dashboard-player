import { getAppContext } from '../app/global';
import { applyTargetsFromBulletin, applyTeamsFromBulletin, fetchBulletin, loadGetBackConfig, saveLastBulletin, saveGetBackConfig } from './getbackBulletin';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ADID_RE = /ADID\s*:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export type AdidDetection = { uuid: string; detectedAt: number; raw: string };

export function loadLastDetectedAdid(): AdidDetection | null {
  const ctx = getAppContext();
  const key = ctx.storage.LS_PREFIX + 'getback_detected_adid_v1';
  try {
    const raw = ctx.storage.load<any>(key, null);
    if (!raw || typeof raw !== 'object') return null;
    const uuid = String((raw as any).uuid || '').trim();
    const detectedAt = Number((raw as any).detectedAt || 0);
    const line = String((raw as any).raw || '');
    if (!uuid || !UUID_RE.test(uuid)) return null;
    if (!isFinite(detectedAt) || detectedAt <= 0) return null;
    return { uuid, detectedAt, raw: line };
  } catch {
    return null;
  }
}

export function saveLastDetectedAdid(det: AdidDetection): void {
  const ctx = getAppContext();
  const key = ctx.storage.LS_PREFIX + 'getback_detected_adid_v1';
  try {
    ctx.storage.save(key, det);
  } catch {
    // ignore
  }
}

async function applyFetchAndStore(uuid: string): Promise<void> {
  const ctx = getAppContext();
  try {
    const prevUi: any = ctx.store.getState().ui;
    const prevData: any = ctx.store.getState().data;
    ctx.store.setState({ data: { ...(prevData || {}), lastRefreshStatus: 'GetBack fetching…', loading: true, error: null } });
    void prevUi;
  } catch {
    // ignore
  }

  try {
    const cfg = loadGetBackConfig();
    const payload = await fetchBulletin({ ...cfg, uuid });
    try {
      saveLastBulletin(payload);
    } catch {
      // ignore
    }
    try {
      applyTeamsFromBulletin(payload);
    } catch {
      // ignore
    }
    try {
      applyTargetsFromBulletin(payload);
    } catch {
      // ignore
    }

    try {
      const prevData: any = ctx.store.getState().data;
      ctx.store.setState({
        data: {
          ...(prevData || {}),
          lastRefreshAt: Date.now(),
          lastRefreshStatus: 'GetBack OK (ADID)',
          getbackHasUnseenUpdate: true,
          loading: false,
          error: null,
          _renderTick: (prevData?._renderTick || 0) + 1
        }
      });
    } catch {
      // ignore
    }
  } catch (e: any) {
    try {
      const prevData: any = ctx.store.getState().data;
      ctx.store.setState({
        data: {
          ...(prevData || {}),
          lastRefreshAt: Date.now(),
          lastRefreshStatus: 'GetBack error (ADID)',
          loading: false,
          error: String(e?.message || e || 'Fetch failed')
        }
      });
    } catch {
      // ignore
    }
  }
}

export function startAdidChatWatcher(): { stop: () => void } {
  const ctx = getAppContext();

  let stopped = false;
  let lastUuid = '';
  let lastAt = 0;

  function onDetected(uuid: string, raw: string): void {
    try {
      const u = String(uuid || '').trim();
      if (!u || !UUID_RE.test(u)) return;
      const now = Date.now();

      // de-dupe repeated chat renders
      if (u === lastUuid && now - lastAt < 15_000) return;
      lastUuid = u;
      lastAt = now;

      const det: AdidDetection = { uuid: u, detectedAt: now, raw: String(raw || '') };
      saveLastDetectedAdid(det);

      try {
        saveGetBackConfig({ uuid: u });
      } catch {
        // ignore
      }

      try {
        const prevData: any = ctx.store.getState().data;
        ctx.store.setState({
          data: {
            ...(prevData || {}),
            getbackDetectedUuid: u,
            getbackDetectedAt: now,
            lastRefreshAt: now,
            lastRefreshStatus: 'ADID detected. Fetching…',
            _renderTick: (prevData?._renderTick || 0) + 1
          }
        });
      } catch {
        // ignore
      }

      applyFetchAndStore(u).catch(() => {
        // ignore
      });
    } catch {
      // ignore
    }
  }

  function scanText(text: string): void {
    try {
      const t = String(text || '');
      if (t.indexOf('ADID') === -1 && t.indexOf('adid') === -1) return;
      const m = t.match(ADID_RE);
      if (m && m[1]) {
        onDetected(String(m[1]), t);
        return;
      }

      // fallback: if someone pasted just UUID but prefixed weirdly
      if (t.indexOf('ADID') !== -1 || t.indexOf('adid') !== -1) {
        const um = t.match(UUID_RE);
        if (um && um[0]) onDetected(String(um[0]), t);
      }
    } catch {
      // ignore
    }
  }

  function scanNode(node: Node): void {
    try {
      if (!node) return;
      const anyNode: any = node as any;
      const txt = anyNode && typeof anyNode.textContent === 'string' ? String(anyNode.textContent) : '';
      if (txt) scanText(txt);
    } catch {
      // ignore
    }
  }

  // Try to keep observer lightweight: watch the whole body but only process added nodes.
  const observer = new MutationObserver((list) => {
    if (stopped) return;
    try {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const added = m.addedNodes;
        if (!added || !added.length) continue;
        for (let j = 0; j < added.length; j++) {
          scanNode(added[j]);
        }
      }
    } catch {
      // ignore
    }
  });

  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {
    // ignore
  }

  // initial scan (covers already-loaded chat history)
  try {
    scanText(document.body ? String((document.body as any).textContent || '') : '');
  } catch {
    // ignore
  }

  // hydrate store with last detected (if any)
  try {
    const det = loadLastDetectedAdid();
    if (det) {
      const prevData: any = ctx.store.getState().data;
      ctx.store.setState({ data: { ...(prevData || {}), getbackDetectedUuid: det.uuid, getbackDetectedAt: det.detectedAt, _renderTick: (prevData?._renderTick || 0) + 1 } });
    }
  } catch {
    // ignore
  }

  return {
    stop: () => {
      stopped = true;
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
    }
  };
}
