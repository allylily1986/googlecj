import { stringToUint8 } from "./utils.js";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;

const VERSION = 20; // minimum version needed to extract

const crcTable = buildCrc32Table();

export function createZip(entries) {
  const files = entries.map((entry) => normalizeEntry(entry));
  let offset = 0;
  const localChunks = [];
  const centralChunks = [];

  for (const file of files) {
    const header = createLocalFileHeader(file);
    const central = createCentralDirectoryHeader(file, offset);

    localChunks.push(header, file.nameBytes, file.data);
    centralChunks.push(central, file.nameBytes);

    offset += header.length + file.nameBytes.length + file.data.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = createEndRecord(files.length, centralSize, offset);

  const totalSize =
    offset + // local headers + data
    centralSize +
    endRecord.length;

  const output = new Uint8Array(totalSize);
  let position = 0;

  for (const chunk of localChunks) {
    output.set(chunk, position);
    position += chunk.length;
  }

  for (const chunk of centralChunks) {
    output.set(chunk, position);
    position += chunk.length;
  }

  output.set(endRecord, position);

  return output;
}

function normalizeEntry(entry) {
  if (!entry?.name) {
    throw new Error("Zip entry missing name");
  }
  const data =
    entry.data instanceof Uint8Array
      ? entry.data
      : typeof entry.data === "string"
      ? stringToUint8(entry.data)
      : new Uint8Array(entry.data);
  const nameBytes = stringToUint8(entry.name);
  const date = entry.date ? new Date(entry.date) : new Date();
  const dos = dateToDos(date);
  const crc = crc32(data);

  return {
    ...entry,
    data,
    nameBytes,
    dos,
    crc
  };
}

function createLocalFileHeader(file) {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, 0, true); // general purpose bit flag
  view.setUint16(8, 0, true); // compression method (0 = stored)
  view.setUint16(10, file.dos.time, true);
  view.setUint16(12, file.dos.date, true);
  view.setUint32(14, file.crc, true);
  view.setUint32(18, file.data.length, true);
  view.setUint32(22, file.data.length, true);
  view.setUint16(26, file.nameBytes.length, true);
  view.setUint16(28, 0, true); // extra field length
  return new Uint8Array(buffer);
}

function createCentralDirectoryHeader(file, offset) {
  const buffer = new ArrayBuffer(46);
  const view = new DataView(buffer);
  view.setUint32(0, CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0x0314, true); // version made by (arbitrary)
  view.setUint16(6, VERSION, true); // version needed to extract
  view.setUint16(8, 0, true); // general purpose bit flag
  view.setUint16(10, 0, true); // compression method
  view.setUint16(12, file.dos.time, true);
  view.setUint16(14, file.dos.date, true);
  view.setUint32(16, file.crc, true);
  view.setUint32(20, file.data.length, true);
  view.setUint32(24, file.data.length, true);
  view.setUint16(28, file.nameBytes.length, true);
  view.setUint16(30, 0, true); // extra field length
  view.setUint16(32, 0, true); // file comment length
  view.setUint16(34, 0, true); // disk number start
  view.setUint16(36, 0, true); // internal file attrs
  view.setUint32(38, 0, true); // external file attrs
  view.setUint32(42, offset, true);
  return new Uint8Array(buffer);
}

function createEndRecord(fileCount, centralSize, offset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, END_OF_CENTRAL_DIR_SIGNATURE, true);
  view.setUint16(4, 0, true); // number of this disk
  view.setUint16(6, 0, true); // disk where central directory starts
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, 0, true); // comment length
  return new Uint8Array(buffer);
}

function dateToDos(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day
  };
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c >>>= 1;
      }
    }
    table[i] = c >>> 0;
  }
  return table;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const index = (crc ^ data[i]) & 0xff;
    crc = (crc >>> 8) ^ crcTable[index];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
