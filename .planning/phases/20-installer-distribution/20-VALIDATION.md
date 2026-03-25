---
phase: 20
slug: installer-distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | `packages/mission-control/package.json` |
| **Quick run command** | `cd packages/mission-control && bun test tests/release-workflow.test.ts` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/release-workflow.test.ts`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | DIST-01 | structural | `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/release.yml','utf8')); console.log('YAML valid')"` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | DIST-02 | structural | `node -e "const c=JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.assert(c.bundle.macOS); console.log('bundle signing config present')"` | ✅ | ⬜ pending |
| 20-01-03 | 01 | 1 | DIST-01 | unit | `cd packages/mission-control && bun test tests/release-workflow.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | DIST-03 | compile | `cd src-tauri && cargo check 2>&1 \| grep -E "^error" \| wc -l` | ✅ | ⬜ pending |
| 20-02-02 | 02 | 1 | DIST-03 | build | `cd packages/mission-control && bun run build 2>&1 \| grep -E "^(error\|Error)" \| head -5` | ✅ | ⬜ pending |
| 20-03-01 | 03 | 1 | DIST-04 | structural | `node -e "const h=require('fs').readFileSync('docs/index.html','utf8'); console.assert(h.includes('Build real software without the noise')); console.log('landing page assertions pass')"` | ❌ W0 | ⬜ pending |
| 20-03-02 | 03 | 1 | DIST-04 | structural | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pages.yml')); print('pages.yml YAML valid')"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.github/workflows/release.yml` — created by Plan 01 Task 1
- [ ] `packages/mission-control/tests/release-workflow.test.ts` — created by Plan 01 Task 3
- [ ] `docs/index.html` — created by Plan 03 Task 1
- [ ] `.github/workflows/pages.yml` — created by Plan 03 Task 2

*All Wave 0 artifacts are created by the plans themselves — no pre-execution stubs needed. Existing test infrastructure (bun:test, cargo check) covers all tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signed `.dmg` / `.msi` installs without security warnings | DIST-02 | Requires pushing to a `release/*` branch and testing the actual downloaded installer on macOS + Windows hardware | 1. Push to `release/v2.0-test`. 2. Wait for GitHub Actions to complete. 3. Download `.dmg` and `.msi` from draft release. 4. Install on macOS — confirm no Gatekeeper warning. 5. Install on Windows — confirm no SmartScreen warning |
| Update notification appears in sidebar footer | DIST-03 | Requires a deployed release to compare against — can only be observed with a real newer version available on GitHub Releases | 1. Build and install v1.0. 2. Push v2.0 to GitHub Releases. 3. Launch v1.0 — confirm "Update ready" banner appears in sidebar within seconds |
| Landing page readable on mobile | DIST-04 | Visual layout verification — flexbox/grid wrapping behavior needs human confirmation on small viewport | Open `docs/index.html` in Chrome DevTools at 375px width. Confirm all 3 download buttons are visible, text is legible, no horizontal overflow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
