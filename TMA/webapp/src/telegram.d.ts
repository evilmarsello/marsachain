export interface NodeInfo {
  connected: boolean;
  height?: number;
  target?: number;
  /** Compact bits с ноды (отображение сложности как в Android). */
  bits?: number;
  difficulty?: number;
  /** Индекс /address/transactions готов — быстрые запросы по limit, без скана блоков. */
  addrTxIndexReady?: boolean;
}

export interface TmaSharedBridge {
  fetchNodeInfoJson: (baseUrl: string) => Promise<string>;
  fetchWalletBalanceJson: (baseUrl: string, address: string) => Promise<string>;
  fetchAddressTxJson: (baseUrl: string, address: string, from: number, limit: number) => Promise<string>;
  fetchMempoolJson: (baseUrl: string) => Promise<string>;
  fetchMiningInfoJson: (baseUrl: string, address: string) => Promise<string>;
  fetchValidatorsJson: (baseUrl: string) => Promise<string>;
  fetchMiningStatsJson: (baseUrl: string) => Promise<string>;
}

/** Минимум полей Telegram WebApp SDK, которые использует клиент */
export interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  /** Сырая строка query для серверной проверки (пустая вне Telegram) */
  initData: string;
  initDataUnsafe?: { user?: { language_code?: string; id?: number; first_name?: string } };
  themeParams?: Record<string, string | undefined>;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isFullscreen?: boolean;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  showAlert?: (message: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  CloudStorage?: {
    setItem: (key: string, value: string, callback?: (error: Error | null, stored: boolean) => void) => void;
    getItem: (key: string, callback: (error: Error | null, value: string | null) => void) => void;
    getItems: (keys: string[], callback: (error: Error | null, values: Record<string, string>) => void) => void;
    removeItem: (key: string, callback?: (error: Error | null, removed: boolean) => void) => void;
  };
}

export interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: TelegramNamespace;
    __TMA_SHARED__?: TmaSharedBridge;
  }
}

export {};
