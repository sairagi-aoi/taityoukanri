# 第6章 DOM操作 ― JavaScript から画面を読み書きする

## この章のゴール

- DOM が「HTML を JavaScript から触れるようにしたもの」だと理解する
- 要素の取得・作成・追加・削除ができる
- `textContent` と `innerHTML` の違いと、安全性の理由が説明できる
- クラスの付け外しで見た目を切り替える方法が分かる

---

## 6-1. DOM とは

ブラウザは HTML を読むと、それを **オブジェクトの木構造** に変換してメモリに置きます。
これを **DOM (Document Object Model)** と呼びます。

```
document
└── html
    ├── head
    └── body
        ├── header
        ├── main
        │   ├── section (フォーム)
        │   │   └── form#entry-form
        │   │       ├── input#date
        │   │       └── select#condition
        │   └── section (一覧)
        └── script
```

重要なのは、**JavaScript が触るのは HTML ファイルではなく、この DOM だ** ということです。
DOM を書き換えると画面が変わりますが、**HTML ファイルは1文字も変わりません**。
だからリロードすると元に戻ります。

開発者ツールの Elements タブに表示されているのは、HTML ファイルの中身ではなく、
**今この瞬間の DOM** です。第1章で `<select>` の中に `<option>` が並んでいたのは、そのためです。

---

## 6-2. 要素を取得する

### `getElementById`

`id` で1つだけ探します。最速で、最も確実な方法です。

```js
const $ = (id) => document.getElementById(id);
const dateInput = $("date");
const tbody = $("entries-body");
```

見つからなければ `null` が返ります。エラーにはなりません。
だから `null` に対してプロパティを読もうとして
`Cannot read properties of null` が起きるのです (第0章)。

### `querySelector` / `querySelectorAll`

CSS のセレクタで探します。柔軟ですが、少し遅いです。

```js
document.querySelector('link[rel="stylesheet"]')    // 最初に見つかった1つ
form.querySelectorAll(".field")                     // 該当するすべて
tbody.querySelectorAll("tr")                        // tbody の中の tr 全部
form.querySelector(".field.invalid select, .field.invalid input, .field.invalid textarea")
```

最後の例は「`invalid` クラスがついた `.field` の中の `select` か `input` か `textarea`」を探しています。
バリデーションエラーのとき、**最初のエラー箇所にフォーカスを移す** ために使われています。

```js
const first = form.querySelector(".field.invalid select, .field.invalid input, .field.invalid textarea");
if (first) first.focus();
```

`if (first)` で `null` チェックをしているのがポイントです。
見つからないかもしれない取得の後には、必ずこれを書く習慣をつけてください。

### `closest` ― 祖先をさかのぼって探す

自分自身から上に向かって、条件に合う要素を探します。

```js
function setFieldInvalid(el, invalid) {
  const field = el.closest(".field");   // この要素を含む .field を探す
  if (!field) return;
  field.classList.toggle("invalid", invalid);
  // ...
}
```

`<select>` から見て、それを包んでいる `<div class="field">` を取っています。
HTML の構造はこうなっています。

```html
<div class="field">
  <label for="condition">体調</label>
  <select id="condition">...</select>
</div>
```

`<select>` だけを赤くするのではなく、ラベルを含む枠全体にマークを付けたい。
そのために `closest` で親をさかのぼっているわけです。

---

## 6-3. 要素の中身を読む・書く

### `textContent` ― テキストを読み書きする (推奨)

```js
saveBtn.textContent = "上書き保存する";
emptyMsg.textContent = "まだ記録がありません。...";
streakEl.textContent = `連続 ${streak} 日`;
```

代入するだけで画面が変わります。**`textContent` はすべてを「ただの文字」として扱います。**

### `value` ― 入力欄の値を読み書きする

`<input>` `<select>` `<textarea>` の中身は `textContent` ではなく `value` です。

```js
dateInput.value              // "2026-09-16"   読む
dateInput.value = todayString();   // 書く
sleepHoursInput.value.trim()       // 前後の空白を除く
select.value = String(v);
memoInput.value = e.memo || "";
```

