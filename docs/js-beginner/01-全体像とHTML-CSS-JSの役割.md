# 第1章 全体像 ― HTML・CSS・JavaScript の役割分担

## この章のゴール

- Webページが3つの言語でできていることと、それぞれの担当範囲を説明できる
- `index.html` を読み、画面の部品と `id` の対応が追える
- `<script>` タグの読み込み順が意味を持つ理由が分かる

---

## 1-1. 3つの言語の分担

Webページは、役割の違う3つの言語でできています。家に例えると分かりやすいです。

| 言語 | 役割 | 家に例えると | このアプリでのファイル |
| --- | --- | --- | --- |
| HTML | **構造**。どんな部品がどこにあるか | 間取り・柱・ドア | `index.html` |
| CSS | **見た目**。色・大きさ・配置 | 壁紙・照明・家具の配置 | `style.css` |
| JavaScript | **動き**。押したらどうなるか | 電気の配線・スイッチ | `app.js`, `xlsx.js` |

重要なのは **「HTML だけでもページは表示される」** ということです。
CSS を消せば見た目が崩れますが情報は読めますし、JavaScript を消せばボタンは反応しませんが画面は出ます。
この **役割の分離** が、Web の基本的な設計思想です。

### 実験

ブラウザでアプリを開き、開発者ツールの Console で次を実行してください。

```js
document.querySelector('link[rel="stylesheet"]').remove();
```

CSS だけが外れ、骨組みの HTML が裸で表示されます。
「HTML は構造、CSS は見た目」が実感できるはずです。リロードすれば元に戻ります。

---

## 1-2. `index.html` の全体構造

`index.html` を開いてください。大きく次のような入れ子になっています。

```
<html>
├── <head>            … ページの設定 (文字コード・タイトル・CSS の読み込み)
└── <body>            … 実際に画面に出るもの
    ├── <header>      … タイトルと「今日: 未記録」「連続 3 日」の表示
    ├── <div id="app-toast">  … 保存成功などを一瞬出す通知エリア
    ├── <main>
    │   ├── <section> … 【左】入力フォーム
    │   └── <section> … 【右】記録一覧・グラフ・書き出しボタン
    ├── <script src="xlsx.js">
    └── <script src="app.js">
```

画面を見ながら、どの `<section>` が画面のどの部分かを対応づけてください。
「コードのこの部分が、画面のここ」という対応が頭に入ると、コードを読む速度が一気に上がります。

---

## 1-3. `id` は JavaScript から掴むための取っ手

HTML の要素についている `id="..."` は、**JavaScript から「この部品」と名指しするための名前**です。

```html
<!-- index.html より -->
<input type="date" id="date" name="date" required>
<select id="condition" name="condition" required></select>
<button type="submit" class="btn btn-primary" id="save-btn">保存する</button>
```

これに対して JavaScript 側では、こう書かれています。

```js
// app.js より
const $ = (id) => document.getElementById(id);
const dateInput = $("date");
const saveBtn = $("save-btn");
```

`document.getElementById("date")` は、
**「この HTML の中から `id` が `date` の要素を1つ探してきて」** という命令です。
探してきた結果を `dateInput` という変数に入れておけば、あとから何度でも使えます。

> **ルール**: `id` はページ内で重複させてはいけません。「取っ手」なので、同じ名前が2つあったら
> どちらを掴めばよいか分からなくなります。複数の要素をまとめて指定したいときは `class` を使います。

### 主な id の一覧

このアプリで登場する `id` を整理しておきます。以降の章で何度も出てきます。

| id | 部品 | 役割 |
| --- | --- | --- |
| `entry-form` | `<form>` | 入力フォーム全体 |
| `date` | 日付入力 | 記録する日 |
| `condition` / `mental` / `appetite` / `motivation` / `sleep-quality` | プルダウン | 5段階の評価 |
| `sleep-hours` | 数値入力 | 睡眠時間 |
| `memo` | テキストエリア | 任意のメモ |
| `save-btn` | ボタン | 保存 (既存データがあれば「上書き保存」に変わる) |
| `entries-body` | `<tbody>` | 記録一覧の中身。JavaScript が行を作って入れる |
| `trends-chart` | `<svg>` | 折れ線グラフ。JavaScript が線を描く |
| `app-toast` | `<div>` | 「保存しました」の通知 |
| `export-btn` | ボタン | Excel 書き出し |

---

## 1-4. 「空っぽの箱」を HTML に用意しておく

ここが初学者にとって一番の発見かもしれません。もう一度 `index.html` を見てください。

```html
<select id="condition" name="condition" required></select>
```

