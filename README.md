# Mdown

Mdown is a focused, native-feeling Markdown editor for macOS. It pairs Monaco's fast editor with a simple, optional preview so writing stays at the centre of the app.

## Download

Download the current macOS installers from the [Mdown Releases page](https://github.com/jakerb/mdown/releases): choose **Apple Silicon** for M-series Macs or **Intel** for older Intel-based Macs.

## Features

- Open and edit Markdown files in dedicated windows.
- Monaco editor with Markdown-aware editing, a clean TextEdit-inspired interface, and configurable font size.
- Toggleable rendered preview with proportional scroll synchronisation.
- YAML-style frontmatter and `{{key}}` placeholders for reusable document values.
- Optional AI writing assistant: chat about a document or selection, improve/rewrite selected text, and customise prompts.
- Light and dark modes, persistent preview/font settings, and optional Google Font support.

## Keyboard shortcuts

- `⌘N` — new document window
- `⌘O` — open a Markdown file in a new window
- `⌘S` / `⇧⌘S` — save / save as
- `⇧⌘P` — toggle preview
- `⇧⌘I` — toggle the AI sidebar
- `⌘+` / `⌘-` — change editor font size

## AI configuration

Choose **Edit → Edit Config…** to edit Mdown's local configuration file. Add your API key there to enable the assistant, and optionally add or change the saved writing prompts. The configuration stays on your Mac and is excluded from Git.

## Development

Requires Node.js and macOS.

```sh
npm install
npm test
npm start
```

Create installers after the test suite passes:

```sh
npm run package:mac:intel    # Intel Macs
npm run package:mac:silicon  # Apple Silicon Macs
# or build both
npm run package:mac
```

The DMGs are written to `dist/` as architecture-specific files.

To test, package, tag, push, and publish a release in one step, first commit any application changes, then run:

```sh
./scripts/release.sh 1.0.1
```

The script requires an authenticated GitHub CLI session and publishes the Intel and Apple Silicon DMGs to GitHub Releases.

## Support the project

If Mdown is useful to you, you can support its development at [Buy Me a Coffee](https://buymeacoffee.com/jakebown).
