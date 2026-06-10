# Marsa Chain — clients

| Directory | Description |
|-----------|-------------|
| [`android-client/`](android-client/) | Android SPV client (`com.marsa.chain`) |
| [`TMA/`](TMA/) | Telegram Mini App + pool API |

The fullnode is maintained separately and is not part of this repository.

Build instructions: see the README in each directory.

## Deploy to GitHub

Remote (if needed):

```bash
cd marsachain-github
git remote set-url origin https://github.com/evilmarsello/marsachain
```

### Android client only

```bash
cd marsachain-github
git add android-client/
git status   # no local.properties, app/build, .gradle
git commit -m "$(cat <<'EOF'
Android: pools, i18n, wallet UX, mining UI parity with TMA.

Nine locales, pool/solo mining, header insets fix, wallet tx paging.
EOF
)"
git push origin main
```

### TMA only (example)

```bash
git add TMA/webapp/src/…
git commit -m "Your message"
git push origin main
```

### Both Android + TMA

```bash
git add android-client/ TMA/
git commit -m "$(cat <<'EOF'
Sync Android client and TMA updates.
EOF
)"
git push origin main
```
