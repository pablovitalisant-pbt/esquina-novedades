# Cards

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `typography.md`

## Core Specs

- **Background:** colorful pastel fill — rotate through #F2D9DC (rose), #D9F2D8 (mint), #E0D9F1 (lavender), #DAEFF8 (sky) across cards in a group; for standalone cards use neutral-primary-soft
- **Border:** none (colorful cards) or 1px border-default (neutral cards)
- **Radius:** 48px
- **Shadow:** none — cards must not have box-shadow

## Card Heading

- Desktop: 20px, medium weight, heading color
- Mobile: 16px, medium weight, heading color
- Never skip heading levels — the page hierarchy must logically arrive at the card heading level.

## States

### Static Card (no interactivity)
- Background: colorful pastel fill (see Core Specs) or neutral-primary-soft
- Border: none (colorful) or 1px border-default (neutral)
- Radius: 48px
- Shadow: none
- No hover styles. Non-interactive cards must NOT have hover background changes.

### Interactive Card (clickable)
- Same base styles as static card
- Hover: slight brightness increase (filter: brightness(1.03))
- Transition: all properties, 200ms
- Cursor: pointer

## Rules

- Background: colorful pastel fills (#F2D9DC, #D9F2D8, #E0D9F1, #DAEFF8) rotated across card groups; neutral-primary-soft for standalone
- Border: none for colorful cards, 1px border-default for neutral
- Radius: 48px
- Shadow: none — never apply box-shadow to cards
- Interactive hover: brightness lift only (no shadow change)
- Non-interactive: no hover styles
