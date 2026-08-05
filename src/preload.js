const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mdown', {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  setFontSize: (fontSize) => ipcRenderer.invoke('config:set-font-size', fontSize),
  setDarkMode: (darkMode) => ipcRenderer.invoke('config:set-dark-mode', darkMode),
  setPreviewVisible: (previewVisible) => ipcRenderer.invoke('config:set-preview-visible', previewVisible),
  addWritingTime: (seconds) => ipcRenderer.invoke('writing-time:add', seconds),
  runAi: (request) => ipcRenderer.invoke('ai:run', request),
  showContextMenu: (options) => ipcRenderer.invoke('context-menu:show', options),
  setSpellCheck: (enabled) => ipcRenderer.invoke('spellcheck:set', enabled),
  setDocumentState: (state) => ipcRenderer.send('document:state', state),
  closeAfterSave: () => ipcRenderer.send('document:close-after-save'),
  onOpen: (callback) => ipcRenderer.on('file:opened', (_event, file) => callback(file)),
  onMenu: (name, callback) => ipcRenderer.on(`menu:${name}`, callback),
  onAi: (name, callback) => ipcRenderer.on(`ai:${name}`, (_event, ...args) => callback(...args))
});
