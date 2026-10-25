# A signed Mac release of Jauvex Personal (a disk image)

For an agent on a Mac that holds a Developer ID. It turns one commit of this repository into `jauvex-personal-<version>-mac-<arch>.dmg`:
Jauvex.app signed with that Developer ID, notarized by Apple and stapled, in a disk image that is signed, notarized and stapled too. Someone
who gets the image opens it, drags Jauvex to Applications, and opens it with no warning.

The install command (`curl -fsSL https://jauvex.ai/install | sh`) still builds Jauvex on each Mac and needs none of this. The image is for
handing the app to someone directly. The script is `packaging/mac/release.ts`.

## Rules

- **The keys stay where they are.** The Developer ID's private key lives in this Mac's login keychain, and the notary API key in its own
  file, readable by you only.
  - Never print, copy, move, paste or upload them.
  - The script passes the key's path to Apple's `notarytool` and reads nothing else from it.
- **Only the built app and the image go to Apple**, for notarization; nothing else leaves this Mac.
- **Nothing private comes back either.** What you serve and send back is only the image, its SHA-256 and the script's short report
  (it names files, never the folders they are in). Never logs, conversation text, a data folder, a home path, keys or tokens.
- **A release is built from its commit, exactly.**
  - The checkout must be clean, at the commit you were given, and `package.json` must carry a plain number (`1.8.0`, never `1.8.0-dev`).
  - Never change code here, and never sign by hand. A fix comes from the developers as a new commit.
- **When a step stops, report it.** The script stops with `Stopped: <why>`. Send that line as it is, and work around nothing:
  - no `--skip-notarize` for a release;
  - no switching off Gatekeeper.

## Before the first build (once)

1. **Xcode command line tools.** `xcode-select -p` shows a folder; if not, run `xcode-select --install`.
2. **Node.js 22.18 or newer, with npm** (`node -v`).
3. **The Developer ID certificate** in the login keychain. `security find-identity -v -p codesigning` lists
   `"Developer ID Application: <company> (<TEAM ID>)"`.
   - If it is listed only without `-v` (`CSSMERR_TP_NOT_TRUSTED`), Apple's **Developer ID - G2** intermediate is missing; Xcode installs it,
     and a Mac without Xcode has none.
   - Download `DeveloperIDG2CA.cer` from https://www.apple.com/certificateauthority/ and check it is issued by Apple Root CA
     (`openssl x509 -inform der -in DeveloperIDG2CA.cer -noout -issuer -subject`).
   - Add it: `security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db`.
4. **A way to reach Apple's notary service**, one of:
   - an App Store Connect API key: the `.p8` file (mode 600) and a JSON file beside it (mode 600) holding `{"issuer": "<Issuer ID>", "keyId": "<Key ID>"}`;
   - or a notarytool keychain profile (`xcrun notarytool store-credentials <name>`).
5. **A checkout of this repository**, kept for release builds.

## Each build

You get a commit, and where to fetch it from: a remote, or a git bundle (one file holding that commit, with its SHA-256) when the commit is
not published yet. From a bundle:

```sh
curl -fsSLO <bundle link>; curl -fsSLO <bundle link>.sha256
shasum -a 256 -c <bundle>.sha256          # must say OK
git clone -b <branch in the bundle> <bundle> jauvex-personal && cd jauvex-personal
git rev-parse HEAD                        # must be the commit you were given
```

From a remote, in the checkout:

```sh
git fetch <remote>                       # the remote you were given
git checkout --detach <commit>           # exactly that commit; git status must show nothing
node packaging/mac/release.ts --private-words <file> --notary-key <file.p8> --notary-json <file.json>
#    or: node packaging/mac/release.ts --private-words <file> --notary-profile <name>
```

It takes about 10 to 20 minutes: the packages, the Whisper models the first time, the build, then two trips to Apple of a few minutes each.
It says what it is doing as it goes, with a line every half minute while a step runs.

