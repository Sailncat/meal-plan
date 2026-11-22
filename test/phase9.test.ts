import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

describe('privacy and terms pages', () => {
  for (const name of ['privacy.html', 'terms.html']) {
    it(`${name} has a real contact email`, () => {
      const html = page(name);
      // A placeholder left in would publish a page nobody can reach you through.
      expect(html).not.toContain('CONTACT_EMAIL');
      const mails = [...html.matchAll(/mailto:([^"]+)"/g)].map((m) => m[1]);
      expect(mails.length).toBeGreaterThan(0);
      for (const m of mails) expect(m).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
    });
  }

  it('name Sail, link to each other and back to the app, and work without the app', () => {
    const privacy = page('privacy.html');
    const terms = page('terms.html');
    expect(privacy).toContain('run by Sail');
    expect(terms).toContain('run by Sail');
    expect(privacy).toContain('href="terms.html"');
    expect(terms).toContain('href="privacy.html"');
    for (const html of [privacy, terms]) {
      expect(html).toContain('href="./"');
      expect(html).not.toMatch(/<script/);
    }
    expect(terms).toMatch(/not a medical device/i);
  });
});
