import { defineConfig, loadEnv } from "vite";

const PLACEHOLDER = /YOUR_VPS|YOUR_IP|CHANGE_ME|REPLACE_ME|EXAMPLE\.COM|\btest\.local\b/i;

function cacheBootScript(buildId: string): string {
  return `<script>(function(){var B="${buildId}",K="tma_build_id",R="tma_build_redirect";try{var p=new URLSearchParams(location.search),v=p.get("v"),s=localStorage.getItem(K);if(s&&s!==B){localStorage.setItem(K,B);sessionStorage.removeItem(R);location.replace(location.pathname+"?v="+B+location.hash);return}if(v!==B){if(sessionStorage.getItem(R)===B)return;sessionStorage.setItem(R,B);localStorage.setItem(K,B);location.replace(location.pathname+"?v="+B+location.hash);return}sessionStorage.removeItem(R);localStorage.setItem(K,B)}catch(e){}})();</script>`;
}

export default defineConfig(({ mode }) => {
  const buildId = String(Date.now());
  const env = loadEnv(mode, process.cwd(), "");
  const readTarget = (env.VITE_FULLNODE_PROXY_TARGET || "http://127.0.0.1:8080").trim();
  const miningTarget = (env.VITE_MINING_PROXY_TARGET || "http://127.0.0.1:8080").trim();
  const telegramApi = (env.VITE_TELEGRAM_VALIDATE_TARGET || "http://127.0.0.1:8787").trim();
  const poolApi = (env.VITE_POOL_PROXY_TARGET || "http://127.0.0.1:8788").trim();

  if (PLACEHOLDER.test(readTarget)) {
    // eslint-disable-next-line no-console
    console.error(
      "\n\x1b[31m[marsa-tma] VITE_FULLNODE_PROXY_TARGET looks like a placeholder, not a real IP/domain.\x1b[0m",
      `\n\x1b[31mCurrent value: ${readTarget}\x1b[0m`,
      "\nEdit webapp/.env and set your node address (same as in Android Connections).",
      "\nYOUR_VPS_IP does not resolve in DNS → getaddrinfo ENOTFOUND.\n",
    );
  }

  function patchIndexHtml(html: string): string {
    const boot = cacheBootScript(buildId);
    return html
      .replace("<head>", `<head>\n    ${boot}`)
      .replace('src="/kotlin/shared.js"', `src="/kotlin/shared.js?v=${buildId}"`)
      .replace(
        'src="https://telegram.org/js/telegram-web-app.js"',
        `src="https://telegram.org/js/telegram-web-app.js?v=${buildId}"`,
      )
      .replace("</head>", `    <!-- build: ${buildId} -->\n  </head>`);
  }

  return {
    root: ".",
    publicDir: "public",
    define: {
      __TMA_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      {
        name: "marsa-cache-boot",
        configureServer() {
          // eslint-disable-next-line no-console
          console.log(`[marsa-tma] Proxy /fullnode → ${readTarget}`);
          // eslint-disable-next-line no-console
          console.log(`[marsa-tma] Proxy /mining → ${miningTarget}`);
          // eslint-disable-next-line no-console
          console.log(`[marsa-tma] Proxy /telegram → ${telegramApi}`);
          // eslint-disable-next-line no-console
          console.log(`[marsa-tma] Proxy /api/pool → ${poolApi}`);
          // eslint-disable-next-line no-console
          console.log(`[marsa-tma] build id ${buildId}`);
        },
        transformIndexHtml(html) {
          return patchIndexHtml(html);
        },
      },
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/telegram": {
          target: telegramApi,
          changeOrigin: true,
        },
        "/fullnode": {
          target: readTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/fullnode\/?/, "/"),
        },
        "/mining": {
          target: miningTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/mining\/?/, "/"),
        },
        "/api/pool": {
          target: poolApi,
          changeOrigin: true,
        },
      },
    },
  };
});
