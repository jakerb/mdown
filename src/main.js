const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let mainWindow;
let showWelcomeOnLaunch = true;
const configPath = () => path.join(app.getPath('home'), 'mdown.config.json');
const defaultPrompts = {
  improve: 'Improve the selected text for clarity, flow, and concision. Preserve its voice, facts, formatting, and intent. Return only the revised text as raw Markdown. Never add commentary or wrap the response in a code fence.',
  rewrite: 'Rewrite the selected text from scratch while preserving its meaning, facts, and Markdown formatting. Return only the replacement as raw Markdown. Never add commentary or wrap the response in a code fence.',
  review: 'Revise the selected text using the user instruction. Preserve facts and return only the replacement as raw Markdown. Never add commentary or wrap the response in a code fence.',
  compose: 'Write the requested addition for the Markdown document. Use the document only as context. Return only raw Markdown to insert at the cursor, with no preamble, commentary, or code fence.',
  chat: 'Answer the user’s question about the selected text and document context. Be accurate and concise. Return the answer as raw Markdown, with no preamble or code fence.'
};
const defaultConfig = { apiKey: '', model: 'gpt-5', fontSize: 14, darkMode: false, previewVisible: false, showWelcomeOnLaunch: true, writingTimeSeconds: 0, googleFont: '', prompts: defaultPrompts };

async function readConfig() {
  try {
    const saved = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    return { ...defaultConfig, ...saved, prompts: { ...defaultPrompts, ...(saved.prompts || {}) } };
  }
  catch { return { ...defaultConfig }; }
}

