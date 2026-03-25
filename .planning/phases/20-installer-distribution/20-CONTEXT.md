# Phase 20: Installer + Distribution - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** GSD-Mission-Control-M2-Execution-Prompt.md

<domain>
## Phase Boundary

Produce signed, distributable installers for macOS and Windows. Land a working download link. Minimum viable demo asset for Lex Christopherson outreach. Ships as the final phase of Milestone 2 (Native Desktop).

</domain>

<decisions>
## Implementation Decisions

### GitHub Actions Pipeline
- Trigger: push to `release/*` branch OR manual dispatch
- Matrix: `[macos-latest, windows-latest, ubuntu-latest]`
- Steps: checkout → install Rust → install Node → bun install → tauri build → upload artifacts
- Artifacts: `.dmg` (macOS), `.msi` + `.exe` (Windows), `.AppImage` + `.deb` (Linux)
- Draft GitHub Release created automatically with all artifacts attached
- File: `.github/workflows/release.yml`

### Code Signing
- macOS: Apple Developer ID certificate via GitHub secret `APPLE_CERTIFICATE`
- Windows: self-signed for M2 (acceptable for demo). Production signing in M3.
- Linux: GPG signed AppImage

### Auto-Update
- Tauri updater plugin configured
- Update check on every launch
- Background download, install on next restart
- Non-intrusive "Update ready — restart to apply" notification in sidebar footer
- Update server: GitHub Releases JSON endpoint (zero infrastructure cost)

### Landing Page
- Single HTML file deployed to GitHub Pages or Vercel
- Design: dark navy `#0F1419`, binary matrix SVG texture, pixel-art GSD logo
- Headline: "Build real software without the noise."
- Subheadline: "GSD Mission Control brings the discipline of the GSD workflow to a native desktop app. Plan, build, and ship — without touching the terminal."
- Demo GIF or screenshot (record after build)
- Download buttons: macOS, Windows, Linux — link to latest GitHub Release
- "Powered by GSD 2" with link to gsd-build/gsd-2
- Footer: "Built by Bantuson · Mzansi Agentive"

### Landing Page Design Contract
- Share Tech Mono for headlines
- JetBrains Mono for body and code
- Binary matrix pattern at 3% opacity on `#0F1419` background
- GSD cyan `#5BC8F0` for CTAs and accent only
- One page, no navigation, no fluff
- Mobile responsive

### Testing Requirement
- Phase 20 requires a clean install test on a machine with no prior dependencies installed (human verification gate)

### Claude's Discretion
- Wave structure / plan breakdown (how to split CI, signing, auto-update, landing page across plans)
- Exact Tauri updater plugin version and config schema
- GitHub Pages vs Vercel deployment choice (either works)
- Landing page screenshot vs GIF (record after first successful build)
- Nyquist test stub strategy for CI pipeline (can't run actual GitHub Actions locally — stubs verify config file structure)

</decisions>

<specifics>
## Specific Ideas

**Design palette (established, do not introduce new tokens):**
- Background: `#0F1419`
- Surface: `#131C2B`
- Elevated: `#1A2332`
- Border: `#1E2D3D`
- Accent cyan: `#5BC8F0`
- Green: `#22C55E`
- Amber: `#F59E0B`
- Red: `#EF4444`

**Auto-update notification placement:** sidebar footer (where cost/status info already lives)

**Tauri already set up** from Phase 15 — `src-tauri/` exists, `tauri.conf.json` configured, build pipeline partially in place.

</specifics>

<deferred>
## Deferred Ideas

- Bundling Bun and gsd-pi inside the installer (M3)
- Custom native title bar (M3)
- Production Windows code signing (M3 — self-signed acceptable for M2 demo)
- Multi-window support (M3)

</deferred>

---

*Phase: 20-installer-distribution*
*Context gathered: 2026-03-14 from M2 Execution Prompt*
