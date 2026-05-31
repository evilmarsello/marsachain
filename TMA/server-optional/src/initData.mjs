import crypto from "node:crypto";

/**
 * Проверка initData по https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * secret_key = HMAC_SHA256(key = "WebAppData", message = bot_token)
 * hash       = hex(HMAC_SHA256(key = secret_key, message = data_check_string))
 */
export function validateTelegramInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || typeof initData !== "string" || !botToken) {
    return { ok: false, error: "missing_init_data_or_token" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "missing_hash" };
  }

  const authDateRaw = params.get("auth_date");
  if (authDateRaw) {
    const authDate = Number.parseInt(authDateRaw, 10);
    if (!Number.isFinite(authDate)) {
      return { ok: false, error: "invalid_auth_date" };
    }
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSec) {
      return { ok: false, error: "auth_date_too_old" };
    }
  }

  const pairs = [];
  for (const key of [...new Set([...params.keys()])].sort()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_hash" };
  }

  let user = null;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      return { ok: false, error: "invalid_user_json" };
    }
  }

  const queryId = params.get("query_id") ?? null;
  return { ok: true, user, queryId, authDate: authDateRaw ? Number.parseInt(authDateRaw, 10) : null };
}