async function saveConfig({ apiKey, model, fontSize }) {
  const existing = await readConfig();
  const next = {
    apiKey: apiKey?.trim() || existing.apiKey,
    model: model || existing.model,
    fontSize: Number.isFinite(fontSize) ? Math.max(11, Math.min(26, fontSize)) : existing.fontSize,
    darkMode: existing.darkMode,
    previewVisible: existing.previewVisible,
    showWelcomeOnLaunch: existing.showWelcomeOnLaunch,
    writingTimeSeconds: existing.writingTimeSeconds,
    googleFont: existing.googleFont,
    prompts: existing.prompts
  };
  await fs.writeFile(configPath(), `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { configured: Boolean(next.apiKey), model: next.model, fontSize: next.fontSize, darkMode: next.darkMode, previewVisible: next.previewVisible, googleFont: next.googleFont, keyHint: next.apiKey ? `••••${next.apiKey.slice(-4)}` : '' };
}

async function publicConfig() {
  const config = await readConfig();
  const promptNames = Object.keys(config.prompts || {}).filter((name) => !['improve', 'rewrite', 'review', 'compose', 'chat'].includes(name));
  return { configured: Boolean(config.apiKey), model: config.model, fontSize: config.fontSize, darkMode: config.darkMode, previewVisible: config.previewVisible, writingTimeSeconds: config.writingTimeSeconds, googleFont: config.googleFont, promptNames, keyHint: config.apiKey ? `••••${config.apiKey.slice(-4)}` : '' };
}

async function openConfigFile() {
  const config = await readConfig();
  await fs.writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  const filePath = configPath();
  return { path: filePath, name: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
}

function extractOutput(payload) {
  if (payload.output_text) return payload.output_text.trim();
  return (payload.output || []).flatMap((item) => item.content || []).map((part) => part.text || '').join('').trim();
}

async function runAi(_event, { action, selection = '', instruction = '', document = '', history = [] }) {
  const config = await readConfig();
  if (!config.apiKey) throw new Error('Add an OpenAI API key in AI Settings first.');
  const prompt = config.prompts?.[action];
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Unknown or empty AI prompt.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        input: [
          { role: 'developer', content: prompt },
          { role: 'user', content: `Document context:\n${document.slice(0, 24000)}\n\nSelected text:\n${selection}` },
          ...history.slice(-12).map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })),
          { role: 'user', content: instruction }
        ],
        max_output_tokens: 2000
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || 'OpenAI request failed.');
    const output = extractOutput(payload);
    if (!output) throw new Error('The model returned no text.');
    return output;
  } finally { clearTimeout(timeout); }
}

function sendToFocused(channel, ...args) {
  const window = BrowserWindow.getFocusedWindow() || mainWindow;
  if (window && !window.isDestroyed()) window.webContents.send(channel, ...args);
}

async function openExternalLink(rawUrl) {
  let url;
  try { url = new URL(rawUrl); }
  catch { return false; }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return false;
  await shell.openExternal(url.href);
  return true;
}

async function welcomeFile() {
  const filePath = path.join(__dirname, '..', 'welcome.md');
  return { path: null, name: 'Welcome.md', content: await fs.readFile(filePath, 'utf8') };
}

function createWindow(file = null, showWelcome = showWelcomeOnLaunch && BrowserWindow.getAllWindows().length === 0) {
  const window = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6f5f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;
  window.isDocumentDirty = false;
  window.documentName = file?.name || 'Untitled.md';
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url).catch(() => {});
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return;
    event.preventDefault();
    openExternalLink(url).catch(() => {});
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.webContents.once('did-finish-load', async () => {
    if (file) window.webContents.send('file:opened', file);
    else if (showWelcome) window.webContents.send('file:opened', await welcomeFile());
    else window.webContents.send('menu:blank-document');
  });
  window.on('close', (event) => {
    if (!window.isDocumentDirty || window.allowClose) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning', buttons: ['Save', 'Cancel', 'Don’t Save'], defaultId: 0, cancelId: 1,
      message: `Save changes to “${window.documentName}” before closing?`
    });
    if (choice === 2) { window.allowClose = true; return; }
    event.preventDefault();
    if (choice === 0) window.webContents.send('menu:save-and-close');
  });
  return window;
}

async function openMarkdownFile(parentWindow = BrowserWindow.getFocusedWindow()) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Open Markdown',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
}

async function saveMarkdownFile(_event, { filePath, content }) {
  const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
  let targetPath = filePath;
  if (!targetPath) {
    const result = await dialog.showSaveDialog(ownerWindow, {
      title: 'Save Markdown',
      defaultPath: 'Untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return null;
    targetPath = result.filePath;
  }
  await fs.writeFile(targetPath, content, 'utf8');
  return { path: targetPath, name: path.basename(targetPath) };
}

app.whenReady().then(async () => {
  showWelcomeOnLaunch = (await readConfig()).showWelcomeOnLaunch !== false;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'File', submenu: [
      { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: async () => { const file = await openMarkdownFile(); if (file) createWindow(file); } },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('menu:save') },
      { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToFocused('menu:save-as') },
      { type: 'separator' }, { role: 'close' }
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      { type: 'separator' }, { label: 'Write with AI…', accelerator: 'CmdOrCtrl+Shift+I', click: () => sendToFocused('menu:ai-compose') },
      { label: 'Edit Config…', click: async () => {
        try { sendToFocused('file:opened', await openConfigFile()); }
        catch (error) { dialog.showErrorBox('Unable to Open Config', error.message); }
      } }
    ] },
    { label: 'View', submenu: [
      { label: 'Toggle Preview', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendToFocused('menu:toggle-preview') },
      { label: 'Toggle Dark Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => sendToFocused('menu:toggle-dark-mode') },
      { label: 'Toggle Line Numbers', accelerator: 'CmdOrCtrl+Shift+L', click: () => sendToFocused('menu:toggle-line-numbers') },
      { label: 'Toggle Spell Check', accelerator: 'CmdOrCtrl+Shift+;', click: () => sendToFocused('menu:toggle-spell-check') },
      { type: 'separator' },
      { label: 'Increase Editor Font Size', accelerator: 'CmdOrCtrl+=', click: () => sendToFocused('menu:font-increase') },
      { label: 'Decrease Editor Font Size', accelerator: 'CmdOrCtrl+-', click: () => sendToFocused('menu:font-decrease') },
      { label: 'Reset Editor Font Size', accelerator: 'CmdOrCtrl+0', click: () => sendToFocused('menu:font-reset') },
      { type: 'separator' },
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }
    ] },
    { label: 'Window', submenu: [
      { label: 'Show Welcome on Launch', type: 'checkbox', checked: showWelcomeOnLaunch, click: async (item) => {
        showWelcomeOnLaunch = item.checked;
        const config = await readConfig();
        await fs.writeFile(configPath(), `${JSON.stringify({ ...config, showWelcomeOnLaunch }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      } },
      { type: 'separator' }, { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }
    ] }
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('file:open', (event) => openMarkdownFile(BrowserWindow.fromWebContents(event.sender)));
ipcMain.handle('file:save', saveMarkdownFile);
ipcMain.handle('file:reveal', (_event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('shell:open-external', (_event, url) => openExternalLink(url));
ipcMain.handle('config:get', publicConfig);
ipcMain.handle('config:save', (_event, config) => saveConfig(config));
ipcMain.handle('config:set-font-size', (_event, fontSize) => saveConfig({ fontSize }));
ipcMain.handle('config:set-dark-mode', async (_event, darkMode) => {
  const config = await readConfig();
  await fs.writeFile(configPath(), `${JSON.stringify({ ...config, darkMode: Boolean(darkMode) }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return publicConfig();
});
ipcMain.handle('config:set-preview-visible', async (_event, previewVisible) => {
  const config = await readConfig();
  await fs.writeFile(configPath(), `${JSON.stringify({ ...config, previewVisible: Boolean(previewVisible) }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return publicConfig();
});
ipcMain.handle('writing-time:add', async (_event, seconds) => {
  const config = await readConfig();
  const increment = Math.max(0, Math.min(60, Number(seconds) || 0));
  const writingTimeSeconds = Math.round((Number(config.writingTimeSeconds) || 0) + increment);
  await fs.writeFile(configPath(), `${JSON.stringify({ ...config, writingTimeSeconds }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return writingTimeSeconds;
});
ipcMain.handle('ai:run', runAi);
ipcMain.handle('spellcheck:set', (event, enabled) => event.sender.session.setSpellCheckerEnabled(Boolean(enabled)));
ipcMain.on('document:state', (event, { dirty, name }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) { window.isDocumentDirty = Boolean(dirty); window.documentName = name || window.documentName; }
});
ipcMain.on('document:close-after-save', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) { window.allowClose = true; window.close(); }
});
ipcMain.handle('context-menu:show', async (event, { hasSelection }) => {
  const config = await readConfig();
  if (!hasSelection) return;
  const customPrompts = Object.keys(config.prompts || {})
    .filter((name) => !['improve', 'rewrite', 'review', 'compose', 'chat'].includes(name))
    .map((name) => ({ label: name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), click: () => event.sender.send('ai:custom', name) }));
  Menu.buildFromTemplate([
    { label: 'Improve', click: () => event.sender.send('ai:improve') },
    { label: 'Rewrite', click: () => event.sender.send('ai:rewrite') },
    ...(customPrompts.length ? [{ type: 'separator' }, ...customPrompts] : []),
    { type: 'separator' },
    { label: 'Prompt…', click: () => event.sender.send('ai:prompt') }
  ]).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});
