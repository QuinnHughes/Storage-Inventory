// Preload runs in the renderer context before the page loads.
// Keep this minimal — only expose what the renderer actually needs.
// contextIsolation: true ensures the renderer has no direct Node access.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});
