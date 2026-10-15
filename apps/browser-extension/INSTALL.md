# Install PromptPulse in your browser

This folder is a browser extension. It runs inside Chrome or Edge and adds a live token meter to ChatGPT. You do not need a web server, Node.js, account, or API key to use the built extension.

1. If this came in a ZIP, extract it to a folder you will keep.
2. Open Chrome's `chrome://extensions` or Edge's `edge://extensions` page.
3. Turn on Developer mode and select **Load unpacked**.
4. Choose the extracted folder containing `manifest.json`.
5. Pin PromptPulse from the browser's Extensions menu, then open its popup.
6. Click **Enable ChatGPT access** and approve the browser's ChatGPT-only site permission.
7. Open ChatGPT. The PromptPulse pill appears in the bottom-right corner; click it to expand the meter. If an older tab has no meter, reload that tab.

The meter shows observed user and assistant text, a live draft estimate, pause/resume, and a link to the extension's private history. Type a draft in the ChatGPT composer to see the estimate before sending it. Drafts are never saved as usage.

Saved conversations with `/c/…` URLs contribute message records. New-chat drafts work before a saved conversation exists. Counts are local visible-text estimates, not provider billing totals or hidden model context.

The extension currently supports ChatGPT at `https://chatgpt.com`. Other chatbot adapters are planned. ChatGPT markup can change; the extension reports unavailable coverage when it cannot identify messages safely.

History/settings are packaged within the extension. Raw text storage is off by default. Remove site permission or pause collection from the popup. Browser and editor extensions store records independently; use JSON export/import to combine them.
