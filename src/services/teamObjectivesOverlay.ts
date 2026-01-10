import { AppContext } from '../app/uiShell';
import { getGameApi } from './gameApi';
import { loadTeams, loadAssignments } from '../tabs/teams/model';

function getSelfPlayerId(): string {
  try {
    const api = getGameApi();
    const md = api.mainData;
    const p = md && typeof md.get_Player === 'function' ? md.get_Player() : null;
    if (!p) return '';
    const id = typeof (p as any).get_Id === 'function' ? (p as any).get_Id() : (p as any).Id ?? (p as any).id;
    return String(id ?? '').trim();
  } catch {
    return '';
  }
}

function getSelfTeamId(selfId: string): string {
  try {
    if (!selfId) return '';
    const a = loadAssignments();
    return a && (a as any)[String(selfId)] ? String((a as any)[String(selfId)]) : '';
  } catch {
    return '';
  }
}

function getObjectiveColor(o: any): string | null {
  try {
    const POI_TYPE_COLOR_BY_ID: Record<number, string> = {
      1: '#3CE685',
      2: '#44DBF4',
      3: '#84DCE3',
      4: '#CC6F66',
      5: '#B0ADF6',
      6: '#BDD7E5',
      7: '#F5A6C7'
    };
    const tid = o && o.poiTypeId !== undefined && o.poiTypeId !== null && isFinite(Number(o.poiTypeId)) ? Number(o.poiTypeId) : null;
    if (tid === null) return null;
    return POI_TYPE_COLOR_BY_ID[tid] ? String(POI_TYPE_COLOR_BY_ID[tid]) : null;
  } catch {
    return null;
  }
}

function isPoiObjective(o: any): boolean {
  try {
    return !!getObjectiveColor(o);
  } catch {
    return false;
  }
}

