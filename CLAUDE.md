# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start esbuild in watch mode (development)
npm run build        # Type-check + production build
npm run eslint       # Lint and auto-fix TypeScript files
npm run prettier     # Format TypeScript files
npm run changelog    # Generate changelog from conventional commits
npm run release      # Full release: lint → version bump → push
```

There are no tests in this project.

## Architecture

This is a single-file Obsidian plugin. All logic lives in `main.ts`, which compiles to `main.js` via esbuild.

**Core flow:**
- `IdLinkPlugin` (extends `Plugin`) is the entry point — `onload()` registers commands, event handlers, and the `obsidian://id-link` URI protocol handler.
- The URI handler uses the **Dataview plugin API** (`obsidian-dataview`) to find notes by ID, then falls back to native vault file iteration for filename-based lookup.
- ID lookup supports two sources (configured via `IdSource` enum): frontmatter property (default: `id`) and filename regex (default: `^\d{14}[ .]`).
- `IdLinkSettingTab` (extends `PluginSettingTab`) renders settings and re-renders itself when toggles change.

**ID resolution priority** (when both sources enabled):
1. Frontmatter property → filename regex (for `findId`)
2. Dataview pages query → native vault file scan (for the URI handler)

**Key behaviors:**
- `autoGenerateId`: When copying a link, if no ID exists and property source is enabled, generates a new timestamp-based ID and writes it to frontmatter.
- `syncIdToProperty`: On file `modify` events, syncs filename ID → property if they differ.
- Generated links format: `obsidian://id-link?vault=<name>&id=<id>` (optionally with `&block-id=<blockId>` for block-level links).

**Versioning:** `version-bump.mjs` updates `manifest.json` and `versions.json` during `npm version`. Conventional commits drive automatic semver bump via `conventional-recommended-bump`.
