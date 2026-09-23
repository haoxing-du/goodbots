#!/bin/sh
# Vercel build command (set in vercel.json). Keeps preview builds away from production:
#   - Production (main):  deploy Convex functions to production, then build the site.
#   - Preview (other branches), with a Convex *preview* deploy key: deploy this branch to
#     its own throwaway Convex preview deployment (core axes + catalog set up), then build.
#   - Preview with any other key, or none: build the frontend only. Never touches production.
# DRY_RUN=1 prints the command instead of running it.
set -e
run() { if [ -n "$DRY_RUN" ]; then echo "would run: $*"; else "$@"; fi; }

case "$VERCEL_ENV:$CONVEX_DEPLOY_KEY" in
  production:prod:*)
    echo "vercel-build: production → deploying Convex to production"
    run npx convex deploy --cmd 'npm run build'
    ;;
  preview:preview:*)
    echo "vercel-build: preview → Convex preview deployment for branch ${VERCEL_GIT_COMMIT_REF:-?}"
    run npx convex deploy --cmd 'npm run build' --preview-run setup:init
    ;;
  production:*)
    echo "vercel-build: production build without a production deploy key" >&2
    exit 1
    ;;
  *)
    echo "vercel-build: $VERCEL_ENV build without a Convex preview key → frontend only (no backend deploy)"
    run npm run build
    ;;
esac
