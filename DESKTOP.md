# ZUNO Desktop (Windows + macOS)

The desktop app is a **Tauri 2 shell around the deployed ZUNO website**. It loads
`https://zunoo.freebuff.page` in a native window, so it uses the same accounts,
database, servers, DMs, calls and owner console as the browser. There is no local
database, no second sign-up, and no sync layer — the website is the source of truth.

Files live in `src-tauri/`; the web project itself is unchanged.

```
src-tauri/
  Cargo.toml                     # app crate (tauri 2 + notification plugin)
  build.rs
  src/main.rs                    # desktop entry point
  src/lib.rs                     # window creation, production URL, notify command
  tauri.conf.json                # branding, window/bundle settings
  capabilities/desktop.json      # IPC permissions limited to the ZUNO origin
  icons/                         # generated .ico, .icns and PNGs
```

## What is ready, and what is not

| Item | Status |
| --- | --- |
| Tauri project, branding, icons, window sizing | Prepared and validated |
| Desktop notifications (native command + web fallback) | Implemented |
| Production URL / single database | Configured |
| Rust crate type-checks for Windows (`x86_64-pc-windows-msvc`) | Verified |
| Windows `.exe` installer | **Built** — v1.0.0, own GitHub release |
| macOS universal `.dmg` | **Built** — v1.0.0, own GitHub release |
| Website download buttons + release lookup | Live for Windows and macOS, one release per platform |
| Windows `.msi` installer | Optional; add `msi` to the bundle list |

Installers cannot be produced in this Linux workspace: Tauri builds per OS, and
the Windows installer needs the MSVC linker, `rc.exe` and NSIS, which only exist
on Windows. The Rust code itself is verified: `cargo check --target
x86_64-pc-windows-msvc` compiles `src-tauri` cleanly against Tauri 2. Nothing is
claimed as finished until the installer file exists.

## Get the Windows installer — two paths

### Path A — build it on your own Windows PC (no GitHub account needed)

1. Install **Node.js 20 LTS** from https://nodejs.org (keep “Add to PATH” ticked).
2. Install **Rust**: download https://win.rustup.rs/x86_64 → run it → press Enter
   to accept the default `stable` toolchain.
3. Install **Visual Studio Build Tools**: https://aka.ms/vs/17/release/vs_BuildTools.exe
   → tick **“Desktop development with C++”** → Install (this gives the linker).
4. Unzip the project source (`artifacts/ZUNO-desktop-source.zip` from this
   workspace) into a simple folder, e.g. `C:\ZUNO`. It has no `node_modules` —
   `npm ci` installs those.
5. Open **PowerShell** in that folder (Shift + right-click → “Open PowerShell window here”):
   ```powershell
   npm ci
   npm run desktop:build
   ```
   The first build downloads Rust crates; expect 5–15 minutes.
6. Your installer is here:
   ```
   src-tauri\target\release\bundle\nsis\ZUNO_1.0.0_x64-setup.exe
   ```
   Double-click it to install ZUNO. (SmartScreen may warn because the build is
   unsigned — choose “More info → Run anyway”.)

### Path B — let GitHub build it for you (no Windows PC needed)

`.github/workflows/desktop-build.yml` builds the installer on GitHub's Windows
runner and uploads it as a downloadable artifact. It builds the NSIS `.exe`.

1. Create an **empty** repository on github.com (no README, no .gitignore).
2. Upload/push the project to it (see “Putting the project on GitHub” below).
3. On GitHub open **Actions → Desktop installers → Run workflow → Run workflow**.
   Leave “Also build the macOS installers” unticked for a Windows-only run.
4. Wait ~10–20 minutes for the green tick.
5. Open the finished run and download the **ZUNO-windows-installers** artifact
   (a `.zip`). Unzip it — inside is `ZUNO_1.0.0_x64-setup.exe`.

No secrets are needed for an unsigned Windows build; `GITHUB_TOKEN` is provided
automatically. The macOS job only needs secrets if you want signing.

### Publishing the installer as a GitHub Release

The `publish` job creates **one release per platform**, so visitors see Windows
and macOS as separate downloads:

| Release | Tag | Asset |
| --- | --- | --- |
| ZUNO `<version>` for Windows | `desktop-v<version>-win` | `ZUNO_<version>_x64-setup.exe` |
| ZUNO `<version>` for macOS | `desktop-v<version>-mac` | `ZUNO_<version>_universal.dmg` |

