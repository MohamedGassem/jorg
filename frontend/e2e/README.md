# Smoke E2E alpha

Filet de securite local (P0-2). Couvre le golden path recruteur -> candidat ->
generation DOCX et l'editeur de dossier adapte L3. Lance a la main avant
d'elargir l'alpha. Pas de CI pour l'instant.

## Prerequis (3 terminaux)

1. Services :
   `docker compose -f docker-compose.dev.yml up -d`
2. Backend (avec le seam de test active) :
   `cd backend && E2E_TEST_MODE=true ALPHA_INVITE_REQUIRED=false EMAIL_BACKEND=console uv run uvicorn main:app --port 8000`
3. Frontend :
   `cd frontend && npm run dev`

## Lancer

`cd frontend && npm run test:e2e`

Variantes :

- Un seul fichier : `npm run test:e2e -- golden-path.spec.ts`
- En mode visible : `npm run test:e2e -- --headed`
- Rapport : `npx playwright show-report`

## Notes

- Les emails sont uniques par run (timestamp), aucune remise a zero de la base.
- La route backend `/test/last-invitation-token` n'existe utilement que sous
  `E2E_TEST_MODE=true` ; elle rend 404 sinon. Ne jamais activer ce flag en prod.
- Le PDF n'est pas couvert : seul le DOCX (fallback fiable) est asserte.
