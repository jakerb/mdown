// Monaco runs from an app:// file URL in Electron. Workers need an absolute
// URL here; a relative AMD path otherwise becomes file:///node_modules/….
const monacoBaseUrl = new URL('../../node_modules/monaco-editor/min/', window.location.href).href;
window.MonacoEnvironment = {
  getWorkerUrl() {
    const workerMainUrl = `${monacoBaseUrl}vs/base/worker/workerMain.js`;
    const workerSource = [
      `self.MonacoEnvironment = { baseUrl: ${JSON.stringify(monacoBaseUrl)} };`,
      `importScripts(${JSON.stringify(workerMainUrl)});`
    ].join('\n');
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource)}`;
  }
};
require.config({ paths: { vs: `${monacoBaseUrl}vs` } });
// marked.min.js sees the AMD loader and registers itself as the `marked` module.
require(['vs/editor/editor.main', 'marked'], (monaco, marked) => {
let currentPath = null;
let isDirty = false;
let savedContent = '';
let editorFontSize = 14;
let lineNumbersVisible = false;
let spellCheckEnabled = false;
let darkMode = false;
let previewVisible = true;
let previewPreference = false;
let aiConfig = { configured: false, model: 'gpt-5', fontSize: 14, darkMode: false, previewVisible: false, googleFont: '', keyHint: '' };
let chatSelection = null;
let chatHistory = [];
let pendingSelection = null;

monaco.editor.defineTheme('mdown', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'markup.heading.markdown', foreground: 'c66b3d', fontStyle: 'bold' },
    { token: 'markup.bold.markdown', foreground: 'ba5428', fontStyle: 'bold' },
    { token: 'string.link.markdown', foreground: '34756e' },
    { token: 'comment', foreground: 'a19d95' }
  ],
  colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#ffffff', 'editorLineNumber.foreground': '#b8b8b8', 'editorCursor.foreground': '#202020', 'editor.selectionBackground': '#dce9f7' }
});
monaco.editor.defineTheme('mdown-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'markup.heading.markdown', foreground: '8ab4f8', fontStyle: 'bold' },
    { token: 'markup.bold.markdown', foreground: 'e8b27b', fontStyle: 'bold' },
    { token: 'string.link.markdown', foreground: '86c6b9' },
    { token: 'comment', foreground: '8d929b' }
  ],
  colors: { 'editor.background': '#1e1f22', 'editorGutter.background': '#1e1f22', 'editorLineNumber.foreground': '#7d8189', 'editorCursor.foreground': '#f2f2f2', 'editor.selectionBackground': '#35557b' }
});

const editor = monaco.editor.create(document.getElementById('editor'), {
  value: '',
  language: 'markdown',
  theme: 'mdown',
  automaticLayout: true,
  minimap: { enabled: false },
  lineNumbers: 'off',
  lineNumbersMinChars: 3,
  fontSize: 14,
  lineHeight: 28,
  fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
  padding: { top: 58, bottom: 42 },
  scrollBeyondLastLine: false,
  smoothScrolling: false,
  wordWrap: 'on',
  renderLineHighlight: 'none',
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  fontLigatures: false,
  letterSpacing: 0,
  cursorSmoothCaretAnimation: 'off',
  cursorBlinking: 'solid',
  cursorStyle: 'line-thin',
  cursorWidth: 1,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: 'off',
  wordBasedSuggestions: 'off',
  inlineSuggest: { enabled: false },
  parameterHints: { enabled: false },
  suggest: { showWords: false, showSnippets: false, showMethods: false, showFunctions: false, showConstructors: false, showFields: false, showVariables: false, showClasses: false, showStructs: false, showInterfaces: false, showModules: false, showProperties: false, showEvents: false, showOperators: false, showUnits: false, showValues: false, showConstants: false, showEnums: false, showEnumMembers: false, showKeywords: false, showIssues: false, showUsers: false }
});

const $ = (selector) => document.querySelector(selector);
const preview = $('#preview');
const toast = $('#toast');
const aiSidebar = $('#ai-sidebar');
const chatMessages = $('#chat-messages');
const chatComposer = $('#chat-composer');
const settingsModal = $('#settings-modal');
const aiPrompt = $('#ai-prompt');
let filename = 'Welcome.md';
let syncingEditorScroll = false;
let syncingPreviewScroll = false;

marked.use({ gfm: true, breaks: true });
function parseFrontmatter(source) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { values: {}, body: source };
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^\s*([A-Za-z_][\w.-]*)\s*:\s*(.*?)\s*$/);
    if (!pair) continue;
    values[pair[1]] = pair[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return { values, body: source.slice(match[0].length) };
}
function render() {
  const { values, body } = parseFrontmatter(editor.getValue());
  const resolved = body.replace(/\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g, (placeholder, key) => values[key] ?? placeholder);
  preview.innerHTML = marked.parse(resolved);
}
function editorScrollRange() { return Math.max(0, editor.getScrollHeight() - editor.getLayoutInfo().height); }
function previewScrollRange() { return Math.max(0, preview.scrollHeight - preview.clientHeight); }
function syncPreviewFromEditor() {
  if (syncingPreviewScroll || !previewScrollRange() || !editorScrollRange()) return;
  syncingEditorScroll = true;
  preview.scrollTop = (editor.getScrollTop() / editorScrollRange()) * previewScrollRange();
  requestAnimationFrame(() => { syncingEditorScroll = false; });
}
function syncEditorFromPreview() {
  if (syncingEditorScroll || !previewScrollRange() || !editorScrollRange()) return;
  syncingPreviewScroll = true;
  editor.setScrollTop((preview.scrollTop / previewScrollRange()) * editorScrollRange());
  requestAnimationFrame(() => { syncingPreviewScroll = false; });
}
function setDirty(dirty) {
  isDirty = dirty;
  document.title = `${dirty ? '• ' : ''}${filename} — Mdown`;
  $('#window-title').textContent = `${dirty ? '• ' : ''}${filename}`;
  window.mdown.setDocumentState({ dirty, name: filename });
}
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}
function setModal(modal, open) { modal.classList.toggle('open', open); modal.setAttribute('aria-hidden', String(!open)); }
function setPreviewVisible(open, persist = true) {
  previewVisible = Boolean(open);
  document.body.classList.toggle('preview-visible', previewVisible);
  if (persist) {
    previewPreference = previewVisible;
    window.mdown.setPreviewVisible(previewVisible).then((config) => { aiConfig = config; }).catch(() => notify('Unable to save preview preference'));
  }
}
function togglePreview() { setPreviewVisible(!previewVisible); }
function setChatVisible(open) { document.body.classList.toggle('chat-visible', open); aiSidebar.setAttribute('aria-hidden', String(!open)); }
function escapeHtml(value) { return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]); }
function renderChat() {
  chatMessages.innerHTML = chatHistory.map((message) => `<article class="chat-message ${message.role}">${message.role === 'assistant' ? marked.parse(message.content) : `<p>${escapeHtml(message.content)}</p>`}</article>`).join('');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function applyFontSize(nextSize, persist = true) {
  editorFontSize = Math.max(11, Math.min(26, nextSize));
  editor.updateOptions({ fontSize: editorFontSize, lineHeight: Math.round(editorFontSize * 1.9) });
  $('#font-status').textContent = `${editorFontSize} px`;
  if (persist) window.mdown.setFontSize(editorFontSize).then((config) => { aiConfig = config; }).catch(() => notify('Unable to save font size'));
}
function fontStack(googleFont = '') { return googleFont ? `'${googleFont.replace(/'/g, '')}', ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace` : "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace"; }
function applyGoogleFont(googleFont = '') {
  const name = googleFont.trim().replace(/[^a-zA-Z0-9 .-]/g, '');
  document.getElementById('google-font')?.remove();
  const updateEditorFont = () => editor.updateOptions({ fontFamily: fontStack(name) });
  document.documentElement.style.setProperty('--editor-font', fontStack(name));
  if (!name) { updateEditorFont(); return; }
  const link = document.createElement('link');
  link.id = 'google-font'; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;700&display=swap`;
  link.addEventListener('load', updateEditorFont);
  link.addEventListener('error', updateEditorFont);
  document.head.append(link);
  updateEditorFont();
}
function toggleLineNumbers() {
  lineNumbersVisible = !lineNumbersVisible;
  editor.updateOptions({ lineNumbers: lineNumbersVisible ? 'on' : 'off' });
  notify(`Line numbers ${lineNumbersVisible ? 'on' : 'off'}`);
}
function setDarkMode(enabled, persist = true) {
  darkMode = Boolean(enabled);
  document.body.classList.toggle('dark-mode', darkMode);
  monaco.editor.setTheme(darkMode ? 'mdown-dark' : 'mdown');
  if (persist) window.mdown.setDarkMode(darkMode).then((config) => { aiConfig = config; }).catch(() => notify('Unable to save dark mode'));
}
function toggleDarkMode() {
  setDarkMode(!darkMode);
  notify(`Dark mode ${darkMode ? 'on' : 'off'}`);
}
async function toggleSpellCheck() {
  spellCheckEnabled = !spellCheckEnabled;
  await window.mdown.setSpellCheck(spellCheckEnabled);
  notify(`Spell check ${spellCheckEnabled ? 'on' : 'off'}`);
}
function currentSelection() {
  const selection = editor.getSelection();
  const text = selection ? editor.getModel().getValueInRange(selection) : '';
  return { range: selection, text };
}
async function openAi() {
  aiConfig = await window.mdown.getConfig();
  if (!aiConfig.configured) { openSettings(); notify('Add an OpenAI API key to use AI writing tools'); return; }
  chatSelection = pendingSelection || currentSelection();
  pendingSelection = null;
  chatHistory = [];
  renderChat();
  aiPrompt.value = '';
  aiPrompt.placeholder = 'How can I help? (Esc to hide)';
  setChatVisible(true);
  aiPrompt.focus();
}
function toggleAiChat() {
  if (document.body.classList.contains('chat-visible')) { setChatVisible(false); editor.focus(); }
  else openAi();
}
async function runAiAction(action, selection, instruction = '') {
  const result = await window.mdown.runAi({ action, selection: selection.text, instruction, document: editor.getValue() });
  const originalRange = selection.range || editor.getSelection();
  const hasSelection = selection.text.trim().length > 0;
  const range = action === 'compose' && originalRange && !hasSelection
    ? new monaco.Range(originalRange.positionLineNumber, originalRange.positionColumn, originalRange.positionLineNumber, originalRange.positionColumn)
    : originalRange;
  if (!range) return;
  const model = editor.getModel();
  const startOffset = model.getOffsetAt(range.getStartPosition());
  editor.executeEdits('mdown-ai', [{ range, text: result, forceMoveMarkers: true }]);
  const endPosition = model.getPositionAt(startOffset + result.length);
  editor.setSelection(new monaco.Selection(range.startLineNumber, range.startColumn, endPosition.lineNumber, endPosition.column));
}
async function submitAi() {
  const instruction = aiPrompt.value.trim();
  if (!instruction) return;
  const selection = chatSelection || currentSelection();
  chatHistory.push({ role: 'user', content: instruction });
  aiPrompt.value = ''; renderChat();
  chatComposer.classList.add('busy'); aiPrompt.disabled = true;
  try {
    const response = await window.mdown.runAi({ action: 'chat', selection: selection.text, instruction, document: editor.getValue(), history: chatHistory.slice(0, -1) });
    chatHistory.push({ role: 'assistant', content: response }); renderChat();
  } catch (error) { chatHistory.push({ role: 'assistant', content: `**Error:** ${error.message || 'Unable to complete request.'}` }); renderChat(); }
  finally { chatComposer.classList.remove('busy'); aiPrompt.disabled = false; aiPrompt.focus(); }
}
async function replaceSelectedText(action) {
  const selection = pendingSelection || currentSelection();
  pendingSelection = null;
  if (!selection.text.trim()) return;
  try { await runAiAction(action, selection); }
  catch (error) { notify(error.message || 'Unable to revise text'); }
}
async function openSettings() {
  aiConfig = await window.mdown.getConfig();
  $('#api-key').value = '';
  $('#ai-model').value = aiConfig.model || 'gpt-5';
  $('#key-hint').textContent = aiConfig.configured ? `Saved key ${aiConfig.keyHint}. Leave the field blank to keep it.` : 'Your key is stored locally in ~/mdown.config.json.';
  setModal(settingsModal, true);
  $('#api-key').focus();
}
async function saveSettings() {
  try {
    aiConfig = await window.mdown.saveConfig({ apiKey: $('#api-key').value, model: $('#ai-model').value });
    setModal(settingsModal, false); notify('AI settings saved');
  } catch (error) { notify(error.message || 'Unable to save settings'); }
}
function newNote() {
  currentPath = null;
  editor.setValue('# Untitled note\n\nStart writing in Markdown…\n');
  savedContent = editor.getValue();
  filename = 'Untitled.md';
  setDirty(false);
  editor.focus();
}
function newBlankNote() {
  currentPath = null;
  editor.setValue('');
  savedContent = '';
  filename = 'Untitled.md';
  setPreviewVisible(previewPreference, false);
  setDirty(false);
  editor.focus();
}
function displayFile(file) {
  currentPath = file.path;
  editor.setValue(file.content);
  savedContent = file.content;
  filename = file.name;
  setPreviewVisible(file.name === 'Welcome.md' ? true : previewPreference, false);
  setDirty(false);
  editor.focus();
  notify(`Opened ${file.name}`);
}
async function save(forceNew = false) {
  const result = await window.mdown.saveFile({ filePath: forceNew ? null : currentPath, content: editor.getValue() });
  if (!result) return false;
  currentPath = result.path;
  savedContent = editor.getValue();
  filename = result.name;
  setDirty(false);
  notify(`Saved ${result.name}`);
  return true;
}

editor.onDidChangeModelContent(() => { render(); setDirty(editor.getValue() !== savedContent); });
function schedulePreviewSync() { requestAnimationFrame(syncPreviewFromEditor); }
function scheduleEditorSync() { requestAnimationFrame(syncEditorFromPreview); }
editor.onDidScrollChange((event) => { if (event.scrollTopChanged) schedulePreviewSync(); });
document.querySelector('.editor-pane').addEventListener('wheel', schedulePreviewSync, { passive: true });
preview.addEventListener('scroll', syncEditorFromPreview, { passive: true });
preview.addEventListener('wheel', scheduleEditorSync, { passive: true });
window.mdown.onOpen(displayFile);
window.mdown.onMenu('new', newNote);
window.mdown.onMenu('blank-document', newBlankNote);
window.mdown.onMenu('save', () => save());
window.mdown.onMenu('save-as', () => save(true));
window.mdown.onMenu('save-and-close', async () => { if (await save()) window.mdown.closeAfterSave(); });
window.mdown.onMenu('toggle-preview', togglePreview);
window.mdown.onMenu('toggle-dark-mode', toggleDarkMode);
window.mdown.onMenu('toggle-line-numbers', toggleLineNumbers);
window.mdown.onMenu('toggle-spell-check', toggleSpellCheck);
window.mdown.onMenu('font-increase', () => applyFontSize(editorFontSize + 1));
window.mdown.onMenu('font-decrease', () => applyFontSize(editorFontSize - 1));
window.mdown.onMenu('font-reset', () => applyFontSize(14));
window.mdown.onMenu('ai-compose', toggleAiChat);
window.mdown.onAi('improve', () => replaceSelectedText('improve'));
window.mdown.onAi('rewrite', () => replaceSelectedText('rewrite'));
window.mdown.onAi('prompt', openAi);
window.mdown.onAi('custom', (action) => replaceSelectedText(action));
$('#ai-settings').addEventListener('click', openSettings);
$('#close-ai').addEventListener('click', () => { setChatVisible(false); editor.focus(); });
$('#close-settings').addEventListener('click', () => setModal(settingsModal, false));
$('#save-settings').addEventListener('click', saveSettings);
aiPrompt.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitAi(); } });
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('chat-visible')) {
    event.preventDefault(); setChatVisible(false); editor.focus();
  }
});
document.getElementById('editor').addEventListener('contextmenu', (event) => {
  const selection = currentSelection();
  if (!selection.text.trim()) return;
  pendingSelection = selection;
  event.preventDefault();
  window.mdown.showContextMenu({ hasSelection: true });
});
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  event.preventDefault();
  window.mdown.openExternal(link.href).catch(() => notify('Unable to open link'));
});
render();
setDirty(false);
setPreviewVisible(true, false);
applyFontSize(14, false);
window.mdown.setSpellCheck(false);
window.mdown.getConfig().then((config) => {
  aiConfig = config;
  previewPreference = Boolean(config.previewVisible);
  if (filename !== 'Welcome.md') setPreviewVisible(previewPreference, false);
  applyFontSize(config.fontSize || 14, false);
  applyGoogleFont(config.googleFont || '');
  setDarkMode(config.darkMode, false);
});
});
