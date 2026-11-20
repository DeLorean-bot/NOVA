# Architecture

```mermaid
flowchart LR
  UI["React interface"]
  Bridge["Sandboxed preload and IPC"]
  Main["Electron main process"]
  Data["Local library and preferences"]
  Catalog["Catalog and release sources"]
  Player["Isolated player view"]
  Updates["GitHub release metadata"]

  UI --> Bridge --> Main
  Main --> Data
  Main --> Catalog
  Main --> Player
  Main --> Updates
```

The renderer controls the catalog, details, search and settings. The preload exposes only the commands used by the interface. The main process manages the Windows window, storage, and embedded playback. Premiere availability, catalog lookup, and update checks are asynchronous.

## Startup preview

![Measured startup phases](startup.png)

These timings were captured in one isolated Windows x64 run of the desktop app. The clock starts at renderer navigation. It measures the splash sequence, not download time or when a remote movie begins playing. Catalog and release checks continue in the background.

To reproduce, build with `npm run build`, then run `node scripts/verify-nova-release.cjs` on Windows with a connection to the catalog. The script stores its images and JSON report under `test-results/`, using an isolated profile. Pass the path to the packaged executable in `KADR_TEST_EXE` to verify a packaged build.
