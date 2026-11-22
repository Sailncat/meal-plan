<script lang="ts">
  import { store } from '../lib/store.svelte';

  const REPO = 'https://github.com/Sailncat/meal-plan';
  const builtAt = new Date(__BUILD_TIME__).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const version = `${builtAt}${__BUILD_COMMIT__ ? ` (${__BUILD_COMMIT__})` : ''}`;

  /** A new GitHub issue with the details a bug report needs already filled in. */
  const feedbackUrl = $derived.by(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches;
    const body = [
      '**What happened, or what would you like?**',
      '',
      '',
      '**Steps to see it (for a bug)**',
      '1. ',
      '',
      '---',
      `App version: ${version}`,
      `Device: ${navigator.userAgent}`,
      `Screen: ${window.innerWidth}×${window.innerHeight}${installed ? ', installed app' : ', in the browser'}`,
    ].join('\n');
    return `${REPO}/issues/new?${new URLSearchParams({ body })}`;
  });
</script>

<a class="back" href="#me">‹ Me</a>
<h1 class="page-title">Help and about</h1>

<section class="panel pad feedback">
  <p><b>Found a bug or have an idea?</b></p>
  <a class="btn primary" href={feedbackUrl} target="_blank" rel="noopener">Send feedback on GitHub</a>
  <p class="note">
    Opens a new post with your app version and device filled in. Needs a free GitHub account. Posts are public, so leave out anything
    personal.
  </p>
</section>

<h2 class="bar">How it works</h2>
<div class="panel topics">
  <details>
    <summary>Planning a day</summary>
    <p>
      Pick a day on the week strip, then add foods or recipes to its meals. The gauges at the top show the day against your targets;
      you choose which gauges in Settings, and the meal cards show the same numbers.
    </p>
    <p>
      Tick the circle next to something once you’ve eaten it. If you ate something else, tap ⇄ to swap it: the plan keeps what you meant
      to eat, and the day counts what you actually ate.
    </p>
  </details>
  <details>
    <summary>Weeks</summary>
    <p>
      The arrows move between weeks. The week menu (⋯) copies last week into this one, saves a week to start other weeks from, or clears
      the week. Clearing can be undone.
    </p>
  </details>
  <details>
    <summary>Recipes</summary>
    <p>
      A recipe makes a number of servings, and you add servings of it to meals. Scale changes every amount and the servings together, so
      a serving stays the same size.
    </p>
    <p>
      Import reads a recipe from a link to most big recipe sites and matches each ingredient to your foods; you check every match before
      it’s saved. Share sends a recipe as text with a link that adds it straight into someone else’s app.
    </p>
  </details>
  <details>
    <summary>Foods</summary>
    <p>
      Search covers basic foods (which work offline) and packaged products from Open Food Facts, or scan a barcode. Every food from a
      database gets a check card before it’s added. You can also type a food in from its label.
    </p>
    <p>
      “Ways to count it” lets you use pieces, like 1 egg = 60 g. Add a pack size and price to see what meals and days cost.
    </p>
  </details>
  <details>
    <summary>Targets</summary>
    <p>
      Fill in your profile on the Me tab and the app works out your calories, protein, carbs and fat. Every target can be set by hand
      instead. The Nutrients tab shows the week’s vitamins and minerals against EU (or US) goals, and warns about safe upper limits.
    </p>
  </details>
  <details>
    <summary>Printing</summary>
    <p>
      The week menu (⋯) on the Plan tab prints the week, followed by every recipe in it. Choose “Save as PDF” as the printer to get a
      file instead.
    </p>
  </details>
  <details>
    <summary>Using it as an app</summary>
    <p>
      In your browser’s menu, choose “Install app” or “Add to Home screen”. It then opens full screen and works offline, apart from food
      search, barcode lookups and recipe import. It updates itself when a new version is out.
    </p>
  </details>
</div>

<h2 class="bar">Your data</h2>
<div class="panel pad prose">
  {#if store.storage === 'memory'}
    <p><b>This browser won’t let the app save,</b> so changes are lost when you close it. Save a backup file before you go.</p>
  {:else}
    <p>
      Your plan is stored on this device only. Nothing about you is uploaded, and there’s no account. That also means clearing the
      browser’s data deletes your plan, so save a backup file now and then (Settings → Backup). A backup is also how you move your plan to
      another device.
    </p>
  {/if}
  <p>
    The only things sent anywhere are food searches, barcode lookups, and recipe pages you import. They pass through the app’s own relay
    on Cloudflare, which keeps no record of them.
  </p>
</div>

<h2 class="bar">About</h2>
<div class="panel pad prose">
  <p>Meal plan · test build{import.meta.env.VITE_PREVIEW ? ' (preview)' : ''} · updated {version}</p>
  <p class="note">
    Packaged food data © <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> contributors,
    under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">Open Database License</a>. Basic food
    data from <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a> (SR Legacy, public domain).
  </p>
  <p class="note">The code is open: <a href={REPO} target="_blank" rel="noopener">github.com/Sailncat/meal-plan</a>.</p>
</div>

<style>
  .back {
    display: inline-block;
    margin-top: 0.25rem;
    color: var(--muted);
    font-weight: 600;
    text-decoration: none;
  }
  .back:hover {
    color: var(--ink);
  }
  .prose a {
    color: inherit;
  }
  .feedback {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
  }
  .feedback p {
    margin: 0;
  }
  .topics {
    padding: 0;
  }
  details {
    border-bottom: 1px solid var(--line);
  }
  details:last-child {
    border-bottom: 0;
  }
  summary {
    padding: 0.75rem 0.9rem;
    font-weight: 700;
    cursor: pointer;
    list-style-position: inside;
  }
  details p {
    margin: 0 0.9rem 0.75rem;
    line-height: 1.5;
  }
  .prose p {
    margin: 0 0 0.6rem;
    line-height: 1.5;
  }
  .prose p:last-child {
    margin-bottom: 0;
  }
</style>
