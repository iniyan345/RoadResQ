const fs = require('fs');
const path = require('path');

const publicDir = 'c:\\Users\\iniya\\Downloads\\files\\public';
const indexPath = path.join(publicDir, 'index.html');
const cssPath = path.join(publicDir, 'style.css');
const loginPath = path.join(publicDir, 'login.html');

let html = fs.readFileSync(indexPath, 'utf8');

// Extract CSS
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>', styleStart) + 8;
const css = html.substring(styleStart + 7, styleEnd - 8).trim();
fs.writeFileSync(cssPath, css);
console.log('Created style.css');

// Replace style with link
html = html.substring(0, styleStart) + '<link rel="stylesheet" href="style.css">' + html.substring(styleEnd);

// Extract auth block
const authStartComment = '<!-- ============ AUTH ============ -->';
const authStart = html.indexOf(authStartComment);
const authEnd = html.indexOf('<!-- ============ DASHBOARD ============ -->', authStart);

const authHtml = html.substring(authStart, authEnd).trim();

// Create login.html
let loginHtml = html.substring(0, html.indexOf('<body>') + 6) + '\n\n';
// Add some layout to loginHtml
loginHtml += `  <a href="#main-content" class="skip-link">Skip to content</a>\n`;
loginHtml += `  <div class="chevron-strip"></div>\n`;
loginHtml += `  <div style="height:100vh;display:flex;align-items:center;justify-content:center;">\n`;
loginHtml += authHtml + '\n';
loginHtml += `  </div>\n`;

// Add script to handle login redirect
const scriptsStart = html.indexOf('<script>', authEnd);
loginHtml += `
  <div class="toast-wrap" id="toastWrap" aria-live="polite"></div>
  <script>
    function toast(msg, type = '') {
      const t = document.createElement('div');
      t.className = 'toast' + (type ? ' ' + type : '');
      t.textContent = msg;
      document.getElementById('toastWrap').appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 300); }, 3200);
    }
    
    document.getElementById('tabLogin').addEventListener('click', () => {
      document.getElementById('tabLogin').classList.add('active'); 
      document.getElementById('tabSignup').classList.remove('active');
      document.getElementById('loginForm').style.display = 'block'; 
      document.getElementById('signupForm').style.display = 'none';
    });
    document.getElementById('tabSignup').addEventListener('click', () => {
      document.getElementById('tabSignup').classList.add('active'); 
      document.getElementById('tabLogin').classList.remove('active');
      document.getElementById('signupForm').style.display = 'block'; 
      document.getElementById('loginForm').style.display = 'none';
    });

    function validEmail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v); }

    function finishAuth(name) {
      localStorage.setItem('roadresq_user', name);
      localStorage.setItem('roadresq_token', 'mock_token');
      const banner = document.getElementById('authSuccess');
      banner.classList.add('show');
      setTimeout(() => { 
        window.location.href = 'index.html'; 
      }, 900);
    }

    document.getElementById('loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('loginForm').querySelector('input[type=email]').value;
      finishAuth(email.split('@')[0]);
    });
    
    document.getElementById('signupForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('signupForm').querySelector('#fName input').value;
      finishAuth(name);
    });

    document.querySelector('.google-btn').addEventListener('click', e => {
      e.preventDefault();
      finishAuth('Google User');
    });
  </script>
</body>
</html>`;

// Also fix auth view in loginHtml since it has .view class
loginHtml = loginHtml.replace('<div class="view active" id="view-auth">', '<div id="view-auth">');
loginHtml = loginHtml.replace('<div class="view" id="view-auth">', '<div id="view-auth">');

fs.writeFileSync(loginPath, loginHtml);
console.log('Created login.html');

// Modify index.html
// 1. Remove auth view
html = html.substring(0, authStart) + html.substring(authEnd);

// 2. Add auth check at top of body
const bodyStart = html.indexOf('<body>') + 6;
html = html.substring(0, bodyStart) + `
  <script>
    if (!localStorage.getItem('roadresq_user')) {
      window.location.href = 'login.html';
    }
  </script>
` + html.substring(bodyStart);

// 3. Remove Log In button
const logInBtn = '<button class="btn btn-outline btn-sm" data-view="auth">Log In</button>';
html = html.replace(logInBtn, `<button class="btn btn-outline btn-sm" onclick="localStorage.removeItem('roadresq_user'); window.location.href='login.html'">Log Out</button>`);

// 4. Ensure Home is active view initially
html = html.replace('<div class="view" id="view-home">', '<div class="view active" id="view-home">');
html = html.replace('<button data-view="home">Home</button>', '<button data-view="home" class="active">Home</button>');

fs.writeFileSync(indexPath, html);
console.log('Updated index.html');
