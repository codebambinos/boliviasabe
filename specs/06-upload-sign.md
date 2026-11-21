# SPEC 06 — Upload a letrero

> **Status:** Implemented
> **Depends on:** SPEC 01 (data layer and mock adapter), SPEC 04 (app routes and `ShellLayout`), SPEC 05 (Hoy screen). Board card: T19 (issue #12).
> **Date:** 2026-11-20
> **Objective:** Make the «Subir letrero» button open a full-screen form (photo, title, Más detalles, Publicar) that compresses the photo, keeps a saved draft, publishes through `src/data` and shows the +1.

## Why this spec exists

The floating «Subir letrero» button already exists in `AppShell`, but in `ShellLayout` it only asks
for an account and then does nothing (`() => undefined`). Without it nobody can add letreros or
earn their first yapita in the demo. The data layer already has `signs.create` and the mock adapter
answers it, so T19 can be done end to end on the mock, as T18 was.

## Scope

**In:**

- Wiki first: decision **#167** in `huecos-cerrados.md` + an entry in `log.md` with the new copy
  (form, errors, publish notices) and «T19 builds the saved draft and the 480 px thumbnail».
- `NewSign` in `src/data/api.ts` gains `thumb: Blob` (480 px, wiki #142) and `city?: City` (only
  used while the profile is pending, see Decisions). The mock adapter stores both.
- `src/components/photo.ts`: rejects files over 10 MB or that are not images, and returns a 1280 px
  photo and a 480 px thumbnail (longest side, JPEG 0.8, EXIF orientation applied).
- `src/components/draft.ts`: a small draft store. Text in `localStorage`, photo in IndexedDB. One
  draft per kind (`'sign'` now; T15 and T20 can reuse it). Saves while you type, cleared on publish
  or on «Descartar».
- `src/components/UploadSignSheet.tsx` + `upload-sign-sheet.css`: the form inside the existing
  `Sheet` (`variant="page"`: full screen on a phone, a window on desktop).
  - **Foto** (required): «Tomar foto» opens the rear camera (`capture="environment"`); «Elegir de
    la galería» opens the picker. After choosing, a preview with «Cambiar foto».
  - **Título** (required, 3-80, with a counter).
  - **Más detalles** (folded): Precio (free text, e.g. «Bs 38»), Zona (default: your zone, with the
    city's suggested zones and free text), up to 3 of the 18 tags (the 4th cannot be marked), and
    the Maps link (if it does not start with `https://` → «Pega un enlace de Google Maps»).
  - **Publicar**: disabled until there are photo and title, and the line under it says what is
    missing. If the top bar shows another city: «Se publicará en <tu ciudad>».
  - While publishing, the button says «Publicando…» and cannot be pressed twice.
  - Failure: photo and text stay, «No pudimos subirlo, intenta de nuevo» (offline: «Sin conexión,
    intenta de nuevo») + Reintentar.
  - Closing (✕, Volver, Android back, Escape) with a photo or text asks «¿Descartar el letrero?»
    with Descartar / Seguir editando. With nothing written it just closes.
- `src/components/Toast.tsx` + `toast.css`: a short notice (`role="status"`, about 4 s) above the
  tab bar, used for the publish result.
- `ShellLayout`: the Hoy button runs `requireAccount(reason, () => setUploading(true))`. It renders
  `UploadSignSheet`. On success it closes the form, switches the city to the letrero's city, scrolls
  Hoy to the top (the new letrero is first) and shows the notice:
  - `rewarded: true` → «¡Publicado! Ganaste +1 yapita» (with the yapita icon).
  - `rewarded: false` → «Publicado. Ya subiste 10 letreros hoy, este va sin premio».
- A guest who taps the button gets «Crea tu cuenta para seguir». After signing in (mock), the form
  opens on its own.

**Out of scope (for future specs):**

- The Supabase adapter for `signs.create` (Storage upload of photo and thumb, insert). Diego, with
  the rest of the Supabase adapter.
- The real Stellar +1 (T17). The screen only reads `rewarded`.
- Restoring the draft after the Google redirect, and saving the pending action (T15, Diego). T15
  reuses `draft.ts`.
- «Tu barrio» and the profile's city and zone (T16).
- Editing a letrero after publishing. The wiki has no edit flow.
- Server-side limits and anti-abuse (T23).
- Preguntar's form (T20). It may reuse `photo.ts`, `draft.ts` and `Toast` later.

## Data model

Changes to the contract in `src/data/api.ts`:

```ts
export type NewSign = {
  title: string;
  /** 1280 px on the longest side, JPEG 0.8. Compressed by the screen (wiki #34). */
  photo: Blob;
  /** 480 px thumbnail for the Hoy grid (wiki #142). */
  thumb: Blob;
  price?: string;
  /** Defaults to the user's zone. */
  zone?: string;
  /** Only while the profile is pending (no «Tu barrio» yet). The profile's city wins. */
  city?: City;
  tags?: Tag[];
  mapsUrl?: string;
};
```

Mock adapter: `create` stores `thumbUrl` from `thumb`, uses `user.city ?? input.city`, and accepts a
signed-in user with no profile (zone required then). Validation errors keep using `DataError`
(`'validation'`, with `field`).

New modules:

```ts
// src/components/photo.ts
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export class PhotoError extends Error { reason: 'too-big' | 'not-image' }
export function preparePhoto(file: File): Promise<{ photo: Blob; thumb: Blob }>;

// src/components/draft.ts
export type DraftKind = 'sign';
export type SignDraft = {
  title: string; price: string; zone: string; tags: Tag[]; mapsUrl: string;
  detailsOpen: boolean; hasPhoto: boolean;
};
export function loadDraft(kind: DraftKind): Promise<{ text: SignDraft | null; photo: Blob | null; thumb: Blob | null }>;
export function saveDraftText(kind: DraftKind, text: SignDraft): void;          // localStorage `bs:draft:sign`
export function saveDraftPhoto(kind: DraftKind, photo: Blob, thumb: Blob): Promise<void>; // IndexedDB `boliviasabe` › `drafts`
export function clearDraft(kind: DraftKind): Promise<void>;

// src/components/UploadSignSheet.tsx
type UploadSignSheetProps = {
  viewingCity: City;                                   // for «Se publicará en <tu ciudad>»
  onClose: () => void;
  onPublished: (result: { sign: Sign; rewarded: boolean }) => void;
};

// src/components/Toast.tsx
type ToastProps = { message: ReactNode; onDone: () => void };
```

Every read and write in `draft.ts` is in `try/catch`. If storage fails (private mode, full), the
form still works and only the draft is lost.

## Implementation plan

1. **Wiki.** Add #167 to `huecos-cerrados.md` and the entry to `log.md` in `../boliviasabe-docs`
   with the copy of this spec. Commit there.
2. **Contract and mock.** Add `thumb` and `city?` to `NewSign`, update the mock's `create`
   (`thumbUrl`, city fallback, no-profile case). `npm run typecheck` passes.
3. **`photo.ts`.** `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas →
   `toBlob('image/jpeg', 0.8)` at 1280 and 480 px. Rejects > 10 MB and non-images.
4. **`draft.ts`.** localStorage text + IndexedDB photo, all wrapped in `try/catch`.
5. **`Toast`.** Component, CSS with tokens, reduced motion without movement.
6. **`UploadSignSheet`.** Form, validation, missing-field line, «Se publicará en…», Publicando,
   failure + Reintentar, discard confirmation, draft restore on open and save on change.
7. **Wire it in `ShellLayout`.** `requireAccount` → open the form. `onPublished` → close, set the
   city, scroll to top, notice.
8. **Verify** the acceptance list on the mock at 360, 768 and 1280 px, light and dark, text at 130 %,
   in Chrome Android (or the touch emulation) and Safari iPhone if available. Open the PR with
   `Closes #12`, move the card to In Review, and tell Diego about the `NewSign` change and
   `draft.ts`.

## Acceptance criteria

- [x] `huecos-cerrados.md` has #167 and `log.md` has its entry, before the code PR.
- [x] As a guest, «Subir letrero» opens «Crea tu cuenta para seguir». After signing in, the form opens.
- [x] With an account, «Subir letrero» (FAB on the phone, «Subir» in the desktop rail) opens the form full screen on a 360 px phone and as a window on desktop.
- [x] «Tomar foto» opens the rear camera on Android Chrome and iPhone Safari. «Elegir de la galería» opens the gallery.
- [x] A photo over 10 MB or a non-image file shows an error and the form keeps what it had.
- [x] The uploaded photo is at most 1280 px on its longest side and the thumbnail at most 480 px, both JPEG. A portrait phone photo is not rotated.
- [x] Publicar is disabled until there are photo and a title of 3+ characters, and the line under it says what is missing.
- [x] The title does not accept more than 80 characters.
- [x] Más detalles is folded on open. A 4th tag cannot be marked. Zona defaults to the profile's zone.
- [x] A Maps link that does not start with `https://` shows «Pega un enlace de Google Maps» and blocks Publicar.
- [x] Viewing another city shows «Se publicará en <tu ciudad>».
- [x] Publishing closes the form, Hoy shows the letrero's city at the top with the new letrero first, and the notice says «¡Publicado! Ganaste +1 yapita». The balance goes up by 1.
- [x] The 11th letrero of the day is published and the notice says «Publicado. Ya subiste 10 letreros hoy, este va sin premio». The balance does not change.
- [x] Publicar cannot be pressed twice; it says «Publicando…» while it works.
- [x] A failed publish (mock failure, or network off) keeps photo and text and shows «No pudimos subirlo, intenta de nuevo» or «Sin conexión, intenta de nuevo» + Reintentar.
- [x] Reloading the page with a half-filled form and opening «Subir letrero» again brings back photo and text.
- [x] Closing with something written asks «¿Descartar el letrero?». Descartar clears the draft; Seguir editando keeps it.
- [x] After publishing, opening the form again shows it empty.
- [x] The form works with storage blocked (private window): it publishes, only the draft is lost.
- [x] The tile in Hoy uses the thumbnail and the detail uses the 1280 px photo.
- [x] Focus goes into the form on open and back to the button on close. Every field has a label.
- [x] No horizontal scroll at 360 px. Light and dark, text at 130 %.
- [x] No on-screen text says «puntos» alone, «XLM», «cripto», «blockchain» or an amount in bolivianos.
- [x] No file under `src/pages/` or `src/components/` imports `@supabase/supabase-js` or `src/data/mock`.
- [x] `npm run typecheck` and `npm run build` pass. CI is green.
- [x] The PR body has `Closes #12`.

## Decisions

- **Yes:** the form is a full-screen `Sheet`, not a `/subir` route. It reuses the overlay that
  already handles Android back, focus and inert background, and it does not touch Diego's router.
- **Yes:** `thumb: Blob` in `NewSign`. The browser already has the decoded image, so making the
  480 px copy there is cheap and follows #142. Diego uploads both in the Supabase adapter.
- **Yes:** T19 builds `draft.ts` (text in `localStorage`, photo in IndexedDB, as `tecnico.md` says).
  T19 needs it for «con la red apagada no pierde nada» and T15 reuses it for the Google redirect.
- **Yes:** after publishing, the form closes and Hoy goes to the top with a short notice. The wiki
  says the letrero «aparece primero en la lista».
- **Yes:** «¿Descartar el letrero?» on close with content. Otherwise a closed form would silently
  keep a draft, or lose work by accident.
- **Yes:** with an account but no profile (T16 not done), the letrero goes to the city on screen and
  the zone must be filled. That case disappears once «Tu barrio» exists.
- **Yes:** the new copy goes to the wiki first as #167 (CLAUDE.md).
- **No:** an image library for compression. Canvas does it in about 40 lines.
- **No:** converting HEIC by hand. iPhone Safari already hands JPEG to `<input type="file">`.
- **No:** a global toast system. One small `Toast` in the shell is enough for now.

## Risks

| Risk | Mitigation |
| --- | --- |
| `createImageBitmap` with `imageOrientation` is missing in an old Safari | Fall back to `<img>` + canvas. Modern browsers apply EXIF orientation to `<img>` by default. |
| Canvas on a cheap phone runs out of memory with a big photo | The 10 MB limit, and drawing the 480 px thumb from the 1280 px result, not from the original. |
| IndexedDB is blocked or full | Every draft call is in `try/catch`. The form keeps working without a draft. |
| Diego's Supabase adapter does not yet send `thumb` | The `Sign` type already falls back to `photoUrl` when there is no thumbnail. Tell him about the contract change in the PR. |
| T15 changes `ShellLayout` at the same time | The change there is small (open the sheet, toast). Tell Diego before merging. |
| `capture` is ignored by desktop browsers | Expected: on desktop both buttons open the file picker. |

## What is **not** in this spec

- The Supabase adapter and Storage upload (Diego).
- The real Stellar +1 (T17).
- Restoring after Google and the pending action (T15).
- «Tu barrio» (T16).
- Editing a letrero.
- Server-side limits (T23).
- Preguntar's form (T20).

Each one of those, if it lands, goes in its own spec or task.
