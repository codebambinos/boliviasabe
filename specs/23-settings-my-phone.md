# SPEC 23 — Ajustes: Mi celular and the final order

> **Status:** Approved
> **Depends on:** SPEC 12 (`contact.myPhone`, `PhoneField`, `clean_phone`), SPEC 15 (`NotificationSettings`), SPEC 16 (`InstallRow`), SPEC 21 (Yo cards, `withThemeReveal`, spinner and motion). Board card: T29 (issue #22).
> **Date:** 2026-11-21
> **Objective:** Finish Yo › Ajustes: add «Mi celular» (add, change or delete the phone shared on «Pedir contacto») and put the card in the wiki order.

## Why this spec exists

Since #182 the phone for «Pedir contacto» is typed in the contact sheet and saved in the profile, «and Ajustes will edit it later». Ajustes (T29) is that place, and it still has no «Mi celular».
`useMyPhone` can read the phone, but nothing can change or delete it outside a contact request.
The Ajustes card is also still the one T26/T27 left inside `src/pages/YoPage.tsx`, in an order that is not the wiki's (`flujo-final` › 3 · Yo › Ajustes).

## Scope

**In:**

- **Final order of the card:** Instalar la app · Notificaciones · **Mi celular** · Tema · Acerca de · Privacidad · Cerrar sesión.
- **Mi celular row:** phone icon, «Mi celular», and below it the saved number as typed, or «Sin agregar». Tapping it opens the sheet.
- **Mi celular sheet** (`Sheet`, `variant="bottom"`), title «Mi celular»:
  - One line: «Lo compartimos solo cuando aceptas un pedido de contacto. Tu correo se comparte siempre.»
  - The field «Tu celular (opcional)»: the same `PhoneField` as the contact sheet, prefilled with the saved number.
  - **Guardar:** off while the value is the saved one; on save, spinner + «Guardando…» (like «Editar» in SPEC 21), then the sheet closes and a toast says «Guardado».
  - **Borrar** (only when a number is saved): deletes it at once, closes the sheet and the toast says «Celular borrado». No confirmation: it is easy to type again.
  - Saving an empty field is the same as Borrar.
  - Invalid number → the same message as the contact sheet under the field: «Revisa el número: solo números, espacios y un + al inicio». Guardar stays on so the person can fix it.
  - Offline or server error → the app's usual message (`errorMessage`), the sheet stays open with what was typed.
- **Validation in the app**, the same rule as `clean_phone` (`0006`): trimmed; empty = delete; otherwise `^\+?[0-9][0-9 ()-]{5,19}$`.
- After saving or deleting, the contact sheet prefills the new value (it reads `keys.myPhone()`).
- **Cerrar sesión** stays direct, one tap (wiki #152).
- **SettingsCard** moves out of `YoPage.tsx` into its own component, with Tema (and its `withThemeReveal`) unchanged.
- **Motion** (off with «reducir movimiento»): the sheet enters and leaves like the others; the number in the row cross-fades when it changes (`yo-fade`); spinner while saving; the toast rises like the others.

**Out of scope:**

- A server function or migration to validate the phone (the app validates; see Decisions).
- Showing the phone anywhere else, or sharing it outside an accepted contact request.
- Changing the e-mail, deleting the account (out of the MVP, wiki › Ajustes) or a confirmation for «Cerrar sesión».
- Notificaciones (T27), Instalar (T26) and Tema behavior: only their position changes.
- Avisos (T24, T40).

## Data model

No new tables, columns or migrations. `profiles.phone` already exists and the owner can update it (`0002_rls.sql`: `grant update (… phone …)` + `profiles_update_owner`).

New in `src/data/`:

```ts
// api.ts › contact
/** Saves the caller's phone for «Pedir contacto» (wiki #182). null or '' deletes it. Rejects with `validation` (field `phone`). */
setMyPhone(phone: string | null): Promise<string | null>;
```

- **Supabase adapter** (`src/data/supabase/threads.ts`): validates with the shared rule, then `update profiles set phone = <clean or null> where id = requireMe().id`; returns the saved value.
- **Mock adapter** (`src/data/mock/adapter.ts`): same validation, sets `requireUser().phone`.
- **Shared rule** `cleanPhone(raw: string): string | null` in `src/data/phone.ts` (throws `DataError('validation', …, { field: 'phone' })`), used by both adapters so they match `clean_phone`.
- **Hook** `useSetMyPhone()` in `src/data/hooks/threads.ts`: calls `api.contact.setMyPhone` and, on success, sets `keys.myPhone()` to the returned value (no refetch flash).

## Implementation plan

1. **Wiki first** (`boliviasabe-docs`): new row in `huecos-cerrados.md` (next free number) with the Mi celular row and sheet, its texts («Sin agregar», the sharing line, «Guardado», «Celular borrado»), Borrar without confirmation and the final order; `flujo-final.md` › Ajustes points to it; entry in `log.md`.
2. **Data:** `cleanPhone` in `src/data/phone.ts`, `setMyPhone` in `api.ts`, Supabase and mock adapters, `useSetMyPhone`. `npm run typecheck`.
3. **Export `PhoneField`** (and its error text) from `src/components/ContactRequest.tsx` so the sheet reuses it; the contact sheet keeps working the same.
4. **`MyPhoneSheet`** (`src/components/MyPhoneSheet.tsx`): field, Guardar with spinner, Borrar, errors, closes on success and reports which toast to show.
5. **`SettingsCard`** (`src/components/SettingsCard.tsx`): moved from `YoPage.tsx`, in the final order, with the Mi celular row (`useMyPhone`), the sheet and the toasts. `YoPage.tsx` only renders it.
6. **Motion:** row value cross-fade, spinner, toast; all respecting «reducir movimiento».
7. **Check** at 360 px, light and dark, text at 130 %, with the mock and with Supabase (seed accounts): add, change, delete, invalid number, then «Pedir contacto» prefills the new value.

## Acceptance criteria

- [ ] Ajustes shows, in this order: Instalar la app, Notificaciones, Mi celular, Tema, Acerca de, Privacidad, Cerrar sesión.
- [ ] The Mi celular row shows the saved number, or «Sin agregar» when there is none.
- [ ] Tapping the row opens the «Mi celular» sheet with the sharing line and the field prefilled.
- [ ] Guardar is off until the value differs from the saved one; while saving it shows the spinner and «Guardando…».
- [ ] Saving a valid number closes the sheet, shows «Guardado» and the row shows the new number without a reload; after a reload it is still there (mock: same visit; Supabase: in `profiles.phone`).
- [ ] Borrar (or saving an empty field) deletes it, closes the sheet, shows «Celular borrado» and the row says «Sin agregar».
- [ ] «abc», «12» or a 25-digit number shows «Revisa el número: solo números, espacios y un + al inicio» and nothing is saved.
- [ ] Without signal the sheet stays open with what was typed and shows the usual offline message.
- [ ] After changing the phone in Ajustes, «Pedir contacto» and «Aceptar» prefill the new value.
- [ ] «Cerrar sesión» still signs out in one tap and returns to Hoy as a guest.
- [ ] Tema still switches on in a circle from the tapped option (SPEC 21).
- [ ] The row value cross-fades, the sheet and toast animate; with «reducir movimiento» nothing moves.
- [ ] Works at 360 px in light and dark with text at 130 %; touch targets ≥ 44 px; the keyboard does not hide Guardar.
- [ ] The wiki has the new huecos row and the log entry.
- [ ] `npm run typecheck` and `npm run build` pass; `git grep -i "SECRET\|SERVICE_ROLE"` shows no values.

## Changes during implementation

- **Toast in a portal** (`src/components/Toast.tsx`): a toast rendered inside `.shell__main` (a size container) was positioned against the page content, not the screen, so on a long page like Yo it ended up out of view. It is now drawn in `<body>`, like the sheets. This also fixes the «Guardado» of «Editar» from SPEC 21.
- **Borrar shows the spinner too** («Borrando…») while it works, so both buttons say what is happening; the close button and the scrim are off meanwhile.
- **`cleanPhone` moved** from the mock adapter to `src/data/phone.ts`, so the mock, the Supabase adapter and «Pedir contacto» share one rule. As in `clean_phone`, the first character must be a digit or «+»: «(4) 422-1234» is rejected.
- The wiki row is **#215**.
- **Spec number:** written as SPEC 22, renumbered to **SPEC 23** after pulling main, where SPEC 22 is the Avisos data (T40). Its `src/data` changes merged cleanly with these; only an import line needed joining.

## Decisions

- **Yes:** a row that opens a sheet. The card stays short like Instalar and Acerca de, and the sheet keeps Guardar above the keyboard at 360 px. (User's choice.)
- **No:** the field inline in the card: the card grows and the keyboard covers the bottom.
- **Yes:** validate in the app with the same rule as `clean_phone`, and update `profiles.phone` directly. No migration for Diego hours before the deadline. (User's choice.)
- **No:** a `set_my_phone` SQL function. Stricter, but a production migration now; the phone only reaches a person after «Aceptar», and the RPCs of SPEC 12 still run `clean_phone` when a phone is typed there.
- **Yes:** «Cerrar sesión» stays one tap (wiki #152). A confirmation would be a flow change. (User's choice.)
- **Yes:** Borrar without confirmation: the number is easy to type again and nothing else is lost.
- **Yes:** the same motion as SPEC 21 (sheet, spinner, toast, cross-fade). (User's choice.)
- **Yes:** `useSetMyPhone` writes the result into the cache instead of refetching, so the row never flashes the old number.

## Risks

- **A phone saved outside the app** (direct API call) skips the app's check. It only affects the person's own profile and is shown only to someone they accepted; the contact RPCs still validate what is typed there.
- **Two places edit the same phone** (Ajustes and the contact sheet). Both read and write `keys.myPhone()`, so the last save wins and both show it.
- **`YoPage.tsx` and the Ajustes card** are also touched by T24 (the Avisos entry). Moving Ajustes to its own file keeps the two changes apart.
