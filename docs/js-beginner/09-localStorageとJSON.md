# 第9章 localStorage と JSON ― データを保存する

## この章のゴール

- `localStorage` の使い方と制限が分かる
- `JSON.stringify` / `JSON.parse` の役割が説明できる
- 保存失敗に備えた「巻き戻し」の実装が読める
- 読み込んだデータを検証してから使う理由が分かる

---

## 9-1. リロードしても消えないのはなぜか

普通の変数は、ページをリロードすると消えます。

```js
let entries = {};
entries["2026-09-16"] = { condition: 5 };
// リロード → entries は {} に戻る
```

このアプリはリロードしてもデータが残ります。その正体が **`localStorage`** です。

```js
localStorage.setItem("キー", "値");   // 保存
localStorage.getItem("キー");         // 読み出し (無ければ null)
localStorage.removeItem("キー");      // 削除
localStorage.clear();                 // 全削除
```

ブラウザが用意している、**ドメインごとの小さな保存領域** です。
ブラウザを閉じても、パソコンを再起動しても残ります。

### 目で確認する

1. アプリのページを開く
2. 開発者ツール → **Application** タブ (Firefox は「ストレージ」)
3. 左メニューの **Local Storage** を展開
4. `taichou-kiroku:v1` というキーが見つかる

値をクリックすると、保存されている長い文字列が読めます。これがあなたの記録です。

---

## 9-2. 大事な制限

`localStorage` には知っておくべき制限があります。

| 制限 | 内容 |
| --- | --- |
| **文字列しか保存できない** | オブジェクトや数値は、文字列に変換しないと保存できない |
| **容量は約5MB** | 超えると保存に失敗する |
| **ドメインごと** | 別のサイトからは読めない (安全) が、別の端末とも共有されない |
| **同期的に動く** | 巨大なデータを扱うと画面が固まる |
| **使えないことがある** | プライベートモードや設定によっては保存できない |

README にもこう書かれています。

> ブラウザの `localStorage` に保存されます。別のブラウザ・別の端末には共有されないので、
> バックアップしたい場合は Excel で書き出してください。

**Excel 書き出し機能があるのは、この制限への現実的な答え** というわけです。
機能はいつも「できないこと」とセットで設計されます。

### キーに `:v1` が付いている理由

```js
const STORAGE_KEY = "taichou-kiroku:v1";
```

将来データの形を変えたくなったとき、`:v2` という別のキーに保存すれば、
古いデータと衝突しません。移行処理も書きやすくなります。
**最初からバージョンを入れておく** のは、経験に基づいた工夫です。

---

## 9-3. JSON ― オブジェクトと文字列を行き来する

`localStorage` は文字列しか保存できません。でも保存したいのはオブジェクトです。
橋渡しをするのが **JSON (JavaScript Object Notation)** です。

```js
JSON.stringify(オブジェクト)   // オブジェクト → 文字列
JSON.parse(文字列)             // 文字列 → オブジェクト
```

試してみましょう。

```js
const entry = { date: "2026-09-16", condition: 5, memo: "よく眠れた" };

JSON.stringify(entry)
// '{"date":"2026-09-16","condition":5,"memo":"よく眠れた"}'

JSON.parse('{"date":"2026-09-16","condition":5}')
// { date: "2026-09-16", condition: 5 }
```

`app.js` では、保存と読み出しのそれぞれで使われています。

```js
function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));   // 保存
}

function loadEntriesRaw() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = JSON.parse(raw);                                // 読み出し
  // ...
}
```

### JSON にできないもの

JSON はシンプルな形式なので、扱える型が限られています。

| JavaScript の値 | JSON にすると |
| --- | --- |
| 数値・文字列・真偽値・`null` | そのまま |
| 配列・オブジェクト | そのまま |
| `undefined` | **キーごと消える** |
| 関数 | **キーごと消える** |
| `Date` オブジェクト | 文字列になる (戻すと文字列のまま) |

```js
JSON.stringify({ a: 1, b: undefined, c: () => {} })
// '{"a":1}'   ← b と c は消えた
```

`Date` の扱いに注意してください。

```js
const d = new Date();
const s = JSON.stringify({ t: d });      // '{"t":"2026-09-16T10:30:00.000Z"}'
const back = JSON.parse(s);
typeof back.t                             // "string"  ← Date には戻らない！
```

だから `app.js` は、最初から **文字列として** 持っています。

```js
updatedAt: new Date().toISOString(),   // "2026-09-16T10:30:00.000Z"
```

`toISOString()` は世界標準の日時文字列を返します。
**保存に向いた形で持っておく** ことで、復元時の変換を不要にしているわけです。

日付も同じ考え方です。`date: "2026-09-16"` という文字列で持っているので、
JSON を通しても何も失われません (第2章参照)。

