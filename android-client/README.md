# Marsa Chain — клиенты

Три части инфраструктуры; **на GitHub — две**, нода — отдельно.

## Что куда выкладывать

| # | Папка / репозиторий | GitHub | Содержимое |
|---|---------------------|--------|------------|
| 1 | **`app/` + корень Gradle** | да | Android SPV (`com.marsa.chain`), `build.gradle.kts`, `settings.gradle.kts`, `gradlew`, `gradle/` |
| 2 | **`TMA/`** | да | Mini App (`webapp/`, `shared/`), `marsa-pool-api/`, `deploy/`, `server-optional/` |
| 3 | **`fullnode/`** (из `Blockchain/fullnode`) | нет* | Нода + mining-api; кладёте **рядом** на сервере, свой билд/конфиг |

\* Fullnode можно держать в приватном репо или tarball — публично клиентам не обязателен.

### Как разрезать для двух репозиториев

**Repo A — android** (корень = сейчас `android-client-copy/` без `TMA/`):

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

**Repo B — tma** (корень = содержимое `TMA/`):

```
webapp/
shared/
marsa-pool-api/
deploy/
server-optional/
README.md
.gitignore
```

**На сервере (рядом):**

```
/opt/fullnode/          ← сборка из Blockchain/fullnode
/opt/marsa-pool-api/    ← из repo B, .env с POOL_TREASURY_KEYS
/var/www/tma/           ← webapp/dist из repo B
```

## Android

```bash
cp local.properties.example local.properties   # sdk.dir
./gradlew :app:assembleDebug
```

JDK 17. Список нод в приложении пуст по умолчанию — добавьте IP в Connections. IP без порта → `http://IP/` (80/nginx).

## TMA

См. [`TMA/README.md`](TMA/README.md). Pool treasury: [`TMA/marsa-pool-api/SECURITY.md`](TMA/marsa-pool-api/SECURITY.md) (TKG-v1).

## Секреты (не в git)

| Секрет | Где |
|--------|-----|
| `POOL_TREASURY_KEYS` | только `/opt/marsa-pool-api/.env` |
| `BOT_TOKEN` | только `server-optional/.env` |
| Ключи кошельков | устройство пользователя |

## Аудит перед push

```bash
# из корня android-client-copy
grep -rE '178\.212|168\.222|evil_mars|POOL_TREASURY_KEYS=[^$]' . --exclude-dir=node_modules || true
git status   # нет local.properties, .env, app/build, node_modules
```
