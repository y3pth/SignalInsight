export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export function rowNotEmpty(rows, columnIndex) {
  return rows.every((row) => String(row[columnIndex] ?? "").trim() !== "");
}

export function parseCsv(text) {
  const normalized = String(text ?? "").replace(/^\uFEFF/, "");
  if (!normalized.trim()) throw new Error("CSV 内容为空。");

  let best = null;
  for (const delimiter of [",", "\t", ";"]) {
    const rows = parseDelimited(normalized, delimiter);
    if (rows.length < 3) continue;
    const width = rows[0].length;
    if (width < 2 || rows.some((row) => row.length !== width)) continue;
    if (!best || width > best.width) best = { delimiter, rows, width };
  }
  if (!best) {
    const lines = normalized.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 3) throw new Error("CSV 至少需要表头和两行数据。");
    throw new Error("无法识别 CSV 分隔符或字段数不一致，请使用逗号、制表符或分号。");
  }

  const headers = best.rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV 存在空表头。");
  if (new Set(headers).size !== headers.length) throw new Error("CSV 存在重复表头。");

  const dataRows = best.rows.slice(1);
  if (dataRows.length < 2) throw new Error("CSV 至少需要表头和两行数据。");
  const numericColumns = [];
  headers.forEach((header, columnIndex) => {
    const values = dataRows.map((row) => Number(row[columnIndex]));
    if (rowNotEmpty(dataRows, columnIndex) && values.every(Number.isFinite)) {
      numericColumns.push({ header, values });
    }
  });
  if (numericColumns.length < 2) throw new Error("未找到两个以上完整数值列。");

  const timeCandidate =
    numericColumns.find((column) =>
      column.values.every((value, index) => index === 0 || value > column.values[index - 1]),
    ) ?? numericColumns[0];
  const signalCandidate = numericColumns.find((column) => column !== timeCandidate);
  return { headers, rows: dataRows, delimiter: best.delimiter, numericColumns, timeCandidate, signalCandidate };
}
