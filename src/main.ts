import { mount } from 'svelte';
import './fonts';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Offline support. Preview builds skip it: claude.ai previews don't allow service workers.
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_PREVIEW) {
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        // The browser only looks for a new version when the page is opened, so a tab or installed app
        // left open would stay on the old one. Look again when it comes back into view, and hourly.
        onRegisteredSW(_url, reg) {
          if (!reg) return;
          const check = () => {
            if (navigator.onLine) reg.update().catch(() => {});
          };
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
          });
          setInterval(check, 60 * 60 * 1000);
        },
      }),
    )
    .catch(() => {});
}

export default app;
