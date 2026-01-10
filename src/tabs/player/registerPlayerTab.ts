import { getAppContext } from '../../app/global';
import {
  applyTargetsFromBulletin,
  applyTeamsFromBulletin,
  fetchBulletin,
  loadGetBackConfig,
  loadLastBulletin,
  saveGetBackConfig,
  saveLastBulletin
} from '../../services/getbackBulletin';
import { loadTargetsMilestones, loadTargetsOverrides, loadTargetsTiers } from '../targets/model';

export function registerPlayerTabTs(): void {
  const ctx = getAppContext();
  const { registry, makeEl, store } = ctx;

  registry.registerTab({
    id: 'player',
    title: 'Sync',
    icon: 'mdi:cloud-upload-outline',
    render: (container) => {
      const wrap = makeEl('div', { class: 'cad-details' });
      const card = makeEl('div', { class: 'cad-card' });
      const h = makeEl('h3', { text: 'Sync' });

      const detected = makeEl('div');
      (detected as HTMLElement).style.cssText =
        'font-size:12px;color:rgba(233,238,247,.86);border:1px solid rgba(239,68,68,.30);background:rgba(239,68,68,.08);padding:8px 10px;border-radius:12px;display:none;';
      detected.textContent = '';

      const status = makeEl('div');
      (status as HTMLElement).style.cssText =
        'font-size:12px;color:rgba(233,238,247,.78);border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.10);padding:8px 10px;border-radius:12px;';
      status.textContent = 'Idle';

      const cfg = loadGetBackConfig();

      const form = makeEl('div');
      (form as HTMLElement).style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      const uuid = makeEl('input', { type: 'text', placeholder: 'Bulletin UUID (ADID:...)' }) as HTMLInputElement;
      uuid.style.cssText =
        'width:100%;box-sizing:border-box;border-radius:12px;padding:10px 10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:#e9eef7;outline:none;font-size:12px;';
      uuid.value = cfg.uuid;

      const pass = makeEl('input', { type: 'password', placeholder: 'Read passphrase (optional)' }) as HTMLInputElement;
      pass.style.cssText = uuid.style.cssText;
      pass.value = cfg.readPassphrase;

      const btnRow = makeEl('div');
      (btnRow as HTMLElement).style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';

      const btnFetch = makeEl('button', { class: 'cad-btn', type: 'button' }) as HTMLButtonElement;
      btnFetch.textContent = 'Fetch bulletin';
      btnFetch.style.cssText = 'border:1px solid var(--cad-accent-28);background:var(--cad-accent-10);';

      const btnSave = makeEl('button', { class: 'cad-btn', type: 'button' }) as HTMLButtonElement;
      btnSave.textContent = 'Save config';

      btnRow.appendChild(btnFetch);
      btnRow.appendChild(btnSave);

      form.appendChild(uuid);
      form.appendChild(pass);
      form.appendChild(btnRow);

      const targetsCard = makeEl('div', { class: 'cad-card' });
      (targetsCard as HTMLElement).style.cssText =
        'border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;';
      const targetsH = makeEl('h3');
      targetsH.textContent = 'Targets (from bulletin)';

      const targetsPre = makeEl('pre');
      (targetsPre as HTMLElement).style.cssText =
        'margin:0;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.12);border:1px solid rgba(255,255,255,.08);color:rgba(233,238,247,.92);font-size:11px;white-space:pre-wrap;word-break:break-word;';

      function renderTargets(): void {
        try {
          const tiers = loadTargetsTiers();
          const milestones = loadTargetsMilestones();
          const overrides = loadTargetsOverrides();
          (targetsPre as HTMLElement).textContent = JSON.stringify({ tiers, milestones, overrides }, null, 2);
        } catch {
          (targetsPre as HTMLElement).textContent = '(failed to render targets)';
        }
      }

      function renderDetected(): void {
        try {
          const s: any = store.getState();
          const d: any = s && s.data ? s.data : null;
          const du = d && typeof d.getbackDetectedUuid === 'string' ? String(d.getbackDetectedUuid) : '';
          const dt = d && d.getbackDetectedAt !== undefined ? Number(d.getbackDetectedAt) : 0;
          const has = !!du;
          (detected as HTMLElement).style.display = has ? 'block' : 'none';
          if (!has) return;
          const when = dt && isFinite(dt) ? new Date(dt).toLocaleString() : '-';
          detected.textContent = 'Detected ADID: ' + du + ' (' + when + ')';

          // auto-fill input if it's empty or different
          try {
            if (String(uuid.value || '').trim() !== du) uuid.value = du;
          } catch {
            // ignore
          }
        } catch {
          // ignore
        }
      }

      targetsCard.appendChild(targetsH);
      targetsCard.appendChild(targetsPre);

      const bulletinCard = makeEl('div', { class: 'cad-card' });
      (bulletinCard as HTMLElement).style.cssText =
        'border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;';
      const bulletinH = makeEl('h3');
      bulletinH.textContent = 'Bulletin (full payload)';

      const bulletinPre = makeEl('pre');
      (bulletinPre as HTMLElement).style.cssText = (targetsPre as HTMLElement).style.cssText;

      function renderBulletin(): void {
        try {
          const b = loadLastBulletin();
          (bulletinPre as HTMLElement).textContent = b ? JSON.stringify(b, null, 2) : '(no bulletin fetched yet)';
        } catch {
          (bulletinPre as HTMLElement).textContent = '(failed to render bulletin)';
        }
      }

      bulletinCard.appendChild(bulletinH);
      bulletinCard.appendChild(bulletinPre);

      function setStatus(text: string, kind: 'idle' | 'ok' | 'err' | 'busy'): void {
        try {
          status.textContent = text;
          if (kind === 'ok') (status as HTMLElement).style.borderColor = 'rgba(34,197,94,.35)';
          else if (kind === 'err') (status as HTMLElement).style.borderColor = 'rgba(239,68,68,.35)';
          else if (kind === 'busy') (status as HTMLElement).style.borderColor = 'rgba(59,130,246,.35)';
          else (status as HTMLElement).style.borderColor = 'rgba(255,255,255,.10)';
        } catch {
          // ignore
        }
      }

      function persistFromInputs(): void {
        try {
          saveGetBackConfig({ uuid: uuid.value, readPassphrase: pass.value });
        } catch {
          // ignore
        }
      }

      btnSave.addEventListener('click', () => {
        persistFromInputs();
        setStatus('Saved.', 'ok');
      });

      btnFetch.addEventListener('click', async () => {
        persistFromInputs();
        const cfgNow = loadGetBackConfig();
        setStatus('Fetching…', 'busy');
        try {
          const payload = await fetchBulletin(cfgNow);
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
          applyTargetsFromBulletin(payload);
          setStatus('Fetched OK. Targets updated.', 'ok');
          try {
            const data: any = store.getState().data;
            store.setState({
              data: {
                ...(data || {}),
                lastRefreshAt: Date.now(),
                lastRefreshStatus: 'GetBack OK',
                getbackHasUnseenUpdate: true,
                _renderTick: (data?._renderTick || 0) + 1
              }
            });
          } catch {
            // ignore
          }
          // renderTargets();
          // renderBulletin();
        } catch (e: any) {
          setStatus(String(e?.message || e || 'Fetch failed'), 'err');
          try {
            const data: any = store.getState().data;
            store.setState({ data: { ...(data || {}), lastRefreshAt: Date.now(), lastRefreshStatus: 'GetBack error', error: String(e?.message || e || 'Fetch failed') } });
          } catch {
            // ignore
          }
        }
      });

      const unsubscribe = store.subscribe(() => {
        renderDetected();
        // renderTargets();
        // renderBulletin();
      });
      container.addEventListener(
        'ad:cleanup',
        () => {
          try {
            unsubscribe();
          } catch {
            // ignore
          }
        },
        { once: true }
      );

      // renderTargets();
      // renderBulletin();
      renderDetected();

      card.appendChild(h);
      card.appendChild(detected);
      card.appendChild(status);
      card.appendChild(form);
      wrap.appendChild(card);
        // wrap.appendChild(targetsCard);
        // wrap.appendChild(bulletinCard);
      container.appendChild(wrap);
    }
  });
}
