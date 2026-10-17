import { mkdir, copyFile } from 'node:fs/promises';
const dest=new URL('../public/ffmpeg/',import.meta.url);
await mkdir(dest,{recursive:true});
for(const file of ['ffmpeg-core.js','ffmpeg-core.wasm']) await copyFile(new URL(`../node_modules/@ffmpeg/core/dist/esm/${file}`,import.meta.url),new URL(file,dest));
console.log('FFmpeg assets copied (same-origin, single-thread core).');