The website looks through recent releases and picks the newest one that actually
carries an installer for the requested platform, so it never links to a file that
does not exist. If one platform's build fails, only that button says “coming soon”.
Both discovery paths are free: the GitHub API when it answers, otherwise the
public `releases.atom` feed plus HEAD checks on the expected asset URLs.

To switch the website button on:

1. Publish the project to GitHub (below) and run **Actions → Desktop installers**.
2. When the run is green, open **Releases** and copy the repository path
   (`https://github.com/<owner>/<repo>` → `<owner>/<repo>`).
3. In this project's hosting settings add the variable **`GITHUB_REPO`** with the
   value `<owner>/<repo>`.
4. Reload the site. Within 10 minutes (the Worker caches the lookup) the button on
   the sign-in page changes from “Windows app coming soon” to
   “Download for PC” with the version and file size.

Optional variables: `GITHUB_TOKEN` (only for a private repository or higher API
rate limits) and `WINDOWS_INSTALLER_URL` + `WINDOWS_INSTALLER_VERSION` if you ever
host the installer outside GitHub. Never commit any of them.

### Current release

| Platform | File | Size |
| --- | --- | --- |
| Windows 10/11 x64 | `ZUNO_1.0.0_x64-setup.exe` | ~2.1 MB |
| macOS 10.15+ (universal) | `ZUNO_1.0.0_universal.dmg` | ~5.6 MB |

Windows lives on `desktop-v1.0.0-win` and macOS on `desktop-v1.0.0-mac`; the site
links straight to the matching file. **Installing on a Mac:** open the `.dmg`,
drag **ZUNO** into the Applications folder, then open it from Applications or
Launchpad.

The installers are **unsigned**: Windows SmartScreen warns (More info → Run
anyway), and macOS Gatekeeper blocks the first launch — right-click the app →
**Open** → **Open**, or run
`xattr -dr com.apple.quarantine /Applications/ZUNO.app`. macOS remembers the
choice after the first launch. Signing needs a Windows code-signing certificate
and an Apple Developer ID, both documented below.

### Shipping an update later

1. Change the version in three places: `package.json`, `src-tauri/tauri.conf.json`
   and `src-tauri/Cargo.toml` (for example `1.0.0` → `1.1.0`).
2. Commit and push to `main`.
3. Run **Actions → Desktop installers → Run workflow**. It builds and publishes a
   new release tagged `desktop-v1.1.0`.
4. Nothing else: the website's button follows the newest non-draft release, so it
   starts offering 1.1.0 within 10 minutes. Installed copies keep working because
   the desktop app loads the live site.

### Putting the project on GitHub

There is no git remote configured in this workspace, so nothing can be pushed
from here. Use the **GitHub Desktop** app if you are new to git:

1. Install GitHub Desktop and sign in.
2. **File → New repository**, name it `zuno`, choose a local folder, Create.
3. Copy the project files (everything except `node_modules`, `dist` and
   `src-tauri/target`; the `ZUNO-desktop-source.zip` download already matches)
   into that folder.
4. GitHub Desktop shows the files → write “ZUNO” as the summary → **Commit to main**
   → **Publish repository**. Keep “Keep this code private” if you prefer.

Or with the git command line, from a machine that has the project files:

