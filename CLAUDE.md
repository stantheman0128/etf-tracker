# ETF Tracker - Development Guidelines

## Pre-push Checklist
- Verify `.gitignore` covers all env files (`.env`, `.env.local`, `.env*.local`). Never commit secrets.
- Update version in `package.json` for each release.

## Architecture
- `lib/config.ts` exports `devLog()` for debug logging — use instead of `console.log` in app/lib code.
- Keep `console.error` and `console.warn` as-is for real error/warning reporting.
- API responses use TypeScript interfaces defined near their route handlers.
