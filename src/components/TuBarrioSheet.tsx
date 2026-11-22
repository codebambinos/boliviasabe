// «Tu barrio» (wiki › flujo-final › 0 · Entrada y cuenta, #170, SPEC 08): name, city and zone, once.
// Closing it without finishing keeps the session; the next action opens it again (#111).
// Yo › «Editar» reuses it (SPEC 21, #213): title «Editar», the current profile prefilled and «Guardar».
import { useId, useState } from 'react';
import { CITIES, DEFAULT_CITY, SUGGESTED_ZONES, useEditProfile, useSaveProfile, type City, type ProfileInput } from '../data';
import { ArrowLeftIcon, CloseIcon } from './icons';
import { errorMessage } from './messages';
import { Sheet } from './Sheet';
import './tu-barrio-sheet.css';
import './upload-sign-sheet.css'; // .upload__spinner, the app's in-button loader

const NAME_MIN = 2;
const NAME_MAX = 60;
const ZONE_MAX = 60;

type TuBarrioSheetProps = {
  /** The name Google already knows, to prefill the field. */
  suggestedName?: string;
  /** «Editar» from Yo: the current profile. Without it, this is the first «Tu barrio». */
  initial?: ProfileInput;
  /** Called once the profile is saved, before the sheet leaves. */
  onSaved: (input: ProfileInput) => void;
  onClose: () => void;
};

/** «Falta tu nombre» · «Falta tu zona» · «Falta tu nombre y tu zona» */
function missingText(name: boolean, zone: boolean): string | null {
  if (name && zone) return 'Falta tu nombre y tu zona';
  if (name) return 'Falta tu nombre';
  if (zone) return 'Falta tu zona';
  return null;
}

export function TuBarrioSheet({ suggestedName, initial, onSaved, onClose }: TuBarrioSheetProps) {
  const titleId = useId();
  const fieldId = useId();
  const editing = initial !== undefined;
  // Both hooks always run (rules of hooks); an edit keeps the person's balance and activity in place
  const create = useSaveProfile();
  const edit = useEditProfile();
  const save = editing ? edit : create;
  const [name, setName] = useState(initial?.fullName ?? suggestedName ?? '');
  const [city, setCity] = useState<City>(initial?.city ?? DEFAULT_CITY);
  const [zone, setZone] = useState(initial?.zone ?? '');
  // A zone tapped from the chips is cleared when the city changes; one the person typed is kept
  const [zoneFromChip, setZoneFromChip] = useState(false);

  const cleanName = name.trim().replace(/\s+/g, ' ');
  const cleanZone = zone.trim().replace(/\s+/g, ' ');
  const missingName = cleanName.length < NAME_MIN;
  const missingZone = cleanZone.length === 0;
  const blocker = missingText(missingName, missingZone);
  const canSave = !blocker && !save.isPending;
  const suggestions = SUGGESTED_ZONES[city];

  const changeCity = (next: City) => {
    setCity(next);
    if (zoneFromChip) {
      setZone('');
      setZoneFromChip(false);
    }
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} className="barrio">
      {(close, forceClose) => {
        const submit = () => {
          if (!canSave) return;
          const input = { fullName: cleanName, city, zone: cleanZone };
          save.mutate(input, {
            onSuccess: () => {
              onSaved(input);
              forceClose();
            },
          });
        };
        return (
          <>
            <header className="sheet__bar">
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <ArrowLeftIcon className="sheet__icon-phone" />
                <CloseIcon className="sheet__icon-desk" />
              </button>
              <h2 id={titleId} className="sheet__bar-title">{editing ? 'Editar' : 'Tu barrio'}</h2>
            </header>

            <form
              className="barrio__layout"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <div className="sheet__body">
                <div className="sheet__content barrio__form">
                  <div className="field">
                    <label htmlFor={`${fieldId}-name`}>Nombre y apellido</label>
                    <input
                      id={`${fieldId}-name`}
                      className="input input--box"
                      type="text"
                      autoComplete="name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      maxLength={NAME_MAX}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor={`${fieldId}-city`}>Ciudad</label>
                    <select
                      id={`${fieldId}-city`}
                      className="input input--box barrio__select"
                      value={city}
                      onChange={(e) => changeCity(e.target.value as City)}
                    >
                      {CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor={`${fieldId}-zone`}>Zona</label>
                    <input
                      id={`${fieldId}-zone`}
                      className="input input--box"
                      type="text"
                      autoComplete="off"
                      enterKeyHint="done"
                      maxLength={ZONE_MAX}
                      value={zone}
                      onChange={(e) => {
                        setZone(e.target.value);
                        setZoneFromChip(false);
                      }}
                    />
                    {suggestions.length > 0 && (
                      <div className="barrio__chips" role="group" aria-label={`Zonas de ${city}`}>
                        {suggestions.map((z) => (
                          <button
                            key={z}
                            type="button"
                            className="chip"
                            aria-pressed={zone === z}
                            onClick={() => {
                              const off = zone === z;
                              setZone(off ? '' : z);
                              setZoneFromChip(!off);
                            }}
                          >
                            {z}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="sheet__actions">
                {save.isError ? (
                  <p key="error" className="sheet__message sheet__message--error" role="alert">{errorMessage(save.error)}</p>
                ) : blocker ? (
                  <p key={blocker} className="sheet__message" id={`${fieldId}-blocker`}>{blocker}</p>
                ) : null}
                <button
                  type="submit"
                  className="btn sheet__full barrio__save"
                  disabled={!canSave}
                  aria-busy={save.isPending || undefined}
                  aria-describedby={blocker ? `${fieldId}-blocker` : undefined}
                >
                  {save.isPending ? (
                    <>
                      <span className="upload__spinner" aria-hidden="true" /> Guardando…
                    </>
                  ) : editing ? (
                    'Guardar'
                  ) : (
                    'Listo'
                  )}
                </button>
              </div>
            </form>
          </>
        );
      }}
    </Sheet>
  );
}
