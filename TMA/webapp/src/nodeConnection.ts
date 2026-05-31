const LS_MODE = "tma_conn_mode";
const LS_MANUAL = "tma_conn_manual";
const LS_AUTO_SELECT = "tma_conn_auto_select";

export type ConnectionMode = "auto" | "manual";

export function getConnectionMode(): ConnectionMode {
  try {
    return localStorage.getItem(LS_MODE) === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

export function setConnectionMode(mode: ConnectionMode): void {
  try {
    localStorage.setItem(LS_MODE, mode);
  } catch {
    /* ignore */
  }
}

export function isAutoSelectEnabled(): boolean {
  try {
    const v = localStorage.getItem(LS_AUTO_SELECT);
    return v !== "0";
  } catch {
    return true;
  }
}

export function setAutoSelectEnabled(on: boolean): void {
  try {
    localStorage.setItem(LS_AUTO_SELECT, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getManualHost(): string {
  try {
    return localStorage.getItem(LS_MANUAL) ?? "";
  } catch {
    return "";
  }
}

export function setManualHost(host: string): void {
  try {
    localStorage.setItem(LS_MANUAL, host.trim());
  } catch {
    /* ignore */
  }
}

export function hostToBaseUrl(host: string): string {
  let h = host.trim();
  if (!h) return "";
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
  return h.endsWith("/") ? h : `${h}/`;
}
