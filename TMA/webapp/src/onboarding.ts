import { generateMnemonic, loadEnglishWordList, mnemonicToSeedBytes, validateMnemonicPhrase } from "./crypto/bip39";
import { getLocale, getTermsOfUseText, isLocale, localeSelectOptionsHtml, setLocale, t } from "./i18n";
import { showTmaAlert } from "./tmaAlertUi";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

type Step = "warnings" | "words" | "verify" | "restore";

/** Mirrors Android `OnboardingActivity` + `activity_onboarding.xml` (English UI). */
export function mountOnboarding(root: HTMLElement, onComplete: (seed: Uint8Array) => void): void {
  let wordList: string[] = [];
  let mnemonicWords: string[] = [];
  let step: Step = "warnings";

  const shell = document.createElement("div");
  shell.className = "onb-root";

  function render(): void {
    const tr = t();
    const loc = getLocale();
    const title =
      step === "restore"
        ? tr.onbTitleRestore
        : step === "words"
          ? tr.onbTitleWords
          : step === "verify"
            ? tr.onbTitleVerify
            : tr.onbTitleDefault;

    const stepWarnings = step === "warnings" ? "" : 'style="display:none"';
    const stepWords = step === "words" ? "" : 'style="display:none"';
    const stepVerify = step === "verify" ? "" : 'style="display:none"';
    const stepRestore = step === "restore" ? "" : 'style="display:none"';

    const grid =
      step === "words" && mnemonicWords.length === 24
        ? mnemonicWords
            .map((w, i) => {
              return `<div class="onb-word-tile"><span class="onb-word-idx">${i + 1}.</span><span class="onb-word-txt">${esc(w)}</span></div>`;
            })
            .join("")
        : "";

    shell.innerHTML = `
      <div class="onb-toolbar">
        <div class="onb-toolbar-pad"></div>
        <div class="onb-toolbar-title">${esc(title)}</div>
      </div>
      <div class="onb-brand">
        <img class="onb-logo" src="/logo.png" width="78" alt="" decoding="async" />
        <img class="onb-wordmark" src="/logoname.png" alt="Marsa Chain" decoding="async" />
        <p class="onb-welcome">${esc(tr.onbWelcome)}</p>
      </div>
      <div class="onb-scroll">
        <div class="onb-inner">
          <div class="onb-step" id="onbStepWarnings" ${stepWarnings}>
            <div class="onb-card">
              <div class="onb-card-title">${esc(tr.onbBeforeTitle)}</div>
              <p class="onb-muted">${esc(tr.onbBeforeP1)}</p>
              <p class="onb-muted onb-muted-sm">${esc(tr.onbBeforeP2)}</p>
            </div>
            <div class="onb-check-row">
              <input type="checkbox" class="onb-cb" id="onbCbUnderstand" />
              <label class="onb-check-label" for="onbCbUnderstand"><span id="onbUnderstandLink" class="onb-link-inline"></span></label>
            </div>
            <div class="onb-check-row">
              <input type="checkbox" class="onb-cb" id="onbCbBackup" />
              <label class="onb-check-label" for="onbCbBackup">${esc(tr.onbBackup)}</label>
            </div>
            <button type="button" class="onb-btn-primary" id="onbBtnContinue">${esc(tr.onbShowSeed)}</button>
            <button type="button" class="onb-btn-outline" id="onbBtnRestore">${esc(tr.onbHaveSeed)}</button>
          </div>

          <div class="onb-step" id="onbStepWords" ${stepWords}>
            <p class="onb-muted">${esc(tr.onbWordsHint)}</p>
            <div class="onb-card onb-card-pad-sm">
              <div class="onb-mnemonic-grid">${grid}</div>
            </div>
            <button type="button" class="onb-btn-primary" id="onbBtnWordsOk">${esc(tr.onbWordsOk)}</button>
          </div>

          <div class="onb-step" id="onbStepVerify" ${stepVerify}>
            <div class="onb-card onb-card-pad-lg">
              <p class="onb-muted">${esc(tr.onbVerifyHint)}</p>
              <label class="onb-field-lab" id="onbLab1">Word</label>
              <input type="text" class="onb-inp" id="onbInp1" list="onbWordlist" autocomplete="off" spellcheck="false" placeholder="${esc(tr.onbWordPlaceholder)}" />
              <label class="onb-field-lab" id="onbLab2">Word</label>
              <input type="text" class="onb-inp" id="onbInp2" list="onbWordlist" autocomplete="off" spellcheck="false" placeholder="${esc(tr.onbWordPlaceholder)}" />
              <label class="onb-field-lab" id="onbLab3">Word</label>
              <input type="text" class="onb-inp" id="onbInp3" list="onbWordlist" autocomplete="off" spellcheck="false" placeholder="${esc(tr.onbWordPlaceholder)}" />
              <datalist id="onbWordlist">${wordList.map((w) => `<option value="${esc(w)}">`).join("")}</datalist>
              <button type="button" class="onb-btn-primary onb-mt" id="onbBtnVerify">${esc(tr.onbConfirm)}</button>
            </div>
          </div>

          <div class="onb-step" id="onbStepRestore" ${stepRestore}>
            <div class="onb-card onb-card-pad-lg">
              <p class="onb-muted">${esc(tr.onbRestoreHint)}</p>
              <p class="onb-muted onb-muted-sm">${esc(tr.onbRestoreHint2)}</p>
              <textarea class="onb-ta" id="onbRestoreTa" rows="5" placeholder="${esc(tr.onbRestorePlaceholder)}" spellcheck="false" autocomplete="off"></textarea>
              <button type="button" class="onb-btn-primary onb-mt" id="onbBtnRestoreSubmit">${esc(tr.onbRestoreSubmit)}</button>
              <button type="button" class="onb-btn-ghost" id="onbBtnRestoreBack">${esc(tr.onbBack)}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="onb-lang-bar">
        <span class="onb-lang-label">${esc(tr.languageTitle)}</span>
        <select id="onbLocaleSelect" class="onb-lang-select" aria-label="${esc(tr.languageTitle)}">
          ${localeSelectOptionsHtml(loc, esc)}
        </select>
      </div>
    `;

    const linkHost = shell.querySelector("#onbUnderstandLink");
    if (linkHost && step === "warnings") {
      linkHost.innerHTML = `${esc(tr.onbUnderstandPrefix)}<span class="onb-link" tabindex="0" role="link" id="onbTermsLink">${esc(tr.onbTermsLink)}</span>${esc(tr.onbUnderstandSuffix)}`;
    }

    shell.querySelector("#onbTermsLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void showTerms();
    });
    shell.querySelector("#onbTermsLink")?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
        e.preventDefault();
        void showTerms();
      }
    });

    shell.querySelector("#onbLocaleSelect")?.addEventListener("change", (e) => {
      const next = (e.target as HTMLSelectElement).value;
      if (!isLocale(next)) return;
      setLocale(next);
      render();
    });

    shell.querySelector("#onbCbUnderstand")?.addEventListener("change", (e) => {
      const cb = e.target as HTMLInputElement;
      if (!cb.checked) return;
      cb.checked = false;
      void showTerms();
    });

    shell.querySelector("#onbBtnContinue")?.addEventListener("click", async () => {
      const u = (shell.querySelector("#onbCbUnderstand") as HTMLInputElement)?.checked;
      const b = (shell.querySelector("#onbCbBackup") as HTMLInputElement)?.checked;
      if (!u || !b) {
        toast(tr.onbConfirmBoth);
        return;
      }
      if (wordList.length !== 2048) {
        try {
          wordList = await loadEnglishWordList();
        } catch {
          toast(tr.onbBip39Fail);
          return;
        }
      }
      const line = await generateMnemonic(wordList);
      mnemonicWords = line.split(" ");
      step = "words";
      render();
    });

    shell.querySelector("#onbBtnRestore")?.addEventListener("click", () => {
      step = "restore";
      render();
    });

    shell.querySelector("#onbBtnWordsOk")?.addEventListener("click", () => {
      const order = shuffle24();
      step = "verify";
      render();
      const [a, b, c] = order;
      const l1 = shell.querySelector("#onbLab1");
      const l2 = shell.querySelector("#onbLab2");
      const l3 = shell.querySelector("#onbLab3");
      if (l1) l1.textContent = `Word ${a}`;
      if (l2) l2.textContent = `Word ${b}`;
      if (l3) l3.textContent = `Word ${c}`;
      (shell.querySelector("#onbInp1") as HTMLInputElement)?.setAttribute("data-pos", String(a));
      (shell.querySelector("#onbInp2") as HTMLInputElement)?.setAttribute("data-pos", String(b));
      (shell.querySelector("#onbInp3") as HTMLInputElement)?.setAttribute("data-pos", String(c));
    });

    shell.querySelector("#onbBtnVerify")?.addEventListener("click", async () => {
      const p1 = Number((shell.querySelector("#onbInp1") as HTMLInputElement)?.dataset.pos);
      const p2 = Number((shell.querySelector("#onbInp2") as HTMLInputElement)?.dataset.pos);
      const p3 = Number((shell.querySelector("#onbInp3") as HTMLInputElement)?.dataset.pos);
      const w1 = (shell.querySelector("#onbInp1") as HTMLInputElement)?.value.trim().toLowerCase() ?? "";
      const w2 = (shell.querySelector("#onbInp2") as HTMLInputElement)?.value.trim().toLowerCase() ?? "";
      const w3 = (shell.querySelector("#onbInp3") as HTMLInputElement)?.value.trim().toLowerCase() ?? "";
      const ok = wordMatches(p1, w1) && wordMatches(p2, w2) && wordMatches(p3, w3);
      if (!ok) {
        toast(tr.onbWordsWrong);
        step = "words";
        render();
        return;
      }
      await completeFromSeed();
    });

    shell.querySelector("#onbBtnRestoreBack")?.addEventListener("click", () => {
      step = "warnings";
      render();
    });

    shell.querySelector("#onbBtnRestoreSubmit")?.addEventListener("click", async () => {
      const raw = (shell.querySelector("#onbRestoreTa") as HTMLTextAreaElement)?.value ?? "";
      if (wordList.length !== 2048) {
        try {
          wordList = await loadEnglishWordList();
        } catch {
          toast(tr.onbBip39Fail);
          return;
        }
      }
      const ok = await validateMnemonicPhrase(raw, wordList);
      if (!ok) {
        toast(tr.onbInvalidSeed);
        return;
      }
      await completeFromMnemonic(raw);
    });
  }

  function shuffle24(): [number, number, number] {
    const arr = Array.from({ length: 24 }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return [arr[0]!, arr[1]!, arr[2]!];
  }

  function wordMatches(pos: number, got: string): boolean {
    if (pos < 1 || pos > 24) return false;
    const expected = mnemonicWords[pos - 1] ?? "";
    return got === expected;
  }

  async function completeFromSeed(): Promise<void> {
    const line = mnemonicWords.join(" ");
    const seed = await mnemonicToSeedBytes(line);
    mnemonicWords = [];
    shell.remove();
    onComplete(seed);
  }

  async function completeFromMnemonic(raw: string): Promise<void> {
    const seed = await mnemonicToSeedBytes(raw);
    shell.remove();
    onComplete(seed);
  }

  let termsOpen = false;

  function showTerms(): void {
    const tr = t();
    if (termsOpen) return;
    termsOpen = true;
    const body = getTermsOfUseText();
    const wrap = document.createElement("div");
    wrap.className = "tma-modal-overlay onb-terms-overlay";
    wrap.innerHTML = `
      <div class="onb-terms-dialog">
        <h2 class="onb-terms-title">${esc(tr.onbTermsTitle)}</h2>
        <div class="onb-terms-scroll"><pre class="onb-terms-pre">${esc(body)}</pre></div>
        <p class="onb-terms-footer">${esc(tr.onbTermsFooter)}</p>
        <button type="button" class="onb-btn-primary" id="onbTermsAccept">${esc(tr.onbTermsAccept)}</button>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.querySelector("#onbTermsAccept")?.addEventListener("click", () => {
      const cb = shell.querySelector("#onbCbUnderstand") as HTMLInputElement | null;
      if (cb) cb.checked = true;
      termsOpen = false;
      wrap.remove();
    });
  }

  function toast(msg: string): void {
    showTmaAlert(msg);
  }

  root.innerHTML = "";
  root.appendChild(shell);

  void loadEnglishWordList()
    .then((wl) => {
      wordList = wl;
    })
    .catch(() => {
      /* loaded on demand */
    });

  render();
}
