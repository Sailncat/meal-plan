# Meal plan

Plan your week of meals, macros and meal prep. A web app that works offline and can be installed to a phone's home screen. Everything is stored on the device; nothing is sent anywhere.

## What's in it so far

- **Plan:** a week strip with each day's calories and protein; tap a day to see its meals against calorie, protein, carb and fat targets. Meals are your own (Breakfast, Lunch, Shakes…), and each holds any number of recipes or foods.
- **Recipes:** build recipes from your foods; servings split a batch into meals.
- **Foods:** label values per 100 g, plus ways to count each food (1 egg = 60 g, 1 slice = 35 g); mark supplements to tick off each day.
- **Nutrients:** the week's vitamins, minerals and macros against goals for your age, sex and life stage (EU EFSA or US tables), with warnings above safe upper limits.
- **Me:** weight log and chart, profile, and daily targets worked out from them (Mifflin-St Jeor, 1.6–2.2 g protein per kg), each one overridable. Settings sits inside: meals, units (metric or UK imperial, kcal or kJ), backup files.

Backups are plain JSON files. The app also reads the plan from the original Claude meal plan artifact.

## Working on it

```
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # production build into dist/
```

Built with Svelte, TypeScript and Vite. Pushing to `main` tests, builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
