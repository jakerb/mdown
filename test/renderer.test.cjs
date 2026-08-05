const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

test('Markdown renderer parses expected formatting', () => {
  const rendered = marked.parse('# Heading\n\n**bold** and [link](https://example.com)');
  assert.match(rendered, /<h1>Heading<\/h1>/);
  assert.match(rendered, /<strong>bold<\/strong>/);
  assert.match(rendered, /href="https:\/\/example\.com"/);
});

test('renderer supports frontmatter key-value placeholders', () => {
  assert.match(renderer, /function parseFrontmatter\(source\)/);
  assert.match(renderer, /const \{ values, body \} = parseFrontmatter/);
  assert.match(renderer, /values\[key\] \?\? placeholder/);
  assert.match(renderer, /source\.match\(\/\^---/);
});

test('editor and preview have bidirectional scroll synchronization', () => {
  assert.match(renderer, /function syncPreviewFromEditor\(\)/);
  assert.match(renderer, /function syncEditorFromPreview\(\)/);
  assert.match(renderer, /editor\.onDidScrollChange/);
  assert.match(renderer, /preview\.addEventListener\('scroll', syncEditorFromPreview/);
  assert.match(renderer, /editor-pane'\)\.addEventListener\('wheel', schedulePreviewSync/);
});

test('renderer loads Marked as an AMD dependency', () => {
  assert.match(renderer, /require\(\['vs\/editor\/editor\.main', 'marked'\], \(monaco, marked\) =>/);
  assert.match(html, /marked\.min\.js/);
});

test('Monaco workers are loaded from an absolute app-relative URL', () => {
  assert.match(renderer, /new URL\('\.\.\/\.\.\/node_modules\/monaco-editor\/min\/', window\.location\.href\)/);
  assert.match(renderer, /MonacoEnvironment/);
  assert.match(renderer, /workerMain\.js/);
  assert.match(renderer, /importScripts/);
});

test('macOS icon is a 1024px transparent PNG and is used for packaging', () => {
  const icon = fs.readFileSync(path.join(root, 'icon.png'));
  assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(icon[25], 6, 'PNG color type 6 is RGBA');
  assert.equal(packageConfig.build.mac.icon, 'icon.png');
  assert.match(packageConfig.scripts['package:mac'], /package:mac:intel/);
  assert.match(packageConfig.scripts['package:mac'], /package:mac:silicon/);
  assert.match(packageConfig.scripts['package:mac:intel'], /--x64/);
  assert.match(packageConfig.scripts['package:mac:silicon'], /--arm64/);
});

test('TextEdit layout starts editor-only and Preview is menu-toggleable', () => {
  assert.doesNotMatch(html, /<nav|save-file|open-file/);
  assert.match(renderer, /ui-monospace/);
  assert.match(renderer, /preview-visible/);
  assert.match(main, /label: 'Toggle Preview'/);
  assert.match(main, /CmdOrCtrl\+Shift\+P/);
  assert.match(main, /menu:toggle-preview/);
  assert.match(html, /class="drag-strip"/);
  assert.match(html, /id="window-title"/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /-webkit-app-region: drag/);
  assert.match(renderer, /#window-title/);
});

test('new and opened documents get their own windows and dirty closes are guarded', () => {
  assert.match(main, /click: \(\) => createWindow\(\)/);
  assert.match(main, /if \(file\) createWindow\(file\)/);
  assert.match(main, /showWelcome = BrowserWindow\.getAllWindows\(\)\.length === 0/);
  assert.match(main, /menu:blank-document/);
  assert.match(main, /Save changes to/);
  assert.match(main, /menu:save-and-close/);
  assert.match(renderer, /if \(await save\(\)\) window\.mdown\.closeAfterSave\(\)/);
  assert.match(renderer, /setDocumentState\(\{ dirty, name: filename \}\)/);
});

test('editor defaults are distraction-free and configurable', () => {
  assert.match(renderer, /lineNumbers: 'off'/);
  assert.match(renderer, /quickSuggestions: false/);
  assert.match(renderer, /wordBasedSuggestions: 'off'/);
  assert.match(renderer, /padding: \{ top: 58/);
  assert.match(main, /Toggle Line Numbers/);
  assert.match(main, /Toggle Dark Mode/);
  assert.match(main, /CmdOrCtrl\+Shift\+D/);
  assert.match(renderer, /function toggleDarkMode\(\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /body\.dark-mode/);
  assert.match(main, /fontSize: 14/);
  assert.match(main, /darkMode: false/);
  assert.match(main, /previewVisible: false/);
  assert.match(main, /config:set-dark-mode/);
  assert.match(main, /config:set-preview-visible/);
  assert.match(main, /config:set-font-size/);
  assert.match(renderer, /setDarkMode\(config\.darkMode, false\)/);
  assert.match(renderer, /setPreviewVisible\(true, false\)/);
  assert.match(renderer, /setPreviewVisible\(file\.name === 'Welcome\.md' \? true : previewPreference, false\)/);
  assert.match(renderer, /window\.mdown\.setFontSize\(editorFontSize\)/);
  assert.match(main, /Toggle Spell Check/);
  assert.match(main, /Increase Editor Font Size/);
});

test('AI settings, selection tools, and secure renderer boundary are wired', () => {
  assert.match(html, /id="ai-settings"/);
  assert.match(html, /id="api-key"/);
  assert.match(main, /mdown\.config\.json/);
  assert.match(main, /defaultPrompts/);
  assert.match(main, /chat:/);
  assert.match(main, /config\.prompts\?\.\[action\]/);
  assert.match(main, /label: 'Edit Config…'/);
  assert.match(main, /sendToFocused\('file:opened', await openConfigFile\(\)\)/);
  assert.match(main, /api\.openai\.com\/v1\/responses/);
  assert.match(main, /raw Markdown/);
  assert.match(main, /context-menu:show/);
  assert.match(main, /if \(!hasSelection \|\| !config\.apiKey\) return/);
  assert.match(renderer, /async function openAi\(\)/);
  assert.match(renderer, /aiConfig = await window\.mdown\.getConfig\(\)/);
  assert.match(main, /label: 'Improve'/);
  assert.match(main, /label: 'Rewrite'/);
  assert.match(main, /label: 'Prompt…'/);
  assert.match(renderer, /onAi\('improve'/);
  assert.match(renderer, /onAi\('rewrite'/);
  assert.match(renderer, /onAi\('prompt'/);
  assert.match(renderer, /onAi\('custom'/);
  assert.match(html, /id="ai-sidebar"/);
  assert.match(html, /id="chat-messages"/);
  assert.match(renderer, /action: 'chat'/);
  assert.match(renderer, /chatHistory\.push\(\{ role: 'assistant'/);
  assert.match(renderer, /chatSelection = pendingSelection \|\| currentSelection\(\)/);
  assert.match(renderer, /pendingSelection = selection/);
  assert.match(renderer, /function toggleAiChat\(\)/);
  assert.match(renderer, /onMenu\('ai-compose', toggleAiChat\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /body\.chat-visible \.drag-strip \{ right: 370px/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /body\.chat-visible \.workspace/);
  assert.match(renderer, /onMenu\('ai-compose'/);
  assert.match(main, /CmdOrCtrl\+Shift\+I/);
  assert.match(html, /placeholder="How can I help\? \(Esc to hide\)"/);
  assert.doesNotMatch(html, /id="run-ai"/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /@keyframes ai-ring/);
  assert.match(renderer, /aiPrompt\.placeholder = 'How can I help\? \(Esc to hide\)'/);
  assert.match(renderer, /event\.key === 'Escape'/);
  assert.match(renderer, /const hasSelection = selection\.text\.trim\(\)\.length > 0/);
  assert.match(renderer, /model\.getPositionAt\(startOffset \+ result\.length\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /animation: ai-ring 2\.5s/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /\.ai-sheet \{ padding: 0; border: 0/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8'), /getConfig:.*apiKey/);
});