**繰り返しますが、`value` は必ず文字列です** (第2章)。

### `innerHTML` ― HTML として解釈する (要注意)

```js
select.innerHTML = "";   // 中身を全部消す
```

`app.js` で `innerHTML` が使われているのは、この **中身を空にする** 1か所だけです。
これは意図的な選択です。

### なぜ `innerHTML` を避けるのか ― XSS

`innerHTML` に代入した文字列は **HTML として解釈されます**。

```js
el.innerHTML = "<b>太字</b>";       // 本当に太字になる
el.textContent = "<b>太字</b>";     // "<b>太字</b>" という文字がそのまま表示される
```

便利そうですが、**ユーザーが入力した文字列を `innerHTML` に入れると危険** です。
このアプリにはメモ欄があります。もし誰かがメモにこう書いたら:

```
<img src=x onerror="alert('乗っ取り')">
```

`innerHTML` で表示すると、この JavaScript が **実行されてしまいます**。
これを **XSS (クロスサイトスクリプティング)** と呼び、Web の代表的な脆弱性です。

`app.js` はメモの表示にこう書いています。

```js
const memoSpan = document.createElement("span");
memoSpan.className = "memo-text";
memoSpan.textContent = e.memo;   // ← textContent なので、何を書かれても「ただの文字」
memoTd.appendChild(memoSpan);
```

`textContent` なら、どんな文字列でも安全にただのテキストとして表示されます。

> **原則**: **ユーザー由来の文字列は `textContent` で表示する。**
> `innerHTML` を使うのは、自分で書いた固定の HTML だけにする。
> このアプリはそれを徹底しているので、メモに何を書かれても安全です。

試してみたい人は、メモ欄に `<b>test</b>` と入れて保存してみてください。
太字にならず、そのまま表示されるはずです。

---

## 6-4. 要素を作る・入れる

画面に新しい部品を追加する手順は3ステップです。

```js
const o = document.createElement("option");   // ① 作る
o.value = String(opt.value);                   // ② 設定する
o.textContent = opt.label;
select.appendChild(o);                         // ③ 入れる
```

**③の `appendChild` をするまで、その要素は画面に出ません。** 作っただけでは宙に浮いた状態です。

一覧の1行を作る処理は、この繰り返しでできています。

```js
const tr = document.createElement("tr");
tr.dataset.date = date;

const tdDate = document.createElement("td");
const strong = document.createElement("strong");
strong.textContent = formatDateJa(date);       // "9/16 (水)"
tdDate.appendChild(strong);
tdDate.appendChild(document.createElement("br"));
const subDate = document.createElement("span");
subDate.className = "sub";
subDate.textContent = date;                     // "2026-09-16"
tdDate.appendChild(subDate);
tr.appendChild(tdDate);
```

できあがる HTML は次の通りです。

```html
<tr data-date="2026-09-16">
  <td><strong>9/16 (水)</strong><br><span class="sub">2026-09-16</span></td>
  ...
</tr>
```

`innerHTML` で文字列を組み立てれば数行で書けますが、
**メモや日付がユーザー由来である以上、安全側に倒している** わけです。

### まとめて追加する

```js
tdOps.append(editBtn, delBtn);   // 複数をまとめて追加
```

`append` は `appendChild` の新しい版で、複数の要素や文字列をまとめて追加できます。

### 中身を全部消す

```js
tbody.replaceChildren();   // 子要素を全部削除
```

一覧を描き直すとき、まず古い行を全部消してから新しく作り直しています。

```js
function renderList() {
  const dates = sortedDatesForList();
  tbody.replaceChildren();      // ← まず空に
  // ... 全行を作り直す
}
```

これは **「差分更新」ではなく「全部作り直す」** という方針です。
差分更新のほうが速いですが、コードが複雑になりバグの温床になります。
このアプリは数千件が上限なので、全部作り直しても一瞬です。**シンプルさを優先した判断** です。

