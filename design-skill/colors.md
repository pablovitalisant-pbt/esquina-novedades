# Color Tokens


## Background Tokens

### Neutral
| Token | Light | Dark |
|---|---|---|
| neutral-primary-soft | #FFFFFF | #101828 |
| neutral-primary | #FFFFFF | #030712 |
| neutral-primary-medium | #FFFFFF | #1E2939 |
| neutral-primary-strong | #FFFFFF | #333E4F |
| neutral-secondary-soft | #F9FAFB | #101828 |
| neutral-secondary | #F9FAFB | #030712 |
| neutral-secondary-medium | #F9FAFB | #1E2939 |
| neutral-secondary-strong | #F9FAFB | #333E4F |
| neutral-tertiary-soft | #F3F4F6 | #101828 |
| neutral-tertiary | #F3F4F6 | #1E2939 |
| neutral-tertiary-medium | #F3F4F6 | #333E4F |
| neutral-quaternary | #E5E7EB | #333E4F |
| quaternary-medium | #E5E7EB | #4A5565 |
| gray | #D1D5DC | #4A5565 |

### Brand
| Token | Light | Dark |
|---|---|---|
| brand-softer | #FDF6EC | #3D2E10 |
| brand-soft | #FAECDA | #5C4520 |
| brand | #F5DFBB | #F5DFBB |
| brand-medium | #EDD1A3 | #5C4520 |
| brand-strong | #D4A96E | #F5DFBB |

### Status
| Token | Light | Dark |
|---|---|---|
| success-soft | #ECFDF5 | #002C22 |
| success | #007A55 | #009966 |
| success-medium | #D0FAE5 | #004F3B |
| success-strong | #006045 | #007A55 |
| danger-soft | #FEF0F2 | #4D0218 |
| danger | #C70036 | #C70036 |
| danger-medium | #FFE4E6 | #8B0836 |
| danger-strong | #A50036 | #A50036 |
| warning-soft | #FFF7ED | #7C2D12 |
| warning | #F97316 | #F97316 |
| warning-medium | #FFEDD5 | #7C2D12 |
| warning-strong | #C2410C | #C2410C |

### Utility
| Token | Light | Dark |
|---|---|---|
| dark | #1F2937 | #1F2937 |
| dark-strong | #111827 | #374151 |
| disabled | #F3F4F6 | #1F2937 |

### Accent
| Token | Value (same both modes) |
|---|---|
| purple | #E21E26 |
| sky | #38BDF8 |
| teal | #2DD4BF |
| pink | #FFB612 |
| cyan | #22D3EE |
| fuchsia | #E21E26 |
| indigo | #231F20 |
| orange | #FB923C |

## Text Color Tokens

### Base
| Token | Light | Dark |
|---|---|---|
| white | #FFFFFF | #FFFFFF |
| black | #111827 | #111827 |
| heading | #111827 | #FFFFFF |
| body | #4B5563 | #9CA3AF |
| body-subtle | #6B7280 | #9CA3AF |

### Brand
| Token | Light | Dark |
|---|---|---|
| fg-brand-subtle | #EDD1A3 | #5C4520 |
| fg-brand | #A07840 | #F5DFBB |
| fg-brand-strong | #7D5C2E | #EDD1A3 |

### Status
| Token | Light | Dark |
|---|---|---|
| fg-success | #047857 | #065F46 |
| fg-success-strong | #065F46 | #10B981 |
| fg-danger | #BE123C | #F43F5E |
| fg-danger-strong | #881337 | #F87171 |
| fg-warning-subtle | #EA580C | #F97316 |
| fg-warning | #7C2D12 | #FBBF24 |
| fg-disabled | #9CA3AF | #6B7280 |

### Informational / Accent
| Token | Light | Dark |
|---|---|---|
| fg-yellow | #FACC15 | #FACC15 |
| fg-info | #312E81 | #93C5FD |
| fg-purple | #E21E26 | #E21E26 |
| fg-purple-strong | #231F20 | #231F20 |
| fg-cyan | #0891B2 | #06B6D4 |
| fg-indigo | #231F20 | #231F20 |
| fg-pink | #7C2D12 | #7C2D12 |
| fg-lime | #65A30D | #84CC16 |

## Border Color Tokens

| Token | Light | Dark |
|---|---|---|
| border-dark | #1F2937 | #4B5563 |
| border-buffer | #FFFFFF | #030712 |
| border-buffer-medium | #FFFFFF | #1F2937 |
| border-buffer-strong | #FFFFFF | #374151 |
| border-muted | #F9FAFB | #111827 |
| border-light-subtle | #F3F4F6 | #111827 |
| border-light | #F3F4F6 | #1F2937 |
| border-light-medium | #F3F4F6 | #374151 |
| border-default-subtle | #E5E7EB | #111827 |
| border-default | #E5E7EB | #1F2937 |
| border-default-medium | #E5E7EB | #374151 |
| border-default-strong | #E5E7EB | #4B5563 |
| border-success-subtle | #A7F3D0 | #064E3B |
| border-success | #047857 | #065F46 |
| border-danger-subtle | #FECDD3 | #881337 |
| border-danger | #BE123C | #BE123C |
| border-warning-subtle | #FED7AA | #7C2D12 |
| border-warning | #EA580C | #F97316 |
| border-brand-subtle | #FAECDA | #5C4520 |
| border-brand-light | #EDD1A3 | #EDD1A3 |
| border-brand | #D4A96E | #F5DFBB |
| border-dark-subtle | #1F2937 | #374151 |
| border-purple | #F58220 | #F58220 |
| border-orange | #FB923C | #FB923C |

## Semantic Usage Rules

- Page background: white (#FFFFFF) for all sections — no alternating backgrounds between sections
- Page-level gradient: apply a single subtle modern gradient overlay across the entire landing page (e.g. soft warm-to-cool diagonal gradient), not per-section
- Primary buttons: purple gradient background (`linear-gradient(0deg, rgba(77, 54, 208, 1) 0%, rgba(132, 116, 254, 1) 100%)`)
- Card backgrounds: use colorful pastel fills — #F2D9DC (rose), #D9F2D8 (mint), #E0D9F1 (lavender), #DAEFF8 (sky)
- Headings: heading text color
- Body text: body text color
- CTA links: fg-brand text color
- Default borders: border-default
- Status borders match intent: success → border-success, danger → border-danger, warning → border-warning
- Disabled: disabled background + fg-disabled text

## Prohibited

- No raw hex/rgb values in component code — always use design tokens
- No brand text color for long-form paragraphs
- No accent text tokens (fg-purple, etc.) for body copy or navigation
- No brand/accent backgrounds for individual sections — use the single page-level gradient instead
- No manual light/dark value swapping — let the CSS custom properties handle it
