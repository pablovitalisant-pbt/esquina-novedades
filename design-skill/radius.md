# Border Radius

| Token | Value | Default usage |
|---|---|---|
| base | 24px | Modals, dropdowns, popovers, sections, accordion, tables |
| default | 48px | Cards, large surface containers |
| sm | 8px | Checkboxes, tooltips, dropdown items, small controls |
| full | 9999px | Buttons, inputs, badges, pills, avatars, toggles, dot indicators |

## Rules

- 9999px (pill) is the default radius for all interactive controls (buttons, inputs, badges)
- 48px is the default radius for cards and large surfaces
- 24px is the default radius for overlays and containers (modals, dropdowns, popovers)
- Never use arbitrary radius values outside this scale
- Radius must be consistent within each component family