> `app.js` のグラフ描画には、もう1つの消し方が出てきます。
> ```js
> while (trendsSvg.firstChild) trendsSvg.removeChild(trendsSvg.firstChild);
> ```
> 「最初の子がある限り、それを取り除く」を繰り返す古典的な書き方です。同じ結果になります。

---

## 6-5. 属性とプロパティ

### `hidden` ― 表示・非表示

```js
emptyMsg.hidden = dates.length > 0;   // 記録があれば「記録がありません」を隠す
tableEl.hidden = dates.length === 0;  // 記録がなければ表を隠す
editBadge.hidden = !exists;
trendsWrap.hidden = true;
```

`hidden = true` にすると、その要素は画面から消えます (領域も取りません)。
`true` / `false` を代入するだけなので、条件式をそのまま代入できるのがきれいです。

```js
emptyMsg.hidden = dates.length > 0;
// ↑ if で書くとこうなる
// if (dates.length > 0) { emptyMsg.hidden = true; } else { emptyMsg.hidden = false; }
```

### `setAttribute` ― 属性を設定する

```js
editBtn.setAttribute("aria-label", `${formatDateJa(date)} の記録を編集`);
control.setAttribute("aria-invalid", invalid ? "true" : "false");
memoTd.colSpan = 7;
```

`aria-*` は **スクリーンリーダー (音声読み上げ) 向けの情報** です。
一覧に「編集」ボタンが20個並んでいると、音声では「編集、編集、編集…」としか読まれません。
`aria-label` を付けておくと「9月16日水曜日の記録を編集」と読まれます。

`app.js` はアクセシビリティにきちんと配慮しています。`index.html` にも配慮が見られます。

```html
<div id="app-toast" class="app-toast" role="status" aria-live="polite" hidden></div>
<p id="form-error" class="form-error" role="alert" hidden></p>
```

`aria-live="polite"` が付いていると、この要素の中身が変わったときに
スクリーンリーダーが自動で読み上げてくれます。「保存しました」という通知が、
目で見えない人にも届くわけです。

### `dataset` ― 自分で決めたデータを要素に持たせる

HTML の `data-` で始まる属性は、JavaScript から `dataset` で読み書きできます。

```js
tr.dataset.date = date;              // data-date="2026-09-16"
editBtn.dataset.action = "edit";     // data-action="edit"
editBtn.dataset.date = date;
```

読むときはこうです。

```js
const btn = ev.target.closest("button[data-action]");
const date = btn.dataset.date;       // "2026-09-16"
if (btn.dataset.action === "edit") { ... }
```

**「どのボタンが、どの日付の、どの操作なのか」を要素自身に持たせている** のがポイントです。
これによって、クリック処理が第7章で見るようなシンプルな形にまとまります。

---

## 6-6. クラスの付け外しで見た目を変える

**見た目の変更は、JavaScript で直接スタイルをいじるのではなく、クラスを付け外しして CSS に任せます。**

```js
// これはやらない
select.style.borderColor = "red";

// これをやる
field.classList.toggle("invalid", invalid);
```

`classList` の主なメソッドです。

```js
el.classList.add("invalid");        // 付ける
el.classList.remove("invalid");     // 外す
el.classList.toggle("invalid");     // 付いてたら外す、なければ付ける
el.classList.toggle("invalid", true);  // 第2引数が true なら付ける、false なら外す ← 便利
el.classList.contains("invalid");   // 付いているか
```

`app.js` の実例です。

```js
function updateSelectStyle(select) {
  select.classList.toggle("is-empty", select.value === "");
}

todayStatusEl.classList.toggle("is-done", hasToday);
todayStatusEl.classList.toggle("is-pending", !hasToday);

tr.classList.toggle("is-editing", tr.dataset.date === dateInput.value);
```

対応する CSS は `style.css` にあります。

```css
.field.invalid select,
.field.invalid input,
.field.invalid textarea {
  border-color: var(--danger);
}
```

この分担には明確な利点があります。

