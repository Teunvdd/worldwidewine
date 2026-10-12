/* Excel-bestanden (.xlsx) schrijven en lezen in de browser, zonder externe bibliotheek.
 * Een .xlsx is een zip met XML-bestanden. Schrijven: één werkblad, kopregel vet.
 * Lezen: het eerste werkblad als rijen met celwaarden (tekst of getal).
 *   A.xlsx.write(rows, { sheet, widths }) → Blob
 *   A.xlsx.read(file) → Promise<[[waarde, …], …]>
 */
(function () {
  var enc = new TextEncoder();

  // ---- zip (CRC-32 en opslag zonder compressie; Excel leest dat prima) ----
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xffffffff;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); // utf-8 namen
      head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
      head.setUint16(26, name.length, true);
      parts.push(new Uint8Array(head.buffer), name, data);
      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var size = central.reduce(function (t, p) { return t + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function unzip(buffer) {
    var u8 = new Uint8Array(buffer), dv = new DataView(buffer), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error("Dit is geen geldig Excel-bestand (.xlsx)."));
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), entries = {};
    var dec = new TextDecoder();
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var local = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      var start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      entries[name] = { method: method, data: u8.subarray(start, start + csize) };
      p += 46 + nlen + xlen + clen;
    }
    return entries;
  }

  function inflate(entry) {
    if (!entry) return Promise.resolve(null);
    if (entry.method === 0) return Promise.resolve(new TextDecoder().decode(entry.data));
    if (entry.method !== 8) return Promise.reject(new Error("Onbekende compressie in het Excel-bestand."));
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("Deze browser kan geen Excel-bestanden lezen. Gebruik een recente Chrome, Edge, Safari of Firefox."));
    var stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).text();
  }

  // ---- schrijven ----
  function xml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; })
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  }
  function colName(i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  function write(rows, opts) {
    opts = opts || {};
    var widths = opts.widths || [];
    var sheetRows = rows.map(function (row, r) {
      return "<row r='" + (r + 1) + "'>" + row.map(function (v, c) {
        if (v === null || v === undefined || v === "") return "";
        var ref = colName(c) + (r + 1), st = r === 0 ? " s='1'" : "";
        if (typeof v === "number" && isFinite(v)) return "<c r='" + ref + "'" + st + "><v>" + v + "</v></c>";
        return "<c r='" + ref + "' t='inlineStr'" + st + "><is><t xml:space='preserve'>" + xml(v) + "</t></is></c>";
      }).join("") + "</row>";
    }).join("");
    var cols = widths.length ? "<cols>" + widths.map(function (w, i) { return "<col min='" + (i + 1) + "' max='" + (i + 1) + "' width='" + w + "' customWidth='1'/>"; }).join("") + "</cols>" : "";
    var NS = "xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'";
    var R = "xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'";
    var head = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n";
    return zip([
      { name: "[Content_Types].xml", data: head + "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>" +
        "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/><Default Extension='xml' ContentType='application/xml'/>" +
        "<Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/>" +
        "<Override PartName='/xl/worksheets/sheet1.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'/>" +
        "<Override PartName='/xl/styles.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'/></Types>" },
      { name: "_rels/.rels", data: head + "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>" +
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='xl/workbook.xml'/></Relationships>" },
      { name: "xl/workbook.xml", data: head + "<workbook " + NS + " " + R + "><sheets><sheet name='" + xml((opts.sheet || "Blad1").slice(0, 31)) + "' sheetId='1' r:id='rId1'/></sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", data: head + "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>" +
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet' Target='worksheets/sheet1.xml'/>" +
        "<Relationship Id='rId2' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles' Target='styles.xml'/></Relationships>" },
      { name: "xl/styles.xml", data: head + "<styleSheet " + NS + "><fonts count='2'><font><sz val='11'/><name val='Calibri'/></font><font><b/><sz val='11'/><name val='Calibri'/></font></fonts>" +
        "<fills count='2'><fill><patternFill patternType='none'/></fill><fill><patternFill patternType='gray125'/></fill></fills>" +
        "<borders count='1'><border><left/><right/><top/><bottom/><diagonal/></border></borders>" +
        "<cellStyleXfs count='1'><xf numFmtId='0' fontId='0' fillId='0' borderId='0'/></cellStyleXfs>" +
        "<cellXfs count='2'><xf numFmtId='0' fontId='0' fillId='0' borderId='0' xfId='0'/><xf numFmtId='0' fontId='1' fillId='0' borderId='0' xfId='0' applyFont='1'/></cellXfs></styleSheet>" },
      { name: "xl/worksheets/sheet1.xml", data: head + "<worksheet " + NS + " " + R + ">" +
        "<sheetViews><sheetView workbookViewId='0'><pane ySplit='1' topLeftCell='A2' activePane='bottomLeft' state='frozen'/></sheetView></sheetViews>" +
        cols + "<sheetData>" + sheetRows + "</sheetData></worksheet>" }
    ]);
  }

  // ---- lezen ----
  function tags(doc, name) { return Array.prototype.slice.call(doc.getElementsByTagNameNS("*", name)); }
  function text(el) { return tags(el, "t").map(function (t) { return t.textContent; }).join(""); }
  function parse(s) {
    var doc = new DOMParser().parseFromString(s, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Het Excel-bestand kan niet worden gelezen.");
    return doc;
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ""), n = 0;
    if (!m) return -1;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  function read(file) {
    return file.arrayBuffer().then(function (buf) {
      var files = unzip(buf);
      if (files instanceof Promise) return files;
      // Eerste werkblad opzoeken via workbook.xml en de relaties.
      return Promise.all([inflate(files["xl/workbook.xml"]), inflate(files["xl/_rels/workbook.xml.rels"]), inflate(files["xl/sharedStrings.xml"])]).then(function (r) {
        if (!r[0]) throw new Error("Dit is geen geldig Excel-bestand (.xlsx).");
        var first = tags(parse(r[0]), "sheet")[0];
        var rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
        var target = "worksheets/sheet1.xml";
        if (r[1] && rid) tags(parse(r[1]), "Relationship").forEach(function (rel) { if (rel.getAttribute("Id") === rid) target = rel.getAttribute("Target"); });
        var path = target.charAt(0) === "/" ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
        var shared = r[2] ? tags(parse(r[2]), "si").map(text) : [];
        return inflate(files[path]).then(function (sheet) {
          if (!sheet) throw new Error("Het werkblad in het Excel-bestand is niet gevonden.");
          return tags(parse(sheet), "row").map(function (row) {
            var out = [];
            tags(row, "c").forEach(function (c, i) {
              var idx = colIndex(c.getAttribute("r"));
              if (idx < 0) idx = i;
              var t = c.getAttribute("t"), v = tags(c, "v")[0], val = null;
              if (t === "s") val = v ? shared[Number(v.textContent)] : null;
              else if (t === "inlineStr") val = text(c);
              else if (t === "str" || t === "e") val = v ? v.textContent : null;
              else if (t === "b") val = v ? v.textContent === "1" : null;
              else if (v) val = Number(v.textContent);
              out[idx] = val;
            });
            for (var j = 0; j < out.length; j++) if (out[j] === undefined) out[j] = null;
            return out;
          });
        });
      });
    });
  }

  A.xlsx = { write: write, read: read };
})();
