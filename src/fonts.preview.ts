// Preview builds run inside claude.ai, which only allows fonts from Google's servers.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap';
document.head.append(link);
