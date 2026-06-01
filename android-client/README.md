# Marsa Chain — clients

Three infrastructure pieces; **two are published on GitHub**, the node is separate.

## What goes where

| # | Folder / repository | GitHub | Contents |
|---|---------------------|--------|----------|
| 1 | **`app/` + Gradle root** | yes | Android SPV (`com.marsa.chain`), `build.gradle.kts`, `settings.gradle.kts`, `gradlew`, `gradle/` |
| 2 | **`TMA/`** | yes | Mini App (`webapp/`, `shared/`), `marsa-pool-api/`, `deploy/`, `server-optional/` |
| 3 | **`fullnode/`** (from `Blockchain/fullnode`) | no* | Node + mining-api; deploy **next to** the clients on your server, own build/config |

\* Fullnode can live in a private repo or tarball — it does not have to be public for end users.

### Splitting into two repositories

**Repo A — android** (root = `android-client/` without `TMA/`):

```
app/
build.gradle.kts
settings.gradle.kts
gradlew
gradle/
README.md
.gitignore
local.properties.example
```

**Repo B — tma** (root = contents of `TMA/`):

```
webapp/
shared/
marsa-pool-api/
deploy/
server-optional/
README.md
.gitignore
```

**On the server (side by side):**

```
/opt/fullnode/          ← build from Blockchain/fullnode
/opt/marsa-pool-api/    ← from repo B, .env with POOL_TREASURY_KEYS
/var/www/tma/           ← webapp/dist from repo B
```

## Android

```bash
cp local.properties.example local.properties   # sdk.dir
./gradlew :app:assembleDebug
```

JDK 17. The in-app node list is empty by default — add IPs under Connections. Host without a port → `http://IP/` (port 80 / nginx).

## TMA

See [`TMA/README.md`](TMA/README.md). Pool treasury security: [`TMA/marsa-pool-api/SECURITY.md`](TMA/marsa-pool-api/SECURITY.md) (TKG-v1).

## Secrets (never commit)

| Secret | Where |
|--------|-------|
| `POOL_TREASURY_KEYS` | `/opt/marsa-pool-api/.env` only |
| `BOT_TOKEN` | `server-optional/.env` only |
| Wallet keys | on the user device |

## Pre-push audit

```bash
# from android-client root
grep -rE '178\.212|168\.222|evil_mars|POOL_TREASURY_KEYS=[^$]' . --exclude-dir=node_modules || true
git status   # no local.properties, .env, app/build, node_modules
```
