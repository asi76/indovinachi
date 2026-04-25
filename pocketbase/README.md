# PocketBase Indovina Chi

Runtime Docker del PocketBase dedicato per:

- app: `https://indovinachi.asigo.cc`
- pb: `https://pb.indovinachi.asigo.cc`

## Sync schema

```bash
POCKETBASE_URL=https://pb.indovinachi.asigo.cc \
POCKETBASE_ADMIN_EMAIL=... \
POCKETBASE_ADMIN_PASSWORD=... \
npm run sync:pb-schema
```

## Note deploy

Questa cartella e pronta per essere usata come base di un servizio Docker su Coolify.