1. **Builds** the app as the install command does: `npm ci`, the Whisper models, `npm run build`, then Jauvex.app (`scripts/mac-app.ts`).
2. **Signs** every piece of code inside out, with the hardened runtime and a timestamp.
   - The entitlements are in `packaging/mac/`: `entitlements.plist` for the app (JIT, microphone), `tools.plist` for the providers' programs.
   - Claude's and Codex's programs keep their makers' signatures when those are already good for notarization.
3. **Notarizes** Jauvex.app, staples its ticket, and checks Gatekeeper.
4. **Makes the disk image** (Jauvex.app beside a link to Applications), then signs, notarizes and staples it.

Useful options:
- `--identity "<name>"`: when the keychain holds several Developer ID identities.
- `--skip-notarize`: signed only, a trial (Gatekeeper refuses it). Never for a release.
- `--keep`: keeps the work folder, `tmp/mac-release/<version>`.

The image is for this Mac's CPU: on Apple silicon it is `arm64`.

## After the build

1. **Read the report.** `cat tmp/release/mac-<version>-report.md`. It must show:
   - notarization `Accepted` for both the app and the image;
   - Gatekeeper's `accepted` with `source=Notarized Developer ID`;
   - the Node version inside the app.
2. **Serve it back at once**, without waiting to be asked: copy the image, its SHA-256 and the report into one folder and serve that
   folder on this Mac's Tailscale address only, never on all addresses. The report must hold no path on this Mac (a path inside the app,
   such as `Contents/Resources/...`, is fine); if the check below prints a line, serve nothing and report it:
   ```sh
   O=~/jauvex-release-<version> && mkdir -p "$O" && cp tmp/release/jauvex-personal-<version>-mac-<arch>.dmg tmp/release/mac-<version>-report.md "$O/"
   (cd "$O" && shasum -a 256 *.dmg > jauvex-personal-<version>-mac-<arch>.dmg.sha256)
   ! grep -nE '/Users/|~/|/Volumes/|/private/' "$O/mac-<version>-report.md" || echo "STOP: the report holds a path on this Mac"
   TS=$(tailscale ip -4 2>/dev/null || /Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4)
   nohup python3 -m http.server <a free port> --bind "$TS" --directory "$O" > "$O.serve.log" 2>&1 & echo "server pid $!"
   ```
3. **Ping the developers at once**, one POST to the hook address they gave you (`<hook URL from the Jauvex.ai agent>`; it is never
   written into this repository): JSON under 64 KB, with no key, token or secret in it. `status` is `done`, or `failed` with the error
   line when the build stopped (then serve the report and the `Stopped:` line, and ping all the same):
   ```sh
   python3 -c 'import json,sys; print(json.dumps({"from":"Mac Personal agent","release":"Personal "+sys.argv[1],"status":sys.argv[2],"files":sys.argv[3],"notes":sys.argv[4][:2000]}))' \
     "<version>" "done" "http://$TS:<port>/" "<one line: works, or what broke>" > "$O.ping.json"
   curl -sS --max-time 20 -X POST -H 'Content-Type: application/json' --data @"$O.ping.json" '<hook URL from the Jauvex.ai agent>'
   ```
   Then report back in one message too: the version and the commit, the report's table, the image's SHA-256, and the folder's address
   (`http://<that address>:<port>/`).
4. **Keep serving until the developers confirm** they have the files; then stop the server by its PID (never by name) and delete the
   folder, its log and the ping file. Keep the image itself where you were told to (`tmp/release/` is never committed).

## If it stops

| It says | What it means |
|---|---|
| no valid "Developer ID Application" identity | the certificate is not in this Mac's login keychain, or the G2 intermediate is missing (above) |
| … must be readable by you only | the notary key's file mode is open: `chmod 600` it |
| the checkout has changes | check out the commit, exactly, with nothing changed |
| package.json says …-dev | that commit is not a release: ask for the release commit |
| Apple did not accept … | its log is in `tmp/release/mac-<version>-notary-<part>.json`: send only the `message` of each of its `issues`, never the file |
| Gatekeeper does not accept … | send the lines it shows |
