const MI_INT8 = 1;
const MI_UINT8 = 2;
const MI_INT16 = 3;
const MI_UINT16 = 4;
const MI_INT32 = 5;
const MI_UINT32 = 6;
const MI_SINGLE = 7;
const MI_DOUBLE = 9;
const MI_INT64 = 12;
const MI_UINT64 = 13;
const MI_MATRIX = 14;
const MI_COMPRESSED = 15;

function align8(value) {
  return value + ((8 - (value % 8)) % 8);
}

function readTag(view, offset, littleEndian) {
  const first = view.getUint32(offset, littleEndian);
  const smallSize = first >>> 16;
  if (smallSize !== 0) {
    return {
      type: first & 0xffff,
      size: smallSize,
      dataOffset: offset + 4,
      nextOffset: offset + 8,
      small: true,
    };
  }
  const size = view.getUint32(offset + 4, littleEndian);
  return {
    type: first,
    size,
    dataOffset: offset + 8,
    nextOffset: align8(offset + 8 + size),
    small: false,
  };
}

function readNumbers(view, tag, littleEndian, count) {
  const values = [];
  const { dataOffset, type } = tag;
  for (let index = 0; index < count; index += 1) {
    let offset = dataOffset;
    if (type === MI_DOUBLE) offset += index * 8;
    else if (type === MI_SINGLE) offset += index * 4;
    else if (type === MI_INT32) offset += index * 4;
    else if (type === MI_UINT32) offset += index * 4;
    else if (type === MI_INT16) offset += index * 2;
    else if (type === MI_UINT16) offset += index * 2;
    else if (type === MI_INT8 || type === MI_UINT8) offset += index;
    else if (type === MI_INT64 || type === MI_UINT64) offset += index * 8;
    else throw new Error(`不支持的 MAT 数据类型：${type}`);
    if (type === MI_DOUBLE) values.push(view.getFloat64(offset, littleEndian));
    else if (type === MI_SINGLE) values.push(view.getFloat32(offset, littleEndian));
    else if (type === MI_INT32) values.push(view.getInt32(offset, littleEndian));
    else if (type === MI_UINT32) values.push(view.getUint32(offset, littleEndian));
    else if (type === MI_INT16) values.push(view.getInt16(offset, littleEndian));
    else if (type === MI_UINT16) values.push(view.getUint16(offset, littleEndian));
    else if (type === MI_INT8) values.push(view.getInt8(offset));
    else if (type === MI_UINT8) values.push(view.getUint8(offset));
    else if (type === MI_INT64) values.push(Number(view.getBigInt64(offset, littleEndian)));
    else if (type === MI_UINT64) values.push(Number(view.getBigUint64(offset, littleEndian)));
  }
  return values;
}

function readName(view, tag, littleEndian) {
  const bytes = [];
  for (let index = 0; index < tag.size; index += 1) {
    bytes.push(view.getUint8(tag.dataOffset + index));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes)).replace(/\0+$/, "");
}

function parseMatrix(view, matrixTag, littleEndian) {
  let offset = matrixTag.dataOffset;
  const end = matrixTag.dataOffset + matrixTag.size;
  let flags = 0;
  let rows = 0;
  let cols = 0;
  let name = "";
  let nameRead = false;
  let real = null;
  let imaginary = null;
  while (offset + 8 <= end) {
    const tag = readTag(view, offset, littleEndian);
    if (tag.type === MI_UINT32 && !real && !nameRead) {
      flags = view.getUint32(tag.dataOffset, littleEndian);
    } else if (tag.type === MI_INT32 && rows === 0) {
      const dims = readNumbers(view, tag, littleEndian, Math.floor(tag.size / 4));
      rows = dims[0] ?? 0;
      cols = dims[1] ?? 1;
    } else if (tag.type === MI_INT8 && !real && !nameRead) {
      name = readName(view, tag, littleEndian);
      nameRead = true;
    } else if ([MI_DOUBLE, MI_SINGLE, MI_INT8, MI_UINT8, MI_INT16, MI_UINT16, MI_INT32, MI_UINT32, MI_INT64, MI_UINT64].includes(tag.type)) {
      const count = tag.size / (tag.type === MI_DOUBLE ? 8 : tag.type === MI_SINGLE || tag.type === MI_INT32 || tag.type === MI_UINT32 ? 4 : tag.type === MI_INT16 || tag.type === MI_UINT16 ? 2 : tag.type === MI_INT64 || tag.type === MI_UINT64 ? 8 : 1);
      const numbers = readNumbers(view, tag, littleEndian, count);
      if (!real) real = numbers;
      else if (!imaginary) imaginary = numbers;
    }
    offset = tag.nextOffset;
  }
  if (!rows || !cols || !real || real.length < rows * cols) return null;
  const values = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => real[col * rows + row]),
  );
  const imaginaryValues = imaginary
    ? Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => imaginary[col * rows + row]),
      )
    : null;
  return {
    name,
    rows,
    cols,
    values,
    imaginary: imaginaryValues,
    complex: Boolean(flags & 0x800),
    storageClass: flags & 0xff,
  };
}

export function parseMat(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 128) throw new Error("MAT 文件头不完整。");
  const marker = String.fromCharCode(view.getUint8(126), view.getUint8(127));
  if (marker !== "IM" && marker !== "MI") throw new Error("不是有效的 MAT v5 文件。");
  const littleEndian = marker === "IM";
  const variables = [];
  let offset = 128;
  while (offset + 8 <= view.byteLength) {
    const tag = readTag(view, offset, littleEndian);
    if (tag.type === MI_COMPRESSED) throw new Error("暂不支持压缩 MAT（v7.3/HDF5），请另存为 v5。");
    if (tag.type === MI_MATRIX) {
      const variable = parseMatrix(view, tag, littleEndian);
      if (variable) variables.push(variable);
    }
    if (tag.nextOffset <= offset) break;
    offset = tag.nextOffset;
  }
  return variables;
}
