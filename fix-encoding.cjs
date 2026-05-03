const fs = require('fs');
const path = require('path');

const root = 'c:/Users/Inkcell/Documents/Projetos/CantinaSmart';

// Step 1: Find 'respons' in bytes and show what follows
const buf = fs.readFileSync(root + '/pages/ClientsPage.tsx');
const marker = Buffer.from('respons');
let found = 0;
for (let i = 0; i < buf.length - 20 && found < 5; i++) {
  let match = true;
  for (let j = 0; j < 7; j++) {
    if (buf[i+j] !== marker[j]) { match = false; break; }
  }
  if (match) {
    const bytes = buf.slice(i+7, i+20);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0') + '(' + (b >= 32 && b < 127 ? String.fromCharCode(b) : '.') + ')').join(' ');
    console.log('pos', i, ':', hex);
    found++;
  }
}