export function initTeamObjectivesOverlay(ctx: AppContext): void {
  let overlay: HTMLElement | null = null;
  let timer: number | null = null;
  let raf: number | null = null;
  let lastRafTick = 0;

  let evRegion: any = null;
  let evCities: any = null;
  let evAttached = false;

  const onRegionMove = () => tick();
  const onRegionZoom = () => tick();
  const onSectorUpdated = () => tick();
  const onCitiesChange = () => tick();

  function detachEvents(api?: any): void {
    try {
      const ClientLib: any = api && api.ClientLib ? api.ClientLib : (window as any).ClientLib;
      const util: any = (window as any).webfrontend && (window as any).webfrontend.phe && (window as any).webfrontend.phe.cnc && (window as any).webfrontend.phe.cnc.Util ? (window as any).webfrontend.phe.cnc.Util : null;
      if (!ClientLib || !util || typeof util.detachNetEvent !== 'function') {
        evRegion = null;
        evCities = null;
        evAttached = false;
        return;
      }

      try {
        if (evRegion) {
          util.detachNetEvent(evRegion, 'PositionChange', ClientLib.Vis.PositionChange, ctx, onRegionMove);
          util.detachNetEvent(evRegion, 'ZoomFactorChange', ClientLib.Vis.ZoomFactorChange, ctx, onRegionZoom);
          util.detachNetEvent(evRegion, 'SectorUpdated', ClientLib.Vis.Region.SectorUpdated, ctx, onSectorUpdated);
        }
      } catch {
        // ignore
      }

      try {
        if (evCities) {
          util.detachNetEvent(evCities, 'Change', ClientLib.Data.CitiesChange, ctx, onCitiesChange);
        }
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }

    evRegion = null;
    evCities = null;
    evAttached = false;
  }

  function tryAttachEvents(api: any, region: any): void {
    try {
      const ClientLib: any = api && api.ClientLib ? api.ClientLib : null;
      const util: any = (window as any).webfrontend && (window as any).webfrontend.phe && (window as any).webfrontend.phe.cnc && (window as any).webfrontend.phe.cnc.Util ? (window as any).webfrontend.phe.cnc.Util : null;
      if (!ClientLib || !util || typeof util.attachNetEvent !== 'function') return;
      if (!region) return;

      // Already attached to this region
      if (evAttached && evRegion === region) return;

      // Region changed, detach old
      if (evAttached) detachEvents(api);

      const md = api.mainData || (ClientLib.Data && ClientLib.Data.MainData && ClientLib.Data.MainData.GetInstance ? ClientLib.Data.MainData.GetInstance() : null);
      const cities = md && typeof md.get_Cities === 'function' ? md.get_Cities() : null;

      util.attachNetEvent(region, 'PositionChange', ClientLib.Vis.PositionChange, ctx, onRegionMove);
      util.attachNetEvent(region, 'ZoomFactorChange', ClientLib.Vis.ZoomFactorChange, ctx, onRegionZoom);
      util.attachNetEvent(region, 'SectorUpdated', ClientLib.Vis.Region.SectorUpdated, ctx, onSectorUpdated);
      if (cities) util.attachNetEvent(cities, 'Change', ClientLib.Data.CitiesChange, ctx, onCitiesChange);

      evRegion = region;
      evCities = cities;
      evAttached = true;
    } catch {
      // ignore
    }
  }

  function ensureOverlay(): HTMLElement | null {
    try {
      if (overlay && overlay.parentNode) return overlay;

      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      const parent = canvas && canvas.parentElement ? canvas.parentElement : null;
      if (!parent) return null;

      const el = document.createElement('div');
      el.id = 'cad-teamobj-overlay';
      el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:10;';
      parent.appendChild(el);
      overlay = el;
      return el;
    } catch {
      return null;
    }
  }

  function clear(): void {
    try {
      if (overlay) overlay.innerHTML = '';
    } catch {
      // ignore
    }
  }

  function stop(): void {
    try {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    } catch {
      // ignore
    }
    try {
      if (raf !== null) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
    } catch {
      // ignore
    }

    try {
      detachEvents(getGameApi({ refresh: true }));
    } catch {
      // ignore
    }
    clear();
  }

  function shouldDraw(api: any): boolean {
    try {
      const ClientLib: any = api.ClientLib;
      const visMain = api.visMain;
      if (!ClientLib || !visMain) return false;
      if (ClientLib.Vis && ClientLib.Vis.Mode && typeof visMain.get_Mode === 'function') {
        return visMain.get_Mode() === ClientLib.Vis.Mode.Region;
      }
      return true;
    } catch {
      return false;
    }
  }

  function tick(): void {
    try {
      const api = getGameApi({ refresh: true });
      const visMain = api.visMain || (api.ClientLib && api.ClientLib.Vis && api.ClientLib.Vis.VisMain && api.ClientLib.Vis.VisMain.GetInstance ? api.ClientLib.Vis.VisMain.GetInstance() : null);
      const region = api.region || (visMain && visMain.get_Region ? visMain.get_Region() : null);
      if (!region || !shouldDraw(api)) {
        clear();
        return;
      }

      // Prefer event-driven updates like Shockr Tools; if this succeeds we can avoid heavy polling.
      tryAttachEvents(api, region);

      if (!visMain || typeof (visMain as any).ScreenPosFromWorldPosX !== 'function' || typeof (visMain as any).ScreenPosFromWorldPosY !== 'function') {
        clear();
        return;
      }

      const gridWidth = typeof (region as any).get_GridWidth === 'function' ? Number((region as any).get_GridWidth()) : NaN;
      const gridHeight = typeof (region as any).get_GridHeight === 'function' ? Number((region as any).get_GridHeight()) : NaN;
      const viewW = typeof (region as any).get_ViewWidth === 'function' ? Number((region as any).get_ViewWidth()) : NaN;
      const viewH = typeof (region as any).get_ViewHeight === 'function' ? Number((region as any).get_ViewHeight()) : NaN;
      if (![gridWidth, gridHeight, viewW, viewH].every((n) => isFinite(n)) || gridWidth <= 0 || gridHeight <= 0) {
        clear();
        return;
      }

      const selfId = getSelfPlayerId();
      const teamId = getSelfTeamId(selfId);
      if (!teamId) {
        clear();
        return;
      }

      const teams = loadTeams();
      const team = teams.find((t) => String((t as any).id) === String(teamId));
      const teamName = team && typeof (team as any).name === 'string' ? String((team as any).name) : '';
      const objs: any[] = team && Array.isArray((team as any).objectives) ? (team as any).objectives : [];
      if (!objs.length) {
        clear();
        return;
      }

      const root = ensureOverlay();
      if (!root) return;
      root.innerHTML = '';

      objs.forEach((o) => {
        try {
          const x = Number((o as any).x);
          const y = Number((o as any).y);
          if (!isFinite(x) || !isFinite(y)) return;

          const top = (visMain as any).ScreenPosFromWorldPosY((y + 0.1) * gridHeight);
          const left = (visMain as any).ScreenPosFromWorldPosX((x + 0.1) * gridWidth);
          if (!isFinite(top) || !isFinite(left)) return;
          if (top < 0 || left < 0 || top > viewH || left > viewW) return;

          const size = 34;

          const poiCol = getObjectiveColor(o);
          const isPoi = isPoiObjective(o);
          const col = isPoi ? poiCol : '#ef4444';
          const ring = col ? col : 'rgba(255,255,255,.35)';

          const m = document.createElement('div');
          m.className = 'cad-teamobj-marker';
          try {
            const tn = teamName ? teamName : 'Team';
            (m as any).title = tn + ' target';
          } catch {
            // ignore
          }
          m.style.cssText =
            'position:absolute;left:' +
            String(Math.round(left)) +
            'px;top:' +
            String(Math.round(top)) +
            'px;width:' +
            String(size) +
            'px;height:' +
            String(size) +
            'px;border-radius:999px;pointer-events:none;' +
            'background:rgba(0,0,0,.82);' +
            'border:2px solid rgba(0,0,0,.95);' +
            'box-shadow:inset 0 0 0 2px ' +
            ring +
            ', 0 10px 24px rgba(0,0,0,.55);' +
            'display:flex;align-items:center;justify-content:center;';

          const icon = document.createElement('div');
          icon.style.cssText = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;';
          const fill = col ? col : '#e9eef7';
          if (isPoi) {
            icon.innerHTML =
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8.01 8.01 0 0 1-8 8Z" fill="' +
              fill +
              '" opacity=".92"/>' +
              '<path d="M12 6a6 6 0 1 0 6 6 6.01 6.01 0 0 0-6-6Zm0 10a4 4 0 1 1 4-4 4.01 4.01 0 0 1-4 4Z" fill="' +
              fill +
              '" opacity=".92"/>' +
              '<path d="M12 10a2 2 0 1 0 2 2 2.01 2.01 0 0 0-2-2Z" fill="' +
              fill +
              '"/>' +
              '</svg>';
          } else {
            // skull
            icon.innerHTML =
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M12 2C7.58 2 4 5.58 4 10c0 3.12 1.79 5.83 4.4 7.14V20c0 1.1.9 2 2 2h3.2c1.1 0 2-.9 2-2v-2.86C18.21 15.83 20 13.12 20 10c0-4.42-3.58-8-8-8Z" fill="' +
              fill +
              '" opacity=".92"/>' +
              '<path d="M9.2 14.6c.66 0 1.2-.54 1.2-1.2s-.54-1.2-1.2-1.2S8 12.74 8 13.4s.54 1.2 1.2 1.2Zm5.6 0c.66 0 1.2-.54 1.2-1.2s-.54-1.2-1.2-1.2-1.2.54-1.2 1.2.54 1.2 1.2 1.2Z" fill="#0b0b0b" opacity=".9"/>' +
              '<path d="M10.2 19.2h1.3v1.6h-1.3v-1.6Zm2.3 0h1.3v1.6h-1.3v-1.6Z" fill="#0b0b0b" opacity=".9"/>' +
              '</svg>';
          }
          m.appendChild(icon);

          root.appendChild(m);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }

  function start(): void {
    if (timer !== null || raf !== null) return;

    // Minimal fallback polling (events usually keep this updated)
    timer = window.setInterval(() => {
      try {
        if (!evAttached) tick();
      } catch {
        // ignore
      }
    }, 1200);

    // RAF fallback (useful if events fail for any reason)
    const loop = (t: number) => {
      try {
        if (evAttached) {
          // If events are attached, we don't need continuous RAF work.
          lastRafTick = t;
        } else if (!lastRafTick || t - lastRafTick > 60) {
          lastRafTick = t;
          tick();
        }
      } catch {
        // ignore
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    tick();
  }

  try {
    ctx.store.subscribe(() => {
      try {
        const s: any = ctx.store.getState();
        const d: any = s && s.data ? s.data : null;
        void d;
        tick();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }

  start();
}
