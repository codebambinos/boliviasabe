# Design: «Letrero»

Art direction for every BoliviaSabe app screen. Defined on 20 Nov 2026 with the tasteskill
system (design-taste-frontend 2.5), adapted from a website kit to an app. Product truth is in
`PRODUCT.md` and the wiki; tokens are in `src/styles/tokens.css`; shared components in
`src/styles/app.css` and `src/components/app-shell.css`. The wiki prototype was a sketch, not a
reference.

## The idea

The neighbors' photographs are the color. A letrero is a photo of something real on a street in
Cochabamba; the interface is the warm paper it is pinned on. So the frame stays 90 % neutral (warm
ground, white cards, warm near-black ink, one hairline) and the Aguayo palette works as signals,
one job per color. The brand shows in three precise places: the 3 px aguayo stripe at the top of
the app, the fuchsia of the one action, and the orange ★ of the yapita.

Mode: Operate. People scan, act and leave, on a cheap phone, one-handed, with bad signal.
Familiar patterns win over novelty; craft is in spacing, type and the states.

## Color: one job each

| Token | Job | Never |
|---|---|---|
| `--color-brand` fuchsia `#C2185B` | the main action (primary button, FAB), links, focus ring, the current tab, marked states (Me sirvió given) | decoration, large surfaces |
| `--color-yapita` orange `#F28C28` | the yapita: the drawn-star disc (`Yapita`) next to every amount, hints and the reward line | text, tabs, buttons |
| `--color-yellow` aguayo yellow `#F2C230` | the price as a letrero in the detail (`.letrero-price`, wiki #148): a painted sign at weight 600 (the one place a title face goes past 500) with the aguayo stripe under it | anything else |
| `--color-ok` green `#2E9E5B` | «Solucionada» and «Confirmado» tags, as a fill with ink text | text |
| `--color-info` blue `#1E5AA8` | information notices (`.notice`, «Red de pruebas, sin dinero real») | actions |
| `--color-urgent` coral | «Urgente», on its soft fill with its dark text | text on light |
| `--aguayo` stripe | 3 px at the top of the app, and the top of the profile card in Yo | a background, a pattern, a divider |
| warm neutrals | everything else: `--color-bg`, `--color-card`, `--color-sunken`, `--color-ink`, `--color-muted`, `--color-line` | violet tints (OKLCH hue 270-330) |

- Exactly one filled fuchsia button per view: the main action. Everything else is the secondary
  outline, an icon button or a link.
- Selected filter chips are ink, not fuchsia, so fuchsia always means «do this».
- Orange, green and coral fail 4.5:1 as text on light grounds: fills and glyphs only, with ink on
  top. Reading text is `--color-ink`; `--color-muted` (5.3:1) only for meta, dates and labels.
- **The phone's theme is the default** (wiki #201, replaces #143): `index.html` sets `data-theme` before the
  first paint from `localStorage["bs-theme"]` (`system` by default, or `light` / `dark` fixed). Dark styles
  always come in pairs: `:root[data-theme='dark']` and `@media (prefers-color-scheme: dark)` with
  `:root:not([data-theme='light'])`.
  Ajustes › Tema writes that key. Dark is a warm night (`#151110` ground), never violet. Fuchsia text becomes
  `--color-brand-text` `#F6A3C3` there; the focus ring follows.
- Neutrals moved from the prototype's violet-tinted ink and lines to warm ones on 20 Nov; the
  Aguayo colors are unchanged.

## Type

- **Bricolage Grotesque** (titles, prices, the city name, amounts) at 500; 600 only for the
  wordmark. Tight tracking (-1.5 % to -2.5 %). Warm and a little local, without shouting.
- **Figtree** (everything people read and tap) at 400; 500 for buttons, chips and labels; 600 for
  the current tab and badges.
- Scale in rem (follows the phone's text size, tested at 130 %): display 28 · h2 22 · card title
  18 · body 16 · small 14 · label 13. Nothing under 13 px. Body line height 1.5.
- Sentence case everywhere; no tracked capitals. Amounts and counts use tabular figures (`.num`).
- Never 700/800, never bold-and-big headings: size and tracking carry hierarchy.

## Space, shape, depth

- 4-based spacing tokens `--s-1`…`--s-8` (4, 8, 12, 16, 24, 32, 48, 64) for every gap and padding.
  Gutter 16 px; cards 12 px apart.
- One round family: `--r-sm` 10 (small controls), `--r-md` 16 (photos, panels, notices),
  `--r-lg` 24 (cards, sheets), `--r-pill` (buttons, chips, tags, inputs, balance).
- Depth by hairline (`--hairline`, ink at 12 %), not shadows. Only things that float over content
  cast one (`--shadow-float`: the FAB, sheets). A linked card gains `--shadow-hover` only on hover
  with a fine pointer. No thick borders, no hard offset shadows (the prototype's look is retired).

## Components

- **Top bar:** aguayo stripe, then logo · city (Bricolage 18, native picker) · bell · balance.
  Opaque, one hairline under it, never blurred, shrinking or hiding.
- **Balance:** neutral pill with the orange ★ disc and the number in Bricolage. Opens Movimientos.
- **Bottom nav:** full width at the foot on the card ground with a top hairline. The current tab
  fills a pill behind its icon with `--color-brand-soft`; its label turns ink at 600. No floating
  pill nav.
- **FAB:** the tab's one main action («Subir», «Preguntar») as a fuchsia pill with `+`, above the
  nav on the right, with the float shadow.
- **Screen title:** the tab's name in display size once per screen («¿Alguien sabe?», «Yo»). Hoy keeps
  «Hoy en <ciudad>» for screen readers only: the city is already in the top bar, and the grid shows more
  photos above the fold (SPEC 27).
- **Hoy grid** (`SignTile`, `sign-tile.css`, wiki #138-140, #142): open tiles on the ground, no
  card box; 2 columns on a phone, 3 from 40 rem, 4 from 90 rem. Photo 4:5 (`--r-md`) with the price
  pill on its bottom-left and Guardar as a 44 px round button on its top-right; title 2 lines max;
  zone · time; «A N les sirvió». The whole tile opens the detail (stretched button). The grid loads
  `thumbUrl` (480 px), lazily. The list is grouped under **Hoy · Esta semana · Antes**; «Antes»
  says «Puede estar desactualizado» once, in its header, never on each tile.
- **Letrero detail** (`SignSheet`, wiki #139, #141): a page on a phone (← Volver), a window over the
  grid on desktop (✕, scrim, Escape). Big photo, price in display size, title, zone, author,
  «A N les sirvió», tags; Guardar and ⋯ in its bar; **Me sirvió** is the one filled button, with
  Cómo llegar as the secondary. It opens with a rise and closes in 160 ms; focus moves in and back
  to the tile; the page behind does not scroll.
- **Lupa** (wiki #140): appears in the top bar only once the screen's own search has scrolled out
  of view (fade in, 200 ms); it scrolls back and focuses the search. Hidden, it takes no focus.
- **Letrero card** (`.card.sign`, retired from Hoy; kept for single views such as Mis letreros): the photo first (4:3, `--r-md`, inset 8 px in the card), the
  price on a solid card-colored pill over its bottom-left corner, then the title (18), one meta line
  (zone · author · time, with a pin glyph), then actions: «Me sirvió · N» as a secondary pill,
  Guardar and ⋯ as icon buttons on the right.
- **Search:** sunken pill input, 48 px, 16 px text; on focus it turns card-white with a fuchsia
  border and a 3 px soft ring.
- **Chips:** outline pills, 44 px tall; selected = ink fill, ground-colored text. Always inside
  `ChipRow`: the row bleeds to the column edges and fades only on the side where chips are hidden.
  With a mouse it adds round arrow buttons beside the row (never over a chip; «anterior» appears
  once the row has moved) and the vertical wheel scrolls sideways; touch swipes.
- **Tags:** 13 px/500 pills. Neutral by default; `--urgent`, `--ok`, `--info`, `--muted`
  (outlined, for «Pendiente»).
- **Rows** (Movimientos, Ajustes, avisos): 56 px rows closed by a hairline; leading glyph, the text
  with a meta line (`.row__main`), and a narrow trailing column (`.row__end`): the amount in
  Bricolage with a real minus (−5) and its state under it.
- **State in lists** (`.state`): quiet when all is well (green dot + «Confirmado» in muted text),
  outlined dot for «Pendiente», coral for «Error». A loud colored tag repeated on every row is noise.
- **Linked cards** open with a stretched button on the title (`.sign__open`): the whole card is
  one tap target and works by keyboard; the action buttons sit above it. On touch the card answers
  the finger (scale .99).
- **Notice:** one line of information on the blue soft fill.
- **Skeleton:** sunken blocks with a slow breath (1.6 s opacity), never a shimmer sweep.
- **Tilcho:** not in the app (wiki #191), not even in Yo.

## Overlays, states and the soft wall

- **Sheet** (`Sheet.tsx`, `sheet.css`) is the one overlay: `page` (phone full screen) or `bottom`
  (rises from the foot); a window over a scrim on desktop. Android back, Escape and the scrim close
  the top sheet first (it pushes a history entry); the page behind and any sheet below are `inert`;
  focus moves in and back. Actions sit in a two-column footer; a message takes its own row above.
- **Soft wall** (`AuthGate` + `AuthSheet`, wiki #146): any action that needs an account calls
  `requireAccount(reason, action)`. The sheet says why in one line, offers Google or e-mail, and
  runs the pending action after signing in. Looking never needs an account.
- **Detail actions** (wiki #154-155): the filled button appears only when it can act — «Me sirvió»
  on someone else's letrero you have not rated, «Compartir» (WhatsApp) on your own. Once rated, the
  slot shows the marked state «Te sirvió» / «No te sirvió». «Cómo llegar» is always the secondary;
  sharing someone else's letrero is an icon in the sheet bar; ⋯ opens a `bottom` sheet over the
  detail (wiki #159): No me sirvió and Reportar, or **Borrar** on your own letrero, red
  (`--color-danger`, the one destructive color) and always confirmed.
  Each view change inside the sheet moves focus to that view's heading, which names the letrero.
- **The public record** (wiki #157, #164): each Movimientos row links «Ver registro» to the explorer
  (the short hash lives in its accessible name), and Yo has «Mi cuenta de prueba»: one plain line
  («Cada yapita queda anotada en un registro público que nadie puede cambiar»), the short address,
  Copiar and «Ver mi registro público». Neighbor words, never cripto.
- **FAB** folds to its «+» while the list scrolls down and unfolds on the way up (wiki #158); the
  desktop rail's «+» keeps its verb under it.
- **«Me sirvió»** (wiki #147, #160): after it lands, the large yapita settles in (520 ms, no
  overshoot) beside «¡Gracias, pues!» and «<nombre> recibe +1 yapita por ayudarte» on the yapita-soft fill and the button stays marked «Te sirvió». Never a dimmed button.
- **States** (wiki #153): errors say «Algo falló, intenta de nuevo» or «Sin conexión, intenta de
  nuevo» with Reintentar as a secondary button; no results say «No encontramos letreros con eso»
  with Quitar filtros; an active filter shows a one-line summary with a count and Quitar filtros.
  `OfflineBanner` sits under the top bar. Developer messages never reach the screen.
- **Hints** (`Hint`, wiki #149): one line on the yapita-soft fill the first time a tab opens,
  closed with ✕ forever (per device).
- **Icons** are drawn SVG in one 1.75 stroke; the yapita star is a drawn shape, never the ★ glyph.
  Google's G keeps its own colors.

## Motion

- One ease-out `--ease` cubic-bezier(.2,.8,.2,1); `--ease-enter` for things settling. No bounce
  or overshoot. Transform, opacity and colors only.
  - **Exception (height):** opening and closing a list may animate its height, so the page does not jump
    (only Movimientos «Ver más» / «Ver menos»).
  - **Exception (bounce):** the new-notice celebration (the bell rings, the bubble bounces, sparkles; wiki #216)
    is the one bounce in the app.
  - **Exception (height), also:** the «Sin conexión» banner sliding in and out, and a hint collapsing when closed
    (SPEC 28): without it the page jumps.
- **Attention details** (SPEC 28) play only on a change after the screen opened (`useChangeTick`,
  `useArrivedIds` in `src/components/motion.ts`), never on load, so they mark news:
  - **Pulse:** grows and settles back to its resting size, never below it. The ★ of the top-bar balance when it
    goes up (to 1.15, with a fading orange glow, ~420 ms); the Guardar bookmark when it becomes saved (from 0.85 to
    1).
  - **Swap:** a value or tag that changes in place cross-fades (`yo-fade`, `tag-in`): balances, «A N les sirvió»,
    «Copiar» ↔ «Copiado», «Solucionada» / «Cerrada».
  - **Arrival:** an answer or comment that comes in while the question is open rises 8 px and starts on the brand's
    soft tint, fading to its own fill in about 2 s.
  - **Breathing dot:** an active «Urgente» carries a small coral dot that breathes with opacity only (1.6 s). It is
    a loop like skeletons and spinners, and the only decorative one; still with reduced motion.
- Timings are tokens in `tokens.css`: `--m-press` 90, `--m-out` 120, `--m-in` 150, `--m-panel` 200,
  `--m-sheet-in` 260 (a sheet rises), `--m-exit` 160 (sheets and toasts leave; `EXIT_MS` in `Sheet.tsx` is the
  same value for waits in code), `--m-image` 600, `--m-theme` 260. Loops (skeleton, spinner) keep their own.
- Press, by size (touch included): small targets (buttons, icon buttons, links, chips, tabs) go 1 px down and
  scale .985 in `--m-press`; full-width rows (Ajustes, Avisos, Mi actividad) only take the sunken background.
  Disabled controls do not move.
- Hover (fine pointer only): buttons step 1 px up and darken 14 %; a linked card lifts 2 px and its
  photo zooms to 1.03 inside its frame over 600 ms.
- Panels and the tab pill: 200 ms. Nothing fades or rises in on scroll; no parallax, carousels or
  auto-advancing anything.
- **Navigation** (`src/components/transition.ts`, View Transitions API): every screen change goes
  through `navigateWithTransition(update, direction)`. The top bar, bottom nav and FAB stay put;
  only the screen moves, as a fade-through: the old one fades out in 110 ms, then the new one fades
  in over 220 ms while it slides 12 px in the direction of travel (`forward` from the right, `back`
  from the left, `up` from below for a detail or a sheet). The two never show at once. The
  transition snapshots the viewport (the root), never the whole feed: a named element as tall as
  the feed makes a scrolled list jump. The FAB swaps its label without morphing (the old pill hides,
  the new one fades in from .94). Tab order sets the direction. A new tab lands at the top; tapping
  the current tab scrolls it back to the top. No API or reduced motion: the change is instant.
- Reduced motion: everything rests; state still shows through color.

## Voice

Copy comes from the wiki, in Bolivian Spanish: friendly and direct, «¡Ya está!», «Chuta»,
«Gracias, pues», greeting by time of day. Buttons are a verb and an object («Subir letrero»,
«Pedir contacto»). The currency is always «yapitas» with the ★; never XLM, tokens, cripto,
blockchain, «puntos» alone or bolivianos.

## Responsive

- 360 px is the design frame; check 768 and 1280, light and dark, text at 130 %.
- Large text: the top bar stays one row; «Entrar» becomes a person icon and the city truncates
  (wiki #161). Bottom sheets carry a grabber and a top hairline; the dark scrim is 62 % black.
- Desktop below 101 rem: the sidebar becomes a rail (icons with their names under them, the + of
  the main action), so the full 64 rem frame still fits centered (wiki #151).
- Desktop (1024 px+): **the feed is centered on the full width** (wiki #144); the sidebar hangs in
  the left margin against it (both margins at least the sidebar's width, so the center never
  moves). The Hoy grid picks its columns from the feed's own width (container query: 2, 3 from
  36 rem, 4 from 56 rem). **Every tab uses the same frame** (`--frame`, 64 rem, wiki #145), so
  nothing jumps when switching tabs; only how the frame is divided changes. Per tab
  (`data-layout`, wiki #141): **Hoy** sidebar +
  a wide grid (max 64 rem), letreros open in a window; **¿Alguien sabe?** sidebar + list (40 rem) +
  conversation panel, with a dashed hint while nothing is open; **Yo** the profile card beside
  its lists (`.yo-grid`, two columns from 48 rem of frame). The panel exists only where it adds something a card cannot show (the conversation).
- A number never breaks from its unit: «hace 1 h» uses a no-break space.

## Open items

- The F5 logo is dark ink: on the dark ground it sits on a light tile for now; it needs a light
  variant (Yaeko).
- Photographs in the mock adapter are flat color tiles; real letreros will carry the color.
