# TPDD Launcher

`TPDD-Launcher.exe` starts the packaged LLM Gateway and TPDD distribution server,
waits for both loopback ports, and then opens the editor in the default browser.

Build from the repository root:

```powershell
npm run build:launcher
```

The standalone build is written to `release\TPDD-Launcher.exe`. Normal releases
should be generated with `npm run build:release`; the launcher is then placed at
the root of `release\TPDD_v<version>` and the corresponding ZIP archive.
