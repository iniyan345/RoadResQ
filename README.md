# RoadResQ Web Application

Welcome to RoadResQ — an emergency roadside assistance platform designed for quick response, live tracking, and easy access to nearby services.

## Project Structure

This project has been split into a dedicated frontend that you can run locally. 
- \`public/login.html\`: The standalone, premium login and authentication page.
- \`public/index.html\`: The main application (Home, Live Map, Dashboard, Tracking, and SOS).
- \`public/style.css\`: Shared styles to ensure a consistent, modern aesthetic across both pages.

## How to Run the Webpage

Because this webpage uses modern web features, you shouldn't just double-click the HTML files. Instead, run them using a local development server.

### Option 1: Using VS Code (Recommended)
1. Open this project folder in Visual Studio Code.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click on \`public/login.html\` and select **"Open with Live Server"**.
4. The application will launch in your default browser.

### Option 2: Using Node.js \`serve\`
If you have Node.js installed, you can use the \`serve\` package:
\`\`\`bash
# Install serve globally if you haven't already
npm install -g serve

# Serve the public directory
serve public
\`\`\`
Then, open \`http://localhost:3000/login.html\` in your browser.

### Option 3: Using Python
If you have Python installed, you can start a simple HTTP server:
\`\`\`bash
# Navigate to the public folder
cd public

# For Python 3
python -m http.server 8000
\`\`\`
Then, open \`http://localhost:8000/login.html\` in your browser.

## Features

* **Secure Entry**: Access is guarded by \`login.html\`. Users are redirected to the login page if they try to access the main application without authenticating.
* **Live Map Tracking**: Dynamic tracking interface for incoming mechanics, towing services, etc.
* **SOS Panel**: One-tap emergency dispatch and location sharing.
* **Premium UI**: Implements a glassmorphic design, dynamic gradients, and smooth CSS animations.