`<select>` の中身が **空っぽ** です。「とても良い」「良い」…という選択肢がどこにもありません。
`<tbody id="entries-body"></tbody>` も、`<svg id="trends-chart"></svg>` も同じく空っぽです。

**中身は JavaScript が実行時に作って入れています。**

```js
// app.js より (抜粋・簡略化)
function populateSelects() {
  for (const field of Object.keys(OPTIONS)) {
    const select = $(SELECT_IDS[field]);
    for (const opt of OPTIONS[field]) {
      const o = document.createElement("option");   // <option> を新しく作る
      o.value = String(opt.value);                  // value="5"
      o.textContent = opt.label;                    // 表示テキスト「とても良い」
      select.appendChild(o);                        // <select> の中に入れる
    }
  }
}
```

なぜこうするのでしょうか。**選択肢が5つのプルダウンが5個あるので、HTML に直接書くと25行の `<option>` が並びます。**
しかも「普通」を「ふつう」に変えたくなったら、5か所を直すことになります。

JavaScript でデータ (`OPTIONS`) を1か所にまとめておけば、**直す場所は常に1か所** です。
これが「データとして持つ」という発想で、プログラミングの最も基本的な武器のひとつです。

この `OPTIONS` の中身は第3章で詳しく見ます。

---

## 1-5. `<script>` の位置と順番には意味がある

`index.html` の一番下を見てください。

```html
  <script src="xlsx.js"></script>
  <script src="app.js"></script>
</body>
```

ここには2つのポイントがあります。

### (1) なぜ `</body>` の直前なのか

HTML はブラウザが **上から順に** 読みます。もし `<head>` の中に `<script src="app.js">` を書くと、
`app.js` が実行される時点ではまだ `<form>` も `<select>` も存在しません。
すると `document.getElementById("date")` は **何も見つけられず `null` を返します**。

```js
const dateInput = document.getElementById("date"); // null になってしまう
dateInput.value = "2026-09-16";
// → Uncaught TypeError: Cannot read properties of null (reading 'value')
```

第0章で見たあのエラーの正体です。
`</body>` の直前に置けば、その時点で HTML はすべて読み込み済みなので、安全に要素を掴めます。

### (2) なぜ `xlsx.js` が先なのか

`app.js` の中に、こんな行があります。

```js
const blob = XlsxWriter.build({ sheetName: "体調記録", rows, colWidths: [...] });
```

`XlsxWriter` は `xlsx.js` が用意しているものです。
`xlsx.js` が先に読み込まれていなければ、`XlsxWriter` は存在しません。
**「使われる側を先に、使う側を後に」** 読み込む、という順序です。

> **補足**: 実際には `XlsxWriter.build` が呼ばれるのはユーザーがボタンを押した後なので、
> この例では順序を逆にしても偶然動いてしまいます。それでも依存関係どおりに並べるのが正しい書き方です。

---

## 1-6. ファイル4つの関係を図にする

```
        index.html  ← ブラウザが最初に読む。構造を定義し、他の3つを読み込む
            │
   ┌────────┼─────────────┐
   │        │             │
style.css  xlsx.js      app.js
 見た目     .xlsx を作る   アプリの本体
            ▲             │
            └─────────────┘
              app.js が XlsxWriter を呼ぶ
                          │
                          ▼
                   localStorage (ブラウザの保存領域)
```

`app.js` が全体の司令塔です。この教材の大半は `app.js` を読むことに使われます。
ファイルサイズを見ると `app.js` が約 25KB と圧倒的に大きいのも、そのためです。

---

## やってみよう

1. `index.html` の `<title>体調記録</title>` を `<title>わたしの体調ノート</title>` に変えて保存し、
   ブラウザのタブの表示が変わることを確認してください。
2. `style.css` の1行目付近にある `--accent: #2f8f6b;` を `--accent: #c0392b;` に変えて保存し、
   リロードしてください。何色が変わりましたか？ これは CSS の「カスタムプロパティ (変数)」という仕組みです。
3. `index.html` の `<script src="app.js"></script>` の行を `<head>` の中に移動して保存し、リロードしてください。
   Console にどんなエラーが出ますか？ 確認したら元に戻してください。
4. 開発者ツールの Elements タブを開き、`<select id="condition">` の左の三角を展開してください。
   HTML ファイルには書かれていない `<option>` が並んでいるはずです。なぜでしょうか。

---

## まとめ

- HTML = 構造、CSS = 見た目、JavaScript = 動き
- `id` は JavaScript が要素を掴むための取っ手。ページ内で重複させない
- 中身が空の HTML 要素に、JavaScript が実行時に中身を作って入れている
- `<script>` は `</body>` の直前に、依存関係の順に並べる

次章からいよいよ `app.js` の中身に入ります。まずは「値を入れる箱」である変数からです。
