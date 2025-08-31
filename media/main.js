// @ts-nocheck
(function () {
  /** @type {HTMLElement} */
  const content = document.getElementById("content");

  /** @type {HTMLElement|null} */
  let cursorEl = null;
  let blinkTimer = null;

  // --- New: 上下ホイールで左右スクロール（縦方向→横方向にマッピング） ---
  // 既定の（縦）スクロールは抑止し、deltaY を scrollLeft に加算する
  content.addEventListener(
    "wheel",
    (e) => {
      // Ctrl+ホイール ＝ ズームの意図を尊重（ブラウザ既定動作）
      if (e.ctrlKey) return;

      const delta = normalizeWheelDelta(e);
      // deltaY 正（下スクロール）なら右へ進める
      content.scrollLeft += delta.y;

      // トラックパッド横スワイプ（deltaX）が来た場合も加算（自然な感覚）
      if (Math.abs(delta.x) > Math.abs(delta.y)) {
        content.scrollLeft += delta.x;
      }

      // 既定の縦スクロールは無効化
      e.preventDefault();
    },
    // preventDefault を有効にするため passive: false
    { passive: false }
  );

  function normalizeWheelDelta(e) {
    // deltaMode: 0=Pixel, 1=Line, 2=Page
    const LINE_PIXELS = 16; // おおむね 1 行 = 16px として扱う
    const PAGE_PIXELS = content.clientHeight || window.innerHeight || 800;

    const factor =
      e.deltaMode === 1 ? LINE_PIXELS : e.deltaMode === 2 ? PAGE_PIXELS : 1;

    return {
      x: e.deltaX * factor,
      y: e.deltaY * factor,
    };
  }
  // --- End of wheel mapping ---

  // vscode からのメッセージを受け取る
  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    const { type, payload } = event.data;

    if (type === "update") {
      render(payload);
    }
  });

  /**
   * 描画処理
   * @param {{text:string, offset:number, cursor:string, position:string, fontsize:string, fontfamily:string}} data
   */
  function render(data) {
    const { text, offset, cursor, position, fontsize, fontfamily } = data;

    // パラグラフ化＋カーソル注入
    const injected = injectCursor(text, offset, cursor);
    const html = paragraphs(injected);

    // 置換描画
    content.innerHTML = html;

    // 直後にスタイル反映（フォント系は CSS より inline 優先）
    content.querySelectorAll("p").forEach((p) => {
      p.style.fontSize = fontsize || "14px";
      p.style.fontFamily = fontfamily ? `"${fontfamily}"` : "";
    });

    cursorEl = document.getElementById("cursor");

    // カーソル点滅をリセット
    resetBlink();

    // スクロール位置
    adjustScroll(position);
  }

  /**
   * カーソルを埋め込む
   * @param {string} text
   * @param {number} offset
   * @param {string} cursor
   * @returns {string}
   */
  function injectCursor(text, offset, cursor) {
    const off = Math.max(0, Math.min(offset, text.length));
    return (
      text.slice(0, off) +
      '<span id="cursor">' +
      escapeHtml(cursor) +
      "</span>" +
      text.slice(off)
    );
  }

  /**
   * パラグラフ化
   * - 空白行は不可視文字で高さ確保
   * @param {string} textWithCursor
   * @returns {string}
   */
  function paragraphs(textWithCursor) {
    const lines = textWithCursor.split("\n");
    const out = [];

    for (const line of lines) {
      if (!/^\s+$/.test(line) && line !== "") {
        // 二重スペース置換は必要に応じて（ここでは何もしない or 微調整可）
        out.push("<p>" + line + "</p>");
      } else {
        out.push('<p class="blank">_</p>');
      }
    }
    return out.join("");
  }

  /** カーソル点滅 */
  function resetBlink() {
    if (!cursorEl) return;
    if (blinkTimer) {
      clearTimeout(blinkTimer);
      blinkTimer = null;
    }
    let visible = true;
    const tick = () => {
      if (!cursorEl) return;
      cursorEl.style.visibility = visible ? "visible" : "hidden";
      visible = !visible;
      blinkTimer = setTimeout(tick, 500);
    };
    tick();
  }

  /** スクロール調整 */
  function adjustScroll(position) {
    if (!content || !cursorEl) return;

    const rect = cursorEl.getBoundingClientRect();

    // 保存/復元（none, inner）
    if (position !== "right" && position !== "center" && position !== "left") {
      // 保存
      let ticking = false;
      content.addEventListener("scroll", () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            localStorage.setItem(
              "vertical-preview.scrollLeft",
              content.scrollLeft
            );
            ticking = false;
          });
          ticking = true;
        }
      });

      // 復元
      const prev = localStorage.getItem("vertical-preview.scrollLeft");
      if (prev !== null) {
        content.scrollLeft = +prev;
      }
    }

    // カーソルへ寄せる
    if (position === "right") {
      const left = content.scrollLeft - -rect.left - content.clientWidth;
      content.scrollLeft = left;
    } else if (position === "center") {
      const left =
        content.scrollLeft -
        -rect.left -
        rect.width -
        content.clientWidth +
        window.innerWidth / 2;
      content.scrollLeft = left;
    } else if (position === "left") {
      const left =
        content.scrollLeft -
        -rect.left -
        rect.width * 3 -
        content.clientWidth +
        window.innerWidth;
      content.scrollLeft = left;
    } else if (position === "none") {
      // 復元済み
    } else {
      // inner：可視範囲からはみ出すなら追従
      let r = cursorEl.getBoundingClientRect();
      if (r.left < r.width / 2) {
        content.scrollLeft -= r.width - r.left;
      }
      if (r.left > content.clientWidth) {
        content.scrollLeft += r.left - content.clientWidth;
      }
    }
  }

  /** HTML エスケープ（最低限） */
  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
})();