```bash
git init
git add .
git commit -m "ZUNO"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

`.dev.vars`, `node_modules`, `dist` and `src-tauri/target` are git-ignored, so
secrets and build output never reach the repository. Never commit `.dev.vars`.

## Where the installers will be generated

After running a build on the matching OS, files appear under `src-tauri/target/release/bundle/`:

**Windows**
```
src-tauri/target/release/bundle/nsis/ZUNO_1.0.0_x64-setup.exe   # default build
src-tauri/target/release/bundle/msi/ZUNO_1.0.0_x64_en-US.msi   # only with: npm run desktop:build -- --bundles nsis,msi
```

**macOS**
```
src-tauri/target/release/bundle/dmg/ZUNO_1.0.0_aarch64.dmg   (Apple Silicon build)
src-tauri/target/release/bundle/dmg/ZUNO_1.0.0_x64.dmg       (Intel build)
src-tauri/target/release/bundle/dmg/ZUNO_1.0.0_universal.dmg (CI universal build)
src-tauri/target/release/bundle/macos/ZUNO.app
```

## Windows — beginner steps

1. Install **Node.js 20+** (nodejs.org).
2. Install **Rust** from https://rustup.rs (accept the default `stable` toolchain).
3. Install **Visual Studio Build Tools** and tick “Desktop development with C++”
   (this provides the MSVC linker Tauri needs).
4. Open the project folder in PowerShell:
   ```powershell
   npm ci
   npm run desktop:build
   ```
   The first build downloads Rust crates and takes roughly 5–15 minutes.
5. Your installer is `src-tauri\target\release\bundle\nsis\ZUNO_1.0.0_x64-setup.exe`.
   Double-click it to install ZUNO. For an `.msi` as well, run
   `npm run desktop:build -- --bundles nsis,msi`.

Windows uses the system **WebView2** runtime. The configuration uses the
`downloadBootstrapper` mode, so the installer fetches WebView2 automatically on
machines that don't have it.

Code signing is optional. Without a certificate, Windows SmartScreen warns that
the publisher is unknown. With a code-signing certificate you can set
`bundle.windows.certificateThumbprint`, `digestAlgorithm` and `timestampUrl` in
`src-tauri/tauri.conf.json`.

## macOS — beginner steps

1. Install **Node.js 20+**.
2. Install **Xcode Command Line Tools**: `xcode-select --install`.
3. Install **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.
4. From the project folder:
   ```bash
   npm ci
   npm run desktop:build
   ```
5. The `.dmg` and `.app` are in the paths listed above.

**Unsigned builds:** macOS Gatekeeper blocks apps from unidentified developers.
Users must right-click the app → **Open**, or run
`xattr -dr com.apple.quarantine /Applications/ZUNO.app`.

**Signing + notarization (requires an Apple Developer account, $99/yr):**

1. In Apple Developer, create a **Developer ID Application** certificate and
   install it in your login keychain.
2. Create an app-specific password for notarization.
3. Export these variables before building so Tauri signs and notarizes:
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="TEAMID"
   npm run desktop:build
   ```
4. Verify the result:
   ```bash
   codesign --verify --deep --strict --verbose=2 "src-tauri/target/release/bundle/macos/ZUNO.app"
   spctl --assess --type execute --verbose "src-tauri/target/release/bundle/macos/ZUNO.app"
   xcrun stapler validate "src-tauri/target/release/bundle/dmg/ZUNO_1.0.0_aarch64.dmg"
   ```

Notarization, DMG creation and Apple signing all require macOS — they cannot be
done on Windows or Linux.

## Building both installers without a Mac or Windows PC

`.github/workflows/desktop-build.yml` builds the Windows and macOS installers on
GitHub's runners and uploads them as workflow artifacts.

1. Push this project to GitHub.
2. Open **Actions → Desktop installers → Run workflow**; tick “Also build the
   macOS installers” if you want the `.dmg` in the same run.
3. Download `ZUNO-windows-installers` and `ZUNO-macos-installers` from the run.

For signed macOS builds, add the repository secrets `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD` and `APPLE_TEAM_ID`; the workflow passes them through when set.

## Developing the desktop shell

```bash
npm run dev:web       # terminal 1: Vite on http://localhost:3000
npm run desktop:dev   # terminal 2: Tauri window pointed at localhost
```

`npm run desktop:dev` loads `http://localhost:3000`; release builds load
`https://zunoo.freebuff.page`. Change `PRODUCTION_URL` in `src-tauri/src/lib.rs`
if the production domain moves.

## Regenerating icons

```bash
npm run desktop:icons
```

The source art is `src-tauri/icons/zuno-app-icon.svg`; the command rewrites
`icon.ico` (Windows), `icon.icns` (macOS) and the PNG set.

## Notifications

- In the desktop window, incoming calls and new direct messages call the native
  `notify` command, so notifications appear in the Windows Action Center and the
  macOS Notification Center.
- macOS asks for notification permission the first time one is sent. If you
  denied it, re-enable ZUNO in System Settings → Notifications.
- In a normal browser the same code path falls back to the standard Web
  Notification API, only when the tab is in the background.

## Security notes

- The app loads ZUNO over HTTPS and keeps cookies/sessions in the OS webview.
- Native IPC is limited by `capabilities/desktop.json` to the ZUNO origin and to
  window basics plus notifications — the page cannot run arbitrary system
  commands.
- The site's CSP allows Tauri's local IPC endpoint (`ipc:`/`http://ipc.localhost`)
  so notifications work; that source is ignored by regular browsers.
