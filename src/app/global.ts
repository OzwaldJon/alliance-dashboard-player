import type { AppContext } from './uiShell';

type AppWindow = Window & {
  __AllianceDashboardPlayerApp?: AppContext;
};

export function installAppContext(ctx: AppContext): void {
  try {
    (window as AppWindow).__AllianceDashboardPlayerApp = ctx;
  } catch {
    // ignore
  }
}

export function getAppContext(): AppContext {
  const w = window as AppWindow;
  if (!w.__AllianceDashboardPlayerApp) {
    throw new Error('AllianceDashboard app context not found on window.__AllianceDashboardPlayerApp');
  }
  return w.__AllianceDashboardPlayerApp;
}
