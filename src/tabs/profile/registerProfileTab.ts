import { getAppContext } from '../../app/global';
import { getGameApi } from '../../services/gameApi';
import { computeTierForPlayer, getEffectiveTargetsForPlayer, getPlayerTeamId } from '../../services/targetsTier';
import { centerMapTo } from '../../services/map';
import { loadLastBulletin } from '../../services/getbackBulletin';
import { loadTeams, loadAssignments } from '../teams/model';

export function registerProfileTabTs(): void {
  const ctx = getAppContext();
  const { registry, makeEl, store } = ctx;

  registry.registerTab({
    id: 'profile',
    title: 'Profile',
    icon: 'mdi:account-circle-outline',
    render: (container) => {
      const wrap = makeEl('div', { class: 'cad-details' });
      (wrap as HTMLElement).style.cssText = 'flex:1;min-height:0;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;';

      const card = makeEl('div', { class: 'cad-card' });
      (card as HTMLElement).style.cssText =
        'border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;';

      const h = makeEl('h3');
      h.textContent = 'Profile';
      (h as HTMLElement).style.cssText = 'margin:0;font-size:13px;';

      const body = makeEl('div');
      (body as HTMLElement).style.cssText = 'display:flex;flex-direction:column;gap:10px;';

      let countdownTimer: any = null;

      function safeText(v: any): string {
        try {
          const s = String(v ?? '').trim();
          return s ? s : '-';
        } catch {
          return '-';
        }
      }

      function readPlayerNumber(player: any, keys: string[]): number | null {
        try {
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const fn = player && (player as any)[k];
            if (typeof fn === 'function') {
              const v = Number(fn.call(player));
              if (isFinite(v)) return v;
            }
          }
        } catch {
          // ignore
        }
        return null;
      }

      function getBaseFoundPlan(): { etaMs: number | null; rpPct: number | null } {
        try {
          const w: any = window as any;
          const ClientLib = w.ClientLib;
          const md = ClientLib?.Data?.MainData?.GetInstance?.();
          const player = md?.get_Player?.();
          if (!player) return { etaMs: null, rpPct: null };

          const faction = typeof player.get_Faction === 'function' ? player.get_Faction() : null;
          const techId = ClientLib?.Base?.Tech?.GetTechIdFromTechNameAndFaction?.(ClientLib?.Base?.ETechName?.Research_BaseFound, faction);
          const pr = typeof player.get_PlayerResearch === 'function' ? player.get_PlayerResearch() : null;
          const item = pr && typeof pr.GetResearchItemFomMdbId === 'function' ? pr.GetResearchItemFomMdbId(techId) : null;
          if (!item) return { etaMs: null, rpPct: null };

          const next = typeof item.get_NextLevelInfo_Obj === 'function' ? item.get_NextLevelInfo_Obj() : null;
          const rr = next && Array.isArray(next.rr) ? next.rr : [];

          let rpNeeded: number | null = null;
          let creditsNeeded: number | null = null;
          for (let i = 0; i < rr.length; i++) {
            const e = rr[i];
            if (!e || !e.t || !e.c) continue;
            if (e.t === ClientLib?.Base?.EResourceType?.ResearchPoints) rpNeeded = Number(e.c);
            if (e.t === ClientLib?.Base?.EResourceType?.Gold) creditsNeeded = Number(e.c);
          }

          const rpNow = readPlayerNumber(player, ['get_ResearchPoints', 'GetResearchPoints']) ?? null;
          const rpGrowth =
            readPlayerNumber(player, ['get_ResearchPointsGrowth', 'GetResearchPointsGrowth', 'GetResearchPointGrowth', 'get_ResearchPointGrowth']) ?? null;

          const creditsNow = readPlayerNumber(player, ['GetCreditsCount', 'get_CreditsCount']) ?? null;
          let creditsGrowthPerHour: number | null = null;
          try {
            const creditsResourceData = typeof player.get_Credits === 'function' ? player.get_Credits() : null;
            const delta = creditsResourceData && isFinite(Number(creditsResourceData.Delta)) ? Number(creditsResourceData.Delta) : 0;
            const extra = creditsResourceData && isFinite(Number(creditsResourceData.ExtraBonusDelta)) ? Number(creditsResourceData.ExtraBonusDelta) : 0;
            const sph = md?.get_Time?.()?.get_StepsPerHour?.();
            const sphNum = isFinite(Number(sph)) ? Number(sph) : null;
            if (sphNum) creditsGrowthPerHour = (delta + extra) * sphNum;
          } catch {
            // ignore
          }

          let etaMs = 0;

          if (typeof creditsNeeded === 'number' && isFinite(creditsNeeded) && creditsNeeded > 0) {
            if (creditsNow !== null && creditsGrowthPerHour && creditsGrowthPerHour > 0) {
              const left = Math.max(0, creditsNeeded - creditsNow);
              etaMs = Math.max(etaMs, (left / creditsGrowthPerHour) * 3600 * 1000);
            }
          }

          if (typeof rpNeeded === 'number' && isFinite(rpNeeded) && rpNeeded > 0) {
            if (rpNow !== null && rpGrowth !== null && rpGrowth > 0) {
              const left = Math.max(0, rpNeeded - rpNow);
              etaMs = Math.max(etaMs, (left / rpGrowth) * 3600 * 1000);
            }
          }

          const rpPct =
            typeof rpNeeded === 'number' && isFinite(rpNeeded) && rpNeeded > 0 && rpNow !== null
              ? Math.max(0, Math.min(100, (rpNow / rpNeeded) * 100))
              : null;

          return { etaMs: isFinite(etaMs) ? etaMs : null, rpPct };
        } catch {
          return { etaMs: null, rpPct: null };
        }
      }

      function formatMsLeft(msLeft: number): string {
        try {
          if (!isFinite(msLeft)) return '-';
          if (msLeft < 0) msLeft = 0;
          const sec = Math.floor(msLeft / 1000);
          const days = Math.floor(sec / 86400);
          const hrs = Math.floor((sec % 86400) / 3600);
          const mins = Math.floor((sec % 3600) / 60);
          const s = sec % 60;

          if (days > 0) return days + 'd ' + hrs + 'h';
          if (hrs > 0) return hrs + 'h ' + mins + 'm';
          if (mins > 0) return mins + 'm ' + s + 's';
          return s + 's';
        } catch {
          return '-';
        }
      }

      function updateCountdowns(): void {
        try {
          const host = body as HTMLElement;
          const nodes = host.querySelectorAll('[data-cad-deadline-ms]');
          const now = Date.now();
          nodes.forEach((n) => {
            try {
              const el = n as HTMLElement;
              const raw = el.getAttribute('data-cad-deadline-ms');
              const ms = raw ? Number(raw) : NaN;
              if (!isFinite(ms)) {
                el.textContent = '-';
                return;
              }
              const left = ms - now;
              el.textContent = formatMsLeft(left);
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }
      }

      function getSelfPlayer(): any {
        try {
          const api = getGameApi();
          const md = api.mainData;
          const p = md && typeof md.get_Player === 'function' ? md.get_Player() : null;
          if (p) {
            const id = typeof p.get_Id === 'function' ? p.get_Id() : (p as any).Id ?? (p as any).id;
            const name = typeof p.get_Name === 'function' ? p.get_Name() : (p as any).Name ?? (p as any).name;
            return { id, name, raw: p, member: null };
          }
        } catch {
          // ignore
        }

        // fallback: try from store players list using detected player id
        try {
          const playersNow: any[] = (store.getState() as any).data?.players || [];
          const api = getGameApi();
          const md = api.mainData;
          const p = md && typeof md.get_Player === 'function' ? md.get_Player() : null;
          const id = p && typeof p.get_Id === 'function' ? p.get_Id() : null;
          if (id !== null && id !== undefined) {
            const found = playersNow.find((pp) => String(pp?.id) === String(id));
            if (found) return found;
          }
        } catch {
          // ignore
        }

        return null;
      }

      function getMemberStatsFromStore(selfId: any): any {
        try {
          const playersNow: any[] = (store.getState() as any).data?.players || [];
          const found = playersNow.find((pp) => String(pp?.id) === String(selfId));
          return found ? found : null;
        } catch {
          return null;
        }
      }

      function render(): void {
        (body as HTMLElement).innerHTML = '';

        const self0 = getSelfPlayer();
        if (!self0) {
          const msg = makeEl('div');
          msg.textContent = 'Player info not available yet.';
          (msg as HTMLElement).style.cssText = 'color:rgba(233,238,247,.75);font-size:12px;';
          body.appendChild(msg);
          return;
        }

        const self = (() => {
          const enriched = getMemberStatsFromStore((self0 as any).id);
          return enriched ? enriched : self0;
        })();

        const pid = (self as any).id;
        const pname = (self as any).name;

        const teamIdFromLocal = getPlayerTeamId(pid);

        const bulletin = loadLastBulletin();
        const teams = loadTeams();
        const assignments = loadAssignments();

        const teamIdFromBulletin = (() => {
          try {
            const tmap: any = bulletin && (bulletin as any).teamAssignments ? (bulletin as any).teamAssignments : null;
            return tmap && tmap[String(pid)] ? String(tmap[String(pid)]) : '';
          } catch {
            return '';
          }
        })();

        const teamId = teamIdFromBulletin || teamIdFromLocal;
        const team = teamId ? teams.find((t) => String(t.id) === String(teamId)) : null;

        const tier = computeTierForPlayer(self);
        const eff = getEffectiveTargetsForPlayer(self);

        const kv = makeEl('div');
        (kv as HTMLElement).style.cssText = 'display:grid;grid-template-columns: 140px 1fr;gap:8px 12px;font-size:12px;';

        const addKV = (k: string, v: string) => {
          const kk = makeEl('div');
          (kk as HTMLElement).style.cssText = 'color:rgba(233,238,247,.66);';
          kk.textContent = k;
          const vv = makeEl('div');
          (vv as HTMLElement).style.cssText = 'color:rgba(233,238,247,.92);word-break:break-word;';
          vv.textContent = v;
          kv.appendChild(kk);
          kv.appendChild(vv);
        };

        const addKVNode = (k: string, node: HTMLElement) => {
          const kk = makeEl('div');
          (kk as HTMLElement).style.cssText = 'color:rgba(233,238,247,.66);';
          kk.textContent = k;
          const vv = makeEl('div');
          (vv as HTMLElement).style.cssText = 'color:rgba(233,238,247,.92);word-break:break-word;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
          vv.appendChild(node);
          kv.appendChild(kk);
          kv.appendChild(vv);
        };

        const makeTierBadge = (tierName: string | null): HTMLElement => {
          const t = tierName ? String(tierName) : '';
          const norm = t.toLowerCase();
          let label = t || '-';
          let color = 'rgba(255,255,255,.18)';
          let bg = 'rgba(255,255,255,.06)';
          if (norm === 'gold') {
            color = '#fbbf24';
            bg = 'rgba(251,191,36,.14)';
            label = 'Gold';
          } else if (norm === 'silver') {
            color = '#cbd5e1';
            bg = 'rgba(203,213,225,.14)';
            label = 'Silver';
          } else if (norm === 'bronze') {
            color = '#cd7f32';
            bg = 'rgba(205,127,50,.16)';
            label = 'Bronze';
          }

          const badge = makeEl('div');
          (badge as HTMLElement).style.cssText =
            'display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:1000;letter-spacing:.2px;white-space:nowrap;border:1px solid ' +
            color +
            ';background:' +
            bg +
            ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);';

          const icon = makeEl('span');
          (icon as HTMLElement).style.cssText = 'width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;';
          (icon as HTMLElement).innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M8 3H5a2 2 0 0 0-2 2v3a6 6 0 0 0 6 6h.2a7 7 0 0 1-.2-2V3Z" fill="' +
            color +
            '" opacity=".25"/>' +
            '<path d="M16 3h3a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h-.2a7 7 0 0 0 .2-2V3Z" fill="' +
            color +
            '" opacity=".25"/>' +
            '<path d="M8 3h8v9a4 4 0 0 1-4 4 4 4 0 0 1-4-4V3Z" stroke="' +
            color +
            '" stroke-width="1.7"/>' +
            '<path d="M10 21h4" stroke="' +
            color +
            '" stroke-width="1.7" stroke-linecap="round"/>' +
            '<path d="M12 16v5" stroke="' +
            color +
            '" stroke-width="1.7" stroke-linecap="round"/>' +
            '<path d="M12 7l1.1 2.2 2.4.35-1.75 1.7.41 2.4L12 12.9l-2.16 1.14.41-2.4L8.5 9.55l2.4-.35L12 7Z" fill="' +
            color +
            '"/>' +
            '</svg>';

          const txt = makeEl('span');
          (txt as HTMLElement).style.cssText = 'color:rgba(233,238,247,.95);';
          txt.textContent = label;

          badge.appendChild(icon);
          badge.appendChild(txt);
          return badge as HTMLElement;
        };

        addKV('Name', safeText(pname));
        addKVNode('Tier', makeTierBadge(tier ? tier : null));
        addKV('Team', team ? safeText(team.name) : teamId ? 'Team ' + String(teamId) : '-');

        body.appendChild(kv);

        try {
          const milestones = eff && Array.isArray((eff as any).milestones) ? (eff as any).milestones : [];
          if (milestones.length) {
            const msCard = makeEl('div');
            (msCard as HTMLElement).style.cssText =
              'border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.10);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px;';

            const title = makeEl('div');
            title.textContent = 'Base milestones';
            (title as HTMLElement).style.cssText = 'font-weight:900;font-size:12px;';
            msCard.appendChild(title);

            const bf = getBaseFoundPlan();
            if (typeof bf.rpPct === 'number' && isFinite(bf.rpPct)) {
              const sub = makeEl('div');
              sub.textContent = 'BaseFound RP: ' + Math.round(bf.rpPct) + '%';
              (sub as HTMLElement).style.cssText = 'color:rgba(233,238,247,.70);font-size:12px;';
              msCard.appendChild(sub);
            }

            const curBases = typeof (self as any).bases === 'number' && isFinite((self as any).bases) ? Number((self as any).bases) : null;

            milestones
              .slice()
              .sort((a: any, b: any) => {
                const da = a && a.deadline ? Date.parse(String(a.deadline)) : NaN;
                const db = b && b.deadline ? Date.parse(String(b.deadline)) : NaN;
                if (isFinite(da) && isFinite(db) && da !== db) return da - db;
                const ba = a && a.bases !== undefined ? Number(a.bases) : NaN;
                const bb = b && b.bases !== undefined ? Number(b.bases) : NaN;
                if (isFinite(ba) && isFinite(bb) && ba !== bb) return ba - bb;
                return 0;
              })
              .forEach((m: any) => {
                const basesReq = m && m.bases !== undefined ? Number(m.bases) : NaN;
                const deadlineMs = m && m.deadline ? Date.parse(String(m.deadline)) : NaN;
                const deadlineOk = isFinite(deadlineMs);
                const now = Date.now();
                const isLate = deadlineOk && now > deadlineMs && curBases !== null && isFinite(basesReq) && curBases < basesReq;

                const row = makeEl('div');
                (row as HTMLElement).style.cssText =
                  'border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);border-radius:12px;padding:8px 10px;display:flex;align-items:center;gap:10px;';

                const left = makeEl('div');
                (left as HTMLElement).style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';
                const l1 = makeEl('div');
                l1.textContent = isFinite(basesReq) ? 'Bases: ' + String(basesReq) : 'Bases: -';
                (l1 as HTMLElement).style.cssText = 'font-weight:900;font-size:12px;';
                const l2 = makeEl('div');
                l2.textContent = deadlineOk ? new Date(deadlineMs).toLocaleString() : '-';
                (l2 as HTMLElement).style.cssText = 'color:rgba(233,238,247,.70);font-size:12px;';
                left.appendChild(l1);
                left.appendChild(l2);

                const right = makeEl('div');
                (right as HTMLElement).style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:8px;';

                if (curBases !== null) {
                  const cur = makeEl('div');
                  cur.textContent = String(curBases) + ' / ' + (isFinite(basesReq) ? String(basesReq) : '-');
                  (cur as HTMLElement).style.cssText =
                    'flex:0 0 auto;font-size:11px;font-weight:900;color:rgba(233,238,247,.86);border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.20);padding:4px 8px;border-radius:999px;white-space:nowrap;';
                  right.appendChild(cur);
                }

                if (!isLate && deadlineOk) {
                  const left = makeEl('div');
                  (left as HTMLElement).setAttribute('data-cad-deadline-ms', String(deadlineMs));
                  left.textContent = formatMsLeft(deadlineMs - now);
                  (left as HTMLElement).style.cssText =
                    'flex:0 0 auto;font-size:11px;font-weight:900;color:rgba(233,238,247,.86);border:1px solid var(--cad-accent-20);background:var(--cad-accent-08);padding:4px 10px;border-radius:999px;white-space:nowrap;';
                  right.appendChild(left);
                }

                try {
                  if (!isLate && deadlineOk && curBases !== null && isFinite(basesReq) && curBases < basesReq) {
                    const needBases = Math.max(0, Math.ceil(basesReq - curBases));
                    if (needBases === 1 && bf && typeof bf.etaMs === 'number' && isFinite(bf.etaMs)) {
                      const etaOne = Math.max(0, bf.etaMs);
                      const etaAt = now + etaOne;
                      const ok = etaAt <= deadlineMs;

                      const etaPill = makeEl('div');
                      etaPill.textContent = 'ETA: ' + formatMsLeft(etaOne);
                      (etaPill as HTMLElement).style.cssText =
                        'flex:0 0 auto;font-size:11px;font-weight:900;color:rgba(233,238,247,.86);border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.20);padding:4px 10px;border-radius:999px;white-space:nowrap;';
                      right.appendChild(etaPill);

                      const verdict = makeEl('div');
                      verdict.textContent = ok ? 'ON TIME' : 'MISS';
                      (verdict as HTMLElement).style.cssText =
                        'flex:0 0 auto;font-size:11px;font-weight:1000;color:white;border:1px solid rgba(255,255,255,.10);background:' +
                        (ok ? '#16a34a' : '#ef4444') +
                        ';padding:4px 10px;border-radius:999px;white-space:nowrap;';
                      right.appendChild(verdict);
                    }
                  }
                } catch {
                  // ignore
                }

                if (isLate) {
                  const warn = makeEl('div');
                  warn.textContent = 'LATE';
                  (warn as HTMLElement).style.cssText =
                    'flex:0 0 auto;font-size:11px;font-weight:1000;color:white;border:1px solid rgba(255,255,255,.10);background:#ef4444;padding:4px 10px;border-radius:999px;white-space:nowrap;';
                  right.appendChild(warn);
                }

                row.appendChild(left);
                row.appendChild(right);
                msCard.appendChild(row);
              });

            body.appendChild(msCard);
          }
        } catch {
          // ignore
        }

        try {
          if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
          }
          countdownTimer = setInterval(() => updateCountdowns(), 1000);
          updateCountdowns();
        } catch {
          // ignore
        }

        if (team) {
          const teamCard = makeEl('div');
          (teamCard as HTMLElement).style.cssText =
            'border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.10);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px;';

          const th = makeEl('div');
          th.textContent = 'Team objectives';
          (th as HTMLElement).style.cssText = 'font-weight:900;font-size:12px;';
          teamCard.appendChild(th);

          const objWrap = makeEl('div');
          (objWrap as HTMLElement).style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

          const objs = Array.isArray(team.objectives) ? team.objectives : [];
          if (!objs.length) {
            const none = makeEl('div');
            none.textContent = '(no objectives)';
            (none as HTMLElement).style.cssText = 'color:rgba(233,238,247,.70);font-size:12px;';
            objWrap.appendChild(none);
          } else {
            objs.forEach((o: any) => {
              const pill = makeEl('button', { class: 'cad-btn', type: 'button' }) as HTMLButtonElement;
              const POI_TYPE_NAME_BY_ID: Record<number, string> = {
                1: 'Tiberium',
                2: 'Crystal',
                3: 'Reactor',
                4: 'Tungsten',
                5: 'Uranium',
                6: 'Aircraft',
                7: 'Resonator'
              };
              const POI_TYPE_COLOR_BY_ID: Record<number, string> = {
                1: '#3CE685',
                2: '#44DBF4',
                3: '#84DCE3',
                4: '#CC6F66',
                5: '#B0ADF6',
                6: '#BDD7E5',
                7: '#F5A6C7'
              };

              const baseTxt = String(o.x) + ':' + String(o.y);
              let poiTxt = '';
              let poiColor: string | null = null;
              try {
                const lvl = o.poiLevel !== undefined && o.poiLevel !== null && isFinite(Number(o.poiLevel)) ? Number(o.poiLevel) : null;
                const tid = o.poiTypeId !== undefined && o.poiTypeId !== null && isFinite(Number(o.poiTypeId)) ? Number(o.poiTypeId) : null;
                if (lvl !== null && tid !== null) {
                  const nm = POI_TYPE_NAME_BY_ID[tid] ? String(POI_TYPE_NAME_BY_ID[tid]) : 'TypeId ' + String(tid);
                  poiTxt = ' [' + nm + ' ' + String(lvl) + ']';
                  poiColor = POI_TYPE_COLOR_BY_ID[tid] ? String(POI_TYPE_COLOR_BY_ID[tid]) : null;
                }
              } catch {
                // ignore
              }

              pill.textContent = baseTxt + poiTxt;
              pill.style.cssText = 'border:1px solid var(--cad-accent-20);background:var(--cad-accent-08);';
              try {
                if (poiColor) {
                  pill.style.borderColor = poiColor;
                  pill.style.background = 'rgba(0,0,0,.10)';
                  pill.style.boxShadow = 'inset 0 0 0 1px ' + poiColor;
                }
              } catch {
                // ignore
              }
              pill.addEventListener('click', () => {
                try {
                  centerMapTo(Number(o.x), Number(o.y));
                } catch {
                  // ignore
                }
              });
              objWrap.appendChild(pill);
            });
          }

          teamCard.appendChild(objWrap);

          const matesTitle = makeEl('div');
          matesTitle.textContent = 'Team mates';
          (matesTitle as HTMLElement).style.cssText = 'font-weight:900;font-size:12px;margin-top:6px;';
          teamCard.appendChild(matesTitle);

          const mates = makeEl('div');
          (mates as HTMLElement).style.cssText = 'display:flex;flex-direction:column;gap:6px;';

          const playersNow: any[] = (store.getState() as any).data?.players || [];
          const mateIds = Object.keys(assignments || {}).filter((k) => String((assignments as any)[k]) === String(team.id));
          const mateRows = mateIds
            .map((mid) => {
              const p = playersNow.find((pp) => String(pp?.id) === String(mid));
              const nm = p && p.name ? String(p.name) : String(mid);
              return { id: mid, name: nm, tier: p ? computeTierForPlayer(p) : '' };
            })
            .filter((x) => String(x.id) !== String(pid));

          if (!mateRows.length) {
            const none = makeEl('div');
            none.textContent = '(no teammates found)';
            (none as HTMLElement).style.cssText = 'color:rgba(233,238,247,.70);font-size:12px;';
            mates.appendChild(none);
          } else {
            mateRows.forEach((m) => {
              const row = makeEl('div');
              (row as HTMLElement).style.cssText =
                'border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);border-radius:12px;padding:8px 10px;display:flex;align-items:center;gap:10px;';

              const nm = makeEl('div');
              nm.textContent = m.name;
              (nm as HTMLElement).style.cssText = 'font-weight:800;font-size:12px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

              const tierPill = makeEl('div');
              tierPill.textContent = m.tier ? m.tier : '-';
              (tierPill as HTMLElement).style.cssText =
                'flex:0 0 auto;font-size:11px;font-weight:900;color:rgba(233,238,247,.86);border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.20);padding:4px 8px;border-radius:999px;white-space:nowrap;';

              row.appendChild(nm);
              row.appendChild(tierPill);
              mates.appendChild(row);
            });
          }

          teamCard.appendChild(mates);
          body.appendChild(teamCard);
        }
      }

      const unsubscribe = store.subscribe(render);
      render();
      container.addEventListener(
        'ad:cleanup',
        () => {
          try {
            unsubscribe();
          } catch {
            // ignore
          }

          try {
            if (countdownTimer) {
              clearInterval(countdownTimer);
              countdownTimer = null;
            }
          } catch {
            // ignore
          }
        },
        { once: true }
      );

      card.appendChild(h);
      card.appendChild(body);
      wrap.appendChild(card);
      container.appendChild(wrap);
    }
  });
}
