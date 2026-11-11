![BetterCode](https://raw.githubusercontent.com/{{repository}}/HEAD/bettercode/screenshots/team.png)

## Install

**macOS and Linux**

```bash
curl -fsSL https://github.com/{{repository}}/releases/latest/download/install | bash
```

**Windows (PowerShell)**

```powershell
irm https://github.com/{{repository}}/releases/latest/download/install.ps1 | iex
```

This installs the `bettercode` command and the desktop app. Run it again to update.

## Files

| File | For |
| --- | --- |
| `bettercode-<os>-<arch>.tar.gz` / `.zip` | The `bettercode` command (`-baseline` for CPUs without AVX2, `-musl` for Alpine) |
| `bettercode-desktop-darwin-arm64.app.tar.gz` | Desktop app, Apple Silicon |
| `bettercode-desktop-darwin-x64.app.tar.gz` | Desktop app, Intel Mac |
| `bettercode-desktop-windows-x64-setup.exe` | Desktop app, Windows |
| `bettercode-desktop-linux-x64.AppImage` / `.deb` / `.rpm` | Desktop app, Linux |
| `SHA256SUMS` | Checksums for every file |

The builds are not code-signed. The installers prepare them so they open normally; a manually downloaded desktop app may show a warning from macOS Gatekeeper or Windows SmartScreen.

![Model picker](https://raw.githubusercontent.com/{{repository}}/HEAD/bettercode/screenshots/models.png)
