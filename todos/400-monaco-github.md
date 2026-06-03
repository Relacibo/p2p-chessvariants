## IDE-Popup & GitHub Repo VFS
*Ziel: Editor auslagern und GitHub als Cloud-Dateisystem nutzen.*

### Monaco & PiP Popup
* [ ] **PiP-Window:** `window.documentPictureInPicture.requestWindow()` für echtes HTML-Popup nutzen.
* [ ] **DOM-Transfer:** Editor-Container und CSS-Styles in das neue Fenster verschieben.
* [ ] **Monaco-Setup:** Editor einbetten und Syntax-Highlighting auf `javascript` oder `rust` stellen.
* [ ] **Live-Kompilierung:** Bei `onDidChangeModelContent` den Code sofort an die WASM-Engine im Hauptfenster streamen.

### GitHub API (Virtual Filesystem)
* [ ] **OAuth:** GitHub-Token im `localStorage` hinterlegen.
* [ ] **File-Tree:** Per `GET /repos/.../git/trees/main` den Dateibaum holen und als Seitenleiste im Popup rendern.
* [ ] **Auto-Commit:** Bei *Strg + S* geänderten Code direkt per REST-API auf GitHub committen.