- **見た目を変えたくなったら CSS だけ直せばよい** (JavaScript を触らない)
- ダークモード対応 (`@media (prefers-color-scheme: dark)`) が CSS 側で完結する
- JavaScript は「今どういう状態か」を伝えるだけ。何色になるかは知らなくてよい

---

## 6-7. `renderList` を通しで読む

ここまでの知識で、一覧描画の全体像が読めるようになりました。構造を追ってみてください。

```js
function renderList() {
  const dates = sortedDatesForList();     // ① 表示する日付のリストを決める
  tbody.replaceChildren();                 // ② 表の中身を全部消す
  const total = sortedDates().length;
  countEl.textContent = ...;               // ③ 件数の表示を更新
  emptyMsg.hidden = dates.length > 0;      // ④ 空メッセージの出し分け
  tableEl.hidden = dates.length === 0;

  for (const date of dates) {              // ⑤ 1日分ずつ行を作る
    const e = entries[date];
    if (!e) continue;
    const tr = document.createElement("tr");
    // ... 日付・体調・メンタル・食欲・意欲・睡眠・操作ボタンの td を作る
    tbody.appendChild(tr);
    if (e.memo) {                          // ⑥ メモがあれば追加の行を足す
      // ...
    }
  }
  syncEditState();                         // ⑦ 保存ボタンの文言などを更新
  renderTrendsChart();                     // ⑧ グラフを描き直す
  populateMonthFilter();                   // ⑨ 月フィルタの選択肢を作り直す
}
```

**データが変わったら `renderList()` を呼ぶ。すると画面全体がデータに合わせて作り直される。**
このアプリはこの1つのルールで動いています。

実際、`renderList()` が呼ばれているのは次の場所だけです。

- 保存したとき
- 削除したとき
- 全削除したとき
- 月フィルタを変えたとき
- 起動時

「データを変える処理」と「画面を描く処理」がきれいに分かれているので、
**画面の更新漏れというバグが起きにくい** 設計になっています。

---

## やってみよう

1. アプリのページを開き、Console で次を1行ずつ実行してください。画面が変わります。
   ```js
   document.getElementById("save-btn").textContent = "ぽちっとな";
   document.getElementById("entries-table").hidden = true;
   document.querySelector("h1").style.color = "hotpink";
   ```
   リロードすると元に戻ることを確認してください。**HTML ファイルは変わっていない** からです。
2. `textContent` と `innerHTML` の違いを体験してください。
   ```js
   const h = document.querySelector("h1");
   h.textContent = "<em>体調</em>記録";   // どう表示される？
   h.innerHTML = "<em>体調</em>記録";     // どう表示される？
   ```
3. メモ欄に `<img src=x onerror="alert(1)">` と入力して保存してみてください。
   アラートは出ますか？ 出ないなら、なぜでしょうか。
4. `style.css` で `.field.invalid` のスタイルを探し、色を変えてみてください。
   その後わざとバリデーションエラーを起こして (何も選ばずに保存)、変更が反映されることを確認してください。
   **JavaScript は1行も触っていない** のに見た目が変わることが、クラス方式の利点です。
5. 開発者ツールの Elements タブで `<tbody id="entries-body">` を展開し、
   `data-date` 属性が各行に付いていることを確認してください。

---

## まとめ

- DOM は HTML をオブジェクトの木にしたもの。JavaScript が書き換えるのは DOM であって HTML ファイルではない
- 取得は `getElementById` / `querySelector` / `closest`。見つからなければ `null` なので必ずチェック
- **ユーザー由来の文字列は `textContent` で表示する** (XSS を防ぐ)。`innerHTML` は原則使わない
- 要素は「作る → 設定する → `appendChild` で入れる」の3ステップ
- `dataset` で要素に自前のデータを持たせられる
- **見た目の切り替えは `classList` でクラスを付け外しし、実際の見た目は CSS に任せる**
- 「データを変えたら `renderList()` を呼ぶ」という1本のルールで画面を同期させている

次章は、ユーザーの操作に反応するイベント処理です。
