const fs = require('fs');
const css = fs.readFileSync('./public/style.css', 'utf8');
let html = fs.readFileSync('./public/index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>');
// Also do same for login.html
let loginHtml = fs.readFileSync('./public/login.html', 'utf8');
loginHtml = loginHtml.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>');
fs.writeFileSync('./public/index.html', html);
fs.writeFileSync('./public/login.html', loginHtml);
console.log('Done. CSS inlined into both index.html and login.html');
