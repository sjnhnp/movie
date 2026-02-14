# Avoid These Tailwind CSS v4 Mistakes

This guide summarizes common errors encountered during a migration to Tailwind CSS v4, specifically when moving from a traditional CSS structure. These are critical pitfalls to avoid to ensure successful builds.

## 1. Do Not Mix `group` with `@apply`

**The Error:**
Using the utility class `group` directly inside an `@apply` directive will cause the build to fail with `Cannot apply unknown utility class: group`.

**Incorrect:**

```css
.card {
  @apply group relative flex; /* ERROR: 'group' is not a standard utility class apply-able like this */
}
```

**Correct:**
Add the `group` class directly to the HTML element, or use standard CSS nesting if you must keep it in CSS (though adding it to HTML is preferred).

```html
<!-- In your HTML/Template -->
<div class="card group ...">
  ...
</div>
```

## 2. Avoid `@apply` for Complex Arbitrary Values (especially with spaces/commas)

**The Error:**
Tailwind's parser can struggle with complex arbitrary values in `@apply`, particularly those containing spaces, commas, or functions like `rgba()`, leading to invalid CSS generation or build errors.

**Incorrect:**

```css
.shadow-glow {
  @apply shadow-[0_0_20px_rgba(99,102,241,0.5)]; /* Can be fragile or misinterpreted */
}
```

**Correct:**
Use standard CSS properties for complex values. It's cleaner, more readable, and foolproof.

```css
.shadow-glow {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
}
```

## 3. Do Not Use Non-Existent Plugins or Utilities

**The Error:**
Migration often involves assuming utilities from plugins (like `scrollbar-hide`) are available by default or trying to use them without configuration. Tailwind v4 has a new engine and plugin system.

**Incorrect:**

```css
.scroll-container {
  @apply scrollbar-none; /* Error if the plugin isn't installed/configured compatible with v4 */
}
```

**Correct:**
For simple utilities like hiding scrollbars, just use standard CSS. It removes a dependency and is guaranteed to work.

```css
.scroll-container {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.scroll-container::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}
```

## 4. `group-hover` Logic in Tailwind v4 vs CSS Nesting

**The Error:**
Trying to `@apply group-hover:text-white` inside a class definition often fails or behaves unexpectedly because `@apply` does not always handle state-variant pseudo-classes (:hover, :focus) on nested elements correctly in all contexts.

**Incorrect:**

```css
.card-title {
  @apply text-gray-500 group-hover:text-white; /* Often fails in v4 builds */
}
```

**Correct:**
Use CSS nesting (which is now native and supported by Tailwind v4's CSS handling) to define the relationship explicitly.

```css
.card-title {
  @apply text-gray-500;
}

/* Explicitly target the relationship */
.group:hover .card-title {
  @apply text-white;
}

/* OR using nesting within the parent card class */
.card {
  @apply group; /* If this worked (see point 1), but better to put 'group' in HTML */
  
  &:hover .card-title {
    @apply text-white;
  }
}
```

## Summary for Developers

1. **Keep it Simple**: If a complex `@apply` fails, just write standard CSS.
2. **HTML-First**: Put utility classes (like `group`, `peer`, layout classes) in your HTML templates whenever possible.
3. **Standard CSS for Stability**: For scrollbars, complex shadows, and gradients, standard CSS is often more robust than fighting with arbitrary value syntax.
