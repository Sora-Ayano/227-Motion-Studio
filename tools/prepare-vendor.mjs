import {readFile,writeFile,mkdir} from 'node:fs/promises';
const source=await readFile('node_modules/mmd-parser/build/mmdparser.module.js','utf8');
const patched=source.replace('return this.getUnicodeStrings( size );','if ( this.dv.getUint8( 9 ) === 1 ) { const bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.offset, size); this.offset += size; return new TextDecoder("utf-8").decode(bytes); }\n\t\treturn this.getUnicodeStrings( size );');
if(source===patched)throw new Error('Parser patch marker missing');await mkdir('web/lib',{recursive:true});await writeFile('web/lib/mmdparser.mjs','/*\n'+await readFile('node_modules/mmd-parser/LICENSE','utf8')+'\n*/\n'+patched);console.log('PMX UTF-8 + UTF-16 parser ready');
