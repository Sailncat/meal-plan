import { mount } from 'svelte';
import './fonts';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Offline support. Preview builds skip it: claude.ai previews don't allow service workers.
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_PREVIEW) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}

export default app;