---

## 9-4. 保存 ― 失敗に備える

保存の処理は3層になっています。

```js
// 第1層: 実際に保存する (失敗するとエラーが飛ぶ)
function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// 第2層: エラーを捕まえて true / false にする
function persistEntries() {
  try {
    saveEntries(entries);
    return true;
  } catch (e) {
    return false;
  }
}
```

なぜ `try...catch` が必要なのでしょう。`localStorage.setItem` は、次の場合にエラーを投げます。

- 容量 (約5MB) を超えた
- プライベートモードで保存が禁止されている
- ブラウザの設定でストレージが無効

エラーを放置すると、**そこで処理が止まり、画面が中途半端な状態で固まります**。
`try...catch` で捕まえて `false` を返せば、呼び出し側が対処できます。

### 第3層: 呼び出し側の巻き戻し

```js
const existed = Boolean(entries[entry.date]);
const prev = existed ? { ...entries[entry.date] } : null;   // ① バックアップ
entries[entry.date] = entry;                                 // ② メモリを更新
if (!persistEntries()) {                                     // ③ 保存を試す
  if (prev) entries[entry.date] = prev;                      // ④ 失敗したら戻す
  else delete entries[entry.date];
  showError("保存に失敗しました。ブラウザの保存領域が使えない可能性があります。");
  return;
}
renderList();                                                // ⑤ 成功したら描画
```

これは **トランザクション** の考え方です。

「メモリ上のデータ」と「localStorage のデータ」がズレると、
画面には保存されたように見えるのに、リロードすると消えている、という最悪の状態になります。

**保存に失敗したらメモリも元に戻す** ことで、常に両者が一致するようにしているのです。

同じパターンが削除と全削除にもあります。

```js
// 削除
const backup = entries[date];
delete entries[date];
if (!persistEntries()) {
  if (backup) entries[date] = backup;
  flashSaveError();
  return;
}

// 全削除
const backup = { ...entries };
entries = {};
if (!persistEntries()) {
  entries = backup;
  flashSaveError();
  return;
}
```

**データを変える処理には、必ず巻き戻しをセットで書く。** 一貫しています。

---

## 9-5. 読み込み ― 外から来たデータは信用しない

保存より読み込みのほうが、実は難しいところです。

```js
function loadEntriesRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};                      // ① 何も保存されていない
    const parsed = JSON.parse(raw);           // ② 壊れていたらここでエラー
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {                               // ③
    console.warn("保存データの読み込みに失敗しました", e);
    return {};
  }
}
```

3重に守られています。

1. `getItem` が `null` を返す (初回起動時) → `{}` を返す
2. `JSON.parse` が失敗する (データが壊れている) → `catch` へ
3. パース結果がオブジェクトでない (配列や数値だった) → `{}` を返す

`!Array.isArray(parsed)` に注目してください。`typeof [] === "object"` なので (第2章)、
配列を弾くには別途チェックが必要なのです。

### なぜそこまで疑うのか

`localStorage` の中身は、**誰でも書き換えられます**。

- 開発者ツールから手で編集できる
- 同じドメインの別のスクリプトが上書きするかもしれない
- 前のバージョンのアプリが違う形式で保存しているかもしれない
- ディスクの不調でデータが壊れることもある

**「外から来たデータは、形が正しい保証がない」** という前提に立つのが鉄則です。

### さらに1件ずつ検証する

パースに成功しても、まだ終わりではありません。

```js
function normalizeStore(parsed) {
  const out = {};
  const keys = Object.keys(parsed).filter((k) => DATE_RE.test(k)).sort();   // ① キーの形式
  for (const key of keys.slice(0, MAX_ENTRIES)) {                           // ② 件数の上限
    const entry = normalizeEntry(key, parsed[key]);                         // ③ 1件ずつ検証
    if (entry) out[key] = entry;                                            // ④ 正しいものだけ採用
  }
  return out;
}
```

`normalizeEntry` は第4章で見た関数です。1件ずつ「すべての項目が正しいか」を確かめ、
1つでもおかしければ `null` を返します。

結果として、**壊れた記録は静かに捨てられ、正しい記録だけが残ります**。
アプリ全体がクラッシュすることはありません。

これを **防御的プログラミング (defensive programming)** と呼びます。

> **設計上の判断**: 壊れた記録を「捨てる」か「エラーを出して止まる」かは選択です。
> このアプリは「1件壊れたくらいで全部使えなくなるより、残りが使えるほうがマシ」と判断しています。
> 医療記録や会計データなら逆の判断もありえます。**正解は用途によって違います。**

### `slice` による件数の上限

```js
for (const key of keys.slice(0, MAX_ENTRIES)) {   // MAX_ENTRIES = 5000
```

