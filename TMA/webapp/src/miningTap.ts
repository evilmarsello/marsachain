import { getPrivateKeyBase64ForRow, type TmaWalletRow } from "./walletStore";
import {
  abandonMiningChallenge,
  abandonSignMessage,
  clientHashForChallenge,
  commitmentForNonce,
  publicKeyB64FromPrivate,
  randomNonceString,
  requestMiningChallenge,
  signHashHex,
  submitMiningResult,
} from "./miningApi";
import { hapticMiningBlockSuccess } from "./haptic";
import { showMiningResultFloating } from "./miningFloating";
import { recordMiningSuccess } from "./miningLocalStats";
import { t } from "./i18n";
import {
  calculateBlockRewardNanos,
  formatMrsFromNanos,
  hashMeetsTarget,
} from "./miningPow";

const MIN_MINING_COOLDOWN_MS = 400;
const PROGRESS_MAX_MS = 4000;

export type MiningTapDeps = {
  nodeBase: string;
  tmaAlert: (msg: string) => void;
  getActiveWallet: () => TmaWalletRow | null;
  hasActiveStake: () => boolean;
  noStakeMessage?: () => string;
  getAvailableCredits: () => number;
  onRefreshMining: () => void;
  onRefreshBalance: () => void;
};

let miningInProgress = false;
let lastTapCompletedAt = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;

const RING_CIRCUMFERENCE = 295;

function hideProgressRing(): void {
  if (progressTimer != null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  const ring = document.getElementById("tmaMiningProgress");
  const fill = document.getElementById("tmaMiningProgressFill");
  if (ring) ring.style.display = "none";
  if (fill) fill.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
}

function finishProgressRing(): void {
  if (progressTimer != null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  const fill = document.getElementById("tmaMiningProgressFill") as SVGCircleElement | null;
  if (fill) fill.style.strokeDashoffset = "0";
  window.setTimeout(() => hideProgressRing(), 150);
}

function startProgressRing(): void {
  if (progressTimer != null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  const ring = document.getElementById("tmaMiningProgress");
  const fill = document.getElementById("tmaMiningProgressFill") as SVGCircleElement | null;
  if (!ring || !fill) return;
  ring.style.display = "block";
  fill.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  fill.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  const start = performance.now();
  progressTimer = window.setInterval(() => {
    if (!miningInProgress) return;
    const elapsed = performance.now() - start;
    const p = Math.min(elapsed / PROGRESS_MAX_MS, 0.92);
    fill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - p));
  }, 80);
}

async function fetchStatusHeight(nodeBase: string): Promise<{ height: number; bits?: number }> {
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchNodeInfoJson) return { height: 0 };
  try {
    const j = JSON.parse(await bridge.fetchNodeInfoJson(nodeBase)) as {
      height?: number;
      bits?: number;
    };
    return {
      height: typeof j.height === "number" ? j.height : 0,
      bits: typeof j.bits === "number" ? j.bits : undefined,
    };
  } catch {
    return { height: 0 };
  }
}

export function attachMiningTapHandler(deps: MiningTapDeps): void {
  const btn = document.getElementById("tmaMiningTap");
  if (!btn) return;

  const runTap = (clientX: number, clientY: number) => {
    void (async () => {
      const now = performance.now();
      if (miningInProgress) return;
      if (lastTapCompletedAt > 0 && now - lastTapCompletedAt < MIN_MINING_COOLDOWN_MS) return;
      if (btn.hasAttribute("disabled")) return;

      const wallet = deps.getActiveWallet();
      if (!wallet) {
        deps.tmaAlert(t().miningTapNoWallet);
        return;
      }
      if (!deps.hasActiveStake()) {
        deps.tmaAlert(deps.noStakeMessage?.() ?? t().miningTapNoStake);
        return;
      }
      const credits = deps.getAvailableCredits();
      if (credits <= 0) {
        deps.tmaAlert(t().miningTapNoCredits);
        return;
      }

      const pk = getPrivateKeyBase64ForRow(wallet);
      const pubKey = pk ? publicKeyB64FromPrivate(pk) : null;
      if (!pk || !pubKey) {
        deps.tmaAlert(t().alertNoSigningKey);
        return;
      }

      miningInProgress = true;
      btn.setAttribute("disabled", "true");
      startProgressRing();

      try {
        const nonce = randomNonceString();
        const commitment = commitmentForNonce(nonce);
        const challenge = await requestMiningChallenge(deps.nodeBase, wallet.address, pubKey, commitment);
        if (challenge === "rate_limited") {
          deps.tmaAlert(t().miningTapRateLimit);
          return;
        }
        if (!challenge) {
          deps.tmaAlert(t().miningTapChallengeFailed);
          return;
        }

        const status = await fetchStatusHeight(deps.nodeBase);
        const clientHash = clientHashForChallenge(challenge.challenge, nonce);
        const bitsForPow = challenge.bits ?? status.bits;
        if (bitsForPow != null) {
          const compact = bitsForPow >>> 0;
          if (!hashMeetsTarget(clientHash, compact)) {
            showMiningResultFloating(clientX, clientY, clientHash, false);
            const abandonMsg = abandonSignMessage(wallet.address, challenge.challengeId);
            const abandonSig = signHashHex(pk, abandonMsg);
            if (abandonSig) {
              await abandonMiningChallenge(
                deps.nodeBase,
                wallet.address,
                challenge.challengeId,
                pubKey,
                abandonSig,
              );
            }
            deps.onRefreshMining();
            return;
          }
        }

        const signature = signHashHex(pk, clientHash);
        if (!signature) {
          deps.tmaAlert(t().miningTapSignFailed);
          return;
        }

        const claimedHeight = status.height + 1;
        const result = await submitMiningResult(deps.nodeBase, {
          address: wallet.address,
          challengeId: challenge.challengeId,
          clientHash,
          signature,
          headerHash: clientHash,
          claimedHeight,
          pubKey,
          nonce,
        });

        if (result?.accepted) {
          const rewardNanos = calculateBlockRewardNanos(claimedHeight);
          recordMiningSuccess(rewardNanos);
          const rewardMrs = formatMrsFromNanos(rewardNanos);
          hapticMiningBlockSuccess();
          showMiningResultFloating(clientX, clientY, clientHash, true, rewardMrs);
          deps.onRefreshBalance();
        }
        deps.onRefreshMining();
      } catch (e) {
        const m = (e as Error)?.message ?? String(e);
        if (!m.toLowerCase().includes("database")) deps.tmaAlert(t().miningTapError(m));
      } finally {
        miningInProgress = false;
        finishProgressRing();
        lastTapCompletedAt = performance.now();
        const canMine = deps.hasActiveStake() && deps.getAvailableCredits() > 0;
        if (canMine) btn.removeAttribute("disabled");
        else btn.setAttribute("disabled", "true");
      }
    })();
  };

  btn.addEventListener(
    "pointerdown",
    (e) => {
      if (btn.hasAttribute("disabled")) return;
      btn.style.transform = "scale(0.95)";
    },
    { passive: true },
  );
  btn.addEventListener(
    "pointerup",
    (e) => {
      btn.style.transform = "";
      if (btn.hasAttribute("disabled")) return;
      runTap(e.clientX, e.clientY);
    },
    { passive: true },
  );
  btn.addEventListener(
    "pointercancel",
    () => {
      btn.style.transform = "";
    },
    { passive: true },
  );
}
