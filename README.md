# Meal plan

Plan your week of meals, macros and meal prep. A web app that works offline and can be installed to a phone's home screen. Everything is stored on the device; nothing is sent anywhere.

## What's in it so far

- **Plan:** a week strip with each day's calories and protein; tap a day to see its meals. Meals are your own (Breakfast, Lunch, Shakes…), and each holds any number of recipes or foods.
- **Recipes:** build recipes from your foods; servings split a batch into meals.
- **Foods:** label values per 100 g or per piece, with vitamins and minerals; mark supplements to tick off each day.
- **Nutrients:** the week's vitamins, minerals and macros against daily goals.
- **Settings:** meals, daily targets, backup files, clearing the week.

Backups are plain JSON files. The app also reads the plan from the original Claude meal plan artifact.

## Working on it

```
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # production build into dist/
```

Built with Svelte, TypeScript and Vite. Pushing to `main` tests, builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
