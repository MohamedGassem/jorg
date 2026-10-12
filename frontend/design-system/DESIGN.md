# Jorg Design System: "Papier & encre"

Source of truth for Jorg's visual language. Tokens live in `app/globals.css`;
this file explains the intent behind them. Built from the TeamSync kit
(designmd.ai, `chef/teamsync`) for shapes and type, on the cream paper and
violet ink of the previous "Dossier relié" palette.

## Intent

- Speak to both audiences: calm and premium for consulting firms, warm and
  reassuring for candidates who keep control of their data.
- One violet only. The ink `#4A3AA8` carries actions, links and active states.
- Rose is reserved for people (avatars, presence). Never use it for actions.

## Color (light)

| Token             | Hex       | Role                                      |
| ----------------- | --------- | ----------------------------------------- |
| `--brand-primary` | `#4A3AA8` | Primary actions, links, active tab, focus |
| `--bg-app`        | `#F5F1E8` | App canvas (cream paper)                  |
| `--paper`         | `#FFFDF8` | Cards, panels, inputs                     |
| `--paper-2`       | `#F8F5EE` | Muted and elevated surfaces               |
| `--ink`           | `#2B2733` | Primary text                              |
| `--ink-3`         | `#6C6676` | Secondary text, labels                    |
| `--line`          | `#E8E2D6` | Borders and dividers                      |
| `--people`        | `#C2537A` | Avatar initials, people-related signals   |
| `--people-soft`   | `#F6E3E8` | Avatar background                         |
| `--positive`      | `#2E6B4F` | Success, active access                    |
| `--warn`          | `#96682A` | Pending, to complete                      |

Dark mode keeps the same roles with re-derived values (see `[data-theme="dark"]`).

## Typography

- **Figtree** for UI and headings (`--font-sans`, `--font-heading`). No serif.
- **IBM Plex Mono** only for data-like values (codes, identifiers).
- Overlines (`.j-overline`): Figtree 600, 12.5px, sentence case.
- Table headers (`.j-th`): Figtree 600, 11.5px, uppercase, light tracking.

## Shape

- Cards and panels: 14px radius (`--radius`).
- Buttons, badges, chips, status pills: fully rounded (pill).
- Inputs: 10px radius.
- People avatars: circles on `--people-soft`. Organisation marks stay square.

## Do and don't

- Do keep one primary button per area; secondary actions stay outlined or ghost.
- Do prefer cream surfaces with thin lines over heavy shadows.
- Don't introduce a second violet or a gradient.
- Don't use rose for buttons, links or status.
