# Indovina Chi

Icebreaker da festa con tre superfici sincronizzate:

- presenter principale su schermo grande
- telecomando del presentatore su telefono
- client dei partecipanti via QR code

## Flusso

1. l'host crea una sessione e inserisce le domande
2. i partecipanti entrano con avatar e nickname in stile Quizzone
3. tutti rispondono alle stesse domande dal proprio dispositivo
4. le risposte vengono salvate in PocketBase
5. quando tutti hanno risposto parte il reveal con disco ball anni 70
6. il telecomando estrae la prossima domanda e poi una risposta casuale alla volta

## Endpoint previsti

- app: `https://indovinachi.asigo.cc`
- PocketBase: `https://pb.indovinachi.asigo.cc`

## Comandi

```bash
npm install
npm run build
npm run server
```

## PocketBase

Lo schema e nella cartella [pocketbase/schema.json](/home/asi/indovinachi/pocketbase/schema.json).

Per sincronizzarlo:

```bash
POCKETBASE_URL=https://pb.indovinachi.asigo.cc \
POCKETBASE_ADMIN_EMAIL=... \
POCKETBASE_ADMIN_PASSWORD=... \
npm run sync:pb-schema
```
