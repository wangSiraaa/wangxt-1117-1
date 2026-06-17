# Trae Preflight

This folder is prepared for `wangxt-1117-1`.

Use `.env` for stable local ports and compose project identity:

- APP_PORT: 18417
- API_PORT: 19417
- WEB_PORT: 20417
- DB_PORT: 21417
- REDIS_PORT: 22417

Smoke entry:

```bash
bash scripts/smoke.sh
```

The preflight files are environment scaffolding only. The generated business
project can replace or extend them when needed.
