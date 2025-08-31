// extension.js
// VS Code Extension: Novel Preview（縦書きプレビュー）

const vscode = require("vscode");
const fs = require("fs");

function activate(context) {
  console.log("novel-preview :: activate()");

  // === コマンド登録 ===
  context.subscriptions.push(
    vscode.commands.registerCommand("novelPreview.open", () => {
      PreviewPanel.show(context.extensionUri);
    }),
    vscode.commands.registerCommand("novelPreview.refresh", () => {
      PreviewPanel.update();
    })
  );

  // エディタの変更をプレビューへ反映
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        PreviewPanel.update();
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) {
        PreviewPanel.update();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("novelPreview")) {
        PreviewPanel.update();
      }
    })
  );
}

function deactivate() {
  if (PreviewPanel.currentPanel) {
    PreviewPanel.currentPanel.dispose();
  }
}

class PreviewPanel {
  static currentPanel = undefined;
  static viewType = "novelPreview";

  constructor(panel, extensionUri, editor) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._editor = editor;
    this._disposables = [];
    this._initialized = false;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) this._update();
      },
      null,
      this._disposables
    );

    this._panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.command === "alert") {
          vscode.window.showErrorMessage(message.text);
        }
      },
      null,
      this._disposables
    );

    this._update(true);
  }

  static show(extensionUri) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Two
      : vscode.ViewColumn.Two;
    const editor = vscode.window.activeTextEditor;

    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel._panel.reveal(column);
      PreviewPanel.currentPanel._update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      "縦書きプレビュー",
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
        retainContextWhenHidden: true,
      }
    );

    PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, editor);
  }

  static revive(panel, extensionUri, editor) {
    PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, editor);
  }

  dispose() {
    PreviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  static update() {
    if (this.currentPanel) this.currentPanel._update();
  }

  _update(isFirst = false) {
    this._panel.title = "Novel Preview";

    const editor = vscode.window.activeTextEditor;
    this._editor = editor;

    const text = editor ? editor.document.getText() : "";
    const offset = editor
      ? editor.document.offsetAt(editor.selection.anchor)
      : 0;

    const config = vscode.workspace.getConfiguration("novelPreview");
    const fontSizeNum = clampNumber(config.get("fontSize", 20), 8, 72);
    const fontsize = `${fontSizeNum}px`;
    const fontfamily = "";

    const symbol = "|";
    const position = "inner";

    if (!this._initialized || isFirst) {
      this._panel.webview.html = this._getHtmlForWebview();
      this._initialized = true;
    }

    this._panel.webview.postMessage({
      type: "update",
      payload: { text, offset, cursor: symbol, position, fontsize, fontfamily },
    });
  }

  _getHtmlForWebview() {
    const webview = this._panel.webview;
    const mediaRoot = vscode.Uri.joinPath(this._extensionUri, "media");

    const indexPath = vscode.Uri.joinPath(mediaRoot, "index.html");
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, "style.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, "main.js")
    );
    const cspSource = webview.cspSource;
    const nonce = getNonce();

    let html = fs.readFileSync(indexPath.fsPath, "utf8");
    html = html
      .replace(/\{\{cspSource\}\}/g, cspSource)
      .replace(/\{\{styleUri\}\}/g, styleUri.toString())
      .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
      .replace(/\{\{nonce\}\}/g, nonce);

    return html;
  }
}

function getNonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function clampNumber(n, min, max) {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

module.exports = { activate, deactivate };
