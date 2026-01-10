import { runOnce } from './bootstrap/runOnce';
import { getClientLib } from './env/game';
import { createAppContext, mountUi } from './app/uiShell';
import { installAppContext } from './app/global';
import { computePlayerKey } from './app/storage';
import { registerProfileTabTs } from './tabs/profile/registerProfileTab';
import { registerPlayerTabTs } from './tabs/player/registerPlayerTab';
import { startAdidChatWatcher } from './services/adidWatcher';
import { refreshPlayersTs } from './services/refreshPlayers';
import { initTeamObjectivesOverlay } from './services/teamObjectivesOverlay';

function isClientLibReadyForDashboard(): boolean {
  try {
    const w: any = window as any;
    const ClientLib: any = w.ClientLib;
    return !!(ClientLib && ClientLib.Data && ClientLib.Data.MainData && typeof ClientLib.Data.MainData.GetInstance === 'function');
  } catch {
    return false;
  }
}

function isAllianceReadyForDashboard(): boolean {
  try {
    const w: any = window as any;
    const ClientLib: any = w.ClientLib;
    if (!ClientLib?.Data?.MainData?.GetInstance) return false;
    const md = ClientLib.Data.MainData.GetInstance();
    const alliance = md && typeof md.get_Alliance === 'function' ? md.get_Alliance() : null;
    if (!alliance) return false;
    if (typeof alliance.get_Exists === 'function' && !alliance.get_Exists()) return false;

    // Avoid false negatives during early boot: wait until member id list object is present.
    const idsWrap = typeof alliance.getMemberIds === 'function' ? alliance.getMemberIds() : null;
    const list = idsWrap && (idsWrap.l ?? null);
    if (!Array.isArray(list)) return false;

    return true;
  } catch {
    return false;
  }
}

function waitForClientLibReady(timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      try {
        const pk = computePlayerKey();
        if (isClientLibReadyForDashboard() && isAllianceReadyForDashboard() && pk && pk !== 'punknown') {
          resolve(true);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          resolve(false);
          return;
        }
      } catch {
        // ignore
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

(() => {
  if (!runOnce('__ALLIANCE_DASHBOARD_PLAYER_VITE__')) return;

  // If this ever logs, Tampermonkey may not be executing in page context.
  // In that case we switch to explicit page injection.
  if (!getClientLib()) {
    console.warn('[AllianceDashboard] ClientLib not found. Are you on the game page and fully loaded?');
  }

  waitForClientLibReady(30_000).then((ok) => {
    if (!ok) {
      console.warn('[AllianceDashboard] Game not fully ready (player id missing). Initializing anyway.');
    }

    const ctx = createAppContext({ scriptVersion: '0.2.3' });
    installAppContext(ctx);
    try {
      mountUi(ctx, undefined, undefined);
    } catch {
      // ignore
    }

    try {
      registerProfileTabTs();
    } catch {
      // ignore
    }

    try {
      registerPlayerTabTs();
    } catch {
      // ignore
    }

    try {
      startAdidChatWatcher();
    } catch {
      // ignore
    }

    try {
      initTeamObjectivesOverlay(ctx);
    } catch {
      // ignore
    }

    try {
      refreshPlayersTs(ctx.store);
      setInterval(() => {
        try {
          refreshPlayersTs(ctx.store);
        } catch {
          // ignore
        }
      }, 60_000);
    } catch {
      // ignore
    }
  });
})();
