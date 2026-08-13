import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar'; // or inspect files

const archives = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.tgz'));
console.log("Archives found:", archives);
