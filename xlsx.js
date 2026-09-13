/*
 * 外部ライブラリなしで .xlsx を生成する最小ライブラリ。
 * .xlsx = ZIP (無圧縮 stored) + Office Open XML。
 *
 * 使い方:
 *   const blob = XlsxWriter.build({ sheetName: "体調記録", rows: [["日付", "体調"], ["2026-09-13", "良い"]] });
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.XlsxWriter = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- CRC32 ----------
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---------- 文字列 <-> バイト列 ----------
  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  function u16(v) {
    return [v & 0xff, (v >>> 8) & 0xff];
  }
  function u32(v) {
    return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  }

  // DOS 形式の日時 (ZIP ヘッダ用)
  function dosDateTime(d) {
    const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
    const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
    return { time, date };
  }

  // ---------- ZIP (stored, 無圧縮) ----------
  function buildZip(files) {
    const now = dosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = utf8(f.name);
      const data = typeof f.data === "string" ? utf8(f.data) : f.data;
      const crc = crc32(data);

      const local = new Uint8Array([
        ...u32(0x04034b50), // local file header signature
        ...u16(20), // version needed
        ...u16(0x0800), // flags: UTF-8 名
        ...u16(0), // method: stored
        ...u16(now.time),
        ...u16(now.date),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(nameBytes.length),
        ...u16(0), // extra length
      ]);
      localParts.push(local, nameBytes, data);

      const central = new Uint8Array([
        ...u32(0x02014b50), // central dir signature
        ...u16(20), // version made by
        ...u16(20), // version needed
        ...u16(0x0800),
        ...u16(0),
        ...u16(now.time),
        ...u16(now.date),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(nameBytes.length),
        ...u16(0), // extra
        ...u16(0), // comment
        ...u16(0), // disk number
        ...u16(0), // internal attrs
        ...u32(0), // external attrs
        ...u32(offset),
      ]);
      centralParts.push(central, nameBytes);

      offset += local.length + nameBytes.length + data.length;
    }

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(files.length),
      ...u16(files.length),
      ...u32(centralSize),
      ...u32(offset),
      ...u16(0),
    ]);

    const total = offset + centralSize + eocd.length;
    const out = new Uint8Array(total);
    let p = 0;
    for (const part of [...localParts, ...centralParts, eocd]) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }

  // ---------- XML ----------
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colName(idx) {
    // 0 -> A, 25 -> Z, 26 -> AA
    let s = "";
    idx += 1;
    while (idx > 0) {
      const m = (idx - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      idx = Math.floor((idx - 1) / 26);
    }
    return s;
  }

  // セル値を <c> 要素に変換。数値は数値セル、それ以外はインライン文字列。
  function cellXml(ref, value, styleId) {
    const s = styleId ? ` s="${styleId}"` : "";
    if (value === null || value === undefined || value === "") {
      return styleId ? `<c r="${ref}"${s}/>` : "";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}"${s}><v>${value}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }

  function sheetXml(rows, colWidths) {
    const rowXml = rows
      .map((row, r) => {
        const cells = row
          .map((v, c) => cellXml(`${colName(c)}${r + 1}`, v, r === 0 ? 1 : 0))
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");

    const cols = colWidths && colWidths.length
      ? `<cols>${colWidths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";

    const lastCol = colName(Math.max(0, ...rows.map((r) => r.length)) - 1 || 0);
    const dim = `A1:${lastCol}${Math.max(1, rows.length)}`;

    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="${dim}"/>` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      cols +
      `<sheetData>${rowXml}</sheetData>` +
      `</worksheet>`
    );
  }

  const CONTENT_TYPES =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const ROOT_RELS =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const WORKBOOK_RELS =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  // スタイル 0: 標準 / スタイル 1: 見出し (太字・薄い塗り)
  const STYLES =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0EC"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  function workbookXml(sheetName) {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`
    );
  }

  /**
   * @param {{sheetName?: string, rows: any[][], colWidths?: number[]}} opts
   * @returns {Uint8Array} xlsx バイト列
   */
  function buildBytes(opts) {
    const sheetName = (opts.sheetName || "Sheet1").slice(0, 31);
    const files = [
      { name: "[Content_Types].xml", data: CONTENT_TYPES },
      { name: "_rels/.rels", data: ROOT_RELS },
      { name: "xl/workbook.xml", data: workbookXml(sheetName) },
      { name: "xl/_rels/workbook.xml.rels", data: WORKBOOK_RELS },
      { name: "xl/styles.xml", data: STYLES },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml(opts.rows, opts.colWidths) },
    ];
    return buildZip(files);
  }

  function build(opts) {
    return new Blob([buildBytes(opts)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  return { build, buildBytes, crc32, colName };
});