もし何らかの理由で10万件のデータが入っていたら、全部処理すると画面が固まります。
5000件で打ち切ることで、**最悪のケースでも動き続ける** ようにしています。

5000件は「13年分の毎日の記録」なので、実用上まったく困りません。

---

## 9-6. 起動時の処理を読む

`app.js` の一番下、IIFE が閉じる直前を見てください。

```js
populateSelects();                       // ① プルダウンの選択肢を作る
listMonthFilter = currentYearMonth();    // ② 今月で絞り込む初期設定
dateInput.value = todayString();         // ③ 日付欄に今日を入れる
lastDateValue = dateInput.value;
try {
  if (localStorage.getItem(STORAGE_KEY) !== JSON.stringify(entries)) {
    persistEntries();                    // ④ 正規化で変わっていたら書き戻す
  }
} catch (_) {
  /* 読み取り不可環境では同期をスキップ */
}
renderList();                            // ⑤ 一覧とグラフを描く
if (entries[dateInput.value]) {          // ⑥ 今日の記録があれば読み込む
  fillForm(dateInput.value);
} else {
  syncEditState();
  setFormBaseline();
}
```

④ が面白いところです。

読み込み時の正規化 (`normalizeStore`) で壊れた記録を捨てた場合、
**メモリ上のデータと `localStorage` の中身がズレます**。
そこで「違っていたら書き戻す」ことで、次回以降はきれいなデータから始まります。

比較に `JSON.stringify(entries)` を使っているのは、
オブジェクト同士を直接比較できないからです (第3章・第7章)。

`catch (_)` の `_` は「使わない変数」を表す慣習的な名前です。
エラーの内容に用がないので、あえて `_` にして「無視している」と示しています。

---

## 9-7. localStorage 以外の選択肢

参考までに、ブラウザの保存手段を整理しておきます。

| 手段 | 容量 | 消えるタイミング | 用途 |
| --- | --- | --- | --- |
| `localStorage` | 約5MB | 明示的に消すまで残る | 設定、小さなデータ (**このアプリ**) |
| `sessionStorage` | 約5MB | タブを閉じると消える | 一時的な状態 |
| `IndexedDB` | 数百MB〜 | 明示的に消すまで | 大量データ、画像、オフラインアプリ |
| Cookie | 4KB | 有効期限まで | サーバーとの通信で使う情報 |

このアプリの規模 (数千件のテキストデータ) なら `localStorage` で十分です。
**いちばん簡単な手段で足りるなら、それを選ぶ。** 過剰な設計をしないことも技術です。

---

## やってみよう

1. Console で次を実行し、保存されているデータを整形して眺めてください。
   ```js
   const data = JSON.parse(localStorage.getItem("taichou-kiroku:v1"));
   console.log(JSON.stringify(data, null, 2));
   ```
   `JSON.stringify` の第3引数 `2` は「2スペースでインデントする」という意味です。
2. わざとデータを壊してみましょう。**先に Excel で書き出してバックアップを取ってから** 実行してください。
   ```js
   localStorage.setItem("taichou-kiroku:v1", "これはJSONではない");
   ```
   リロードするとどうなりますか？ アプリは動きますか？ Console に何か出ていますか？
3. 次は「形式は JSON だが、中身が不正」を試してください。
   ```js
   localStorage.setItem("taichou-kiroku:v1", JSON.stringify({
     "2026-09-16": { condition: 5, mental: 4, appetite: 3, motivation: 4, sleepHours: 7, sleepQuality: 4 },
     "2026-09-17": { condition: 99 },
     "こんにちは": { condition: 3 }
   }));
   ```
   リロード後、何件表示されますか？ どのコードがどれを弾きましたか？
4. `MAX_ENTRIES` を `2` に変えて保存し、3件以上データがある状態でリロードしてください。
   何件残りますか？ 確認したら `5000` に戻し、必要ならバックアップから復元してください。
5. `STORAGE_KEY` を `"taichou-kiroku:v2"` に変えてリロードしてください。
   データはどうなりますか？ 元に戻すとどうなりますか？ バージョン付きキーの意味を実感してください。

---

## まとめ

- `localStorage` は **文字列だけ・約5MB・ドメインごと** の保存領域
- オブジェクトは `JSON.stringify` で文字列に、`JSON.parse` でオブジェクトに戻す
- `Date` は JSON を通ると文字列になる。最初から文字列で持つのが安全
- 保存は失敗しうる。`try...catch` で捕まえ、**失敗したらメモリも巻き戻す**
- **読み込んだデータは信用しない**。パース・形式・1件ずつの3段階で検証する
- キーにバージョン (`:v1`) を入れておくと、将来の変更が楽になる

次章は、配列を自在に扱うためのメソッドです。
