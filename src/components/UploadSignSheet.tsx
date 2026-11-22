// «+ Subir letrero» (wiki › flujo-final › 1 · Hoy, #34, #142, #167): photo + title, the rest folded
// in «Más detalles». The photo is compressed here. What is typed lives in memory while the sheet is
// open, so a failed upload or no signal never loses it; closing or reloading does (the account is
// asked before this sheet opens, so nothing is typed when Google reloads the page).
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { MAX_TAGS, SUGGESTED_ZONES, TAGS, isDataError, useCreateSign, useSession, type City, type Sign, type Tag } from '../data';
import { ArrowLeftIcon, ChevronDownIcon, CloseIcon } from './icons';
import { errorMessage } from './messages';
import { PhotoError, preparePhoto } from './photo';
import { EXIT_MS, Sheet } from './Sheet';
import './upload-sign-sheet.css';

const TITLE_MIN = 3;
const TITLE_MAX = 80;

type UploadSignSheetProps = {
  /** The city in the top bar, for «Se publicará en <tu ciudad>». */
  viewingCity: City;
  onClose: () => void;
  onPublished: (result: { sign: Sign; rewarded: boolean }) => void;
};

type Photo = { photo: Blob; thumb: Blob; url: string };

type Fields = {
  title: string;
  price: string;
  zone: string;
  tags: Tag[];
  mapsUrl: string;
  detailsOpen: boolean;
};

function publishError(error: unknown): string {
  if ((isDataError(error) && error.code === 'offline') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return 'Sin conexión, intenta de nuevo';
  }
  // Signed in without «Tu barrio»: nothing is published until T16 asks for it
  if (isDataError(error) && error.code === 'unauthenticated') return errorMessage(error);
  return 'No pudimos subirlo, intenta de nuevo';
}

/** «Falta la foto» · «Falta el título» · «Falta la foto y el título» */
function missingText(parts: string[]): string | null {
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `Falta ${list}`;
}

export function UploadSignSheet({ viewingCity, onClose, onPublished }: UploadSignSheetProps) {
  const titleId = useId();
  const fieldId = useId();
  const session = useSession();
  const profile = session.data?.status === 'signed-in' ? session.data.profile : null;
  const city = profile?.city ?? viewingCity;
  const defaultZone = profile?.zone ?? '';
  const create = useCreateSign();

  const [view, setView] = useState<'form' | 'confirm'>('form');
  // The confirm card slides away before it unmounts (same 160 ms as a sheet leaving)
  const [confirmLeaving, setConfirmLeaving] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [text, setText] = useState<Fields>({
    title: '',
    price: '',
    zone: defaultZone,
    tags: [],
    mapsUrl: '',
    detailsOpen: false,
  });
  const [titleTouched, setTitleTouched] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  useEffect(() => {
    if (view === 'confirm') confirmHeading.current?.focus();
  }, [view]);

  const keepEditing = () => {
    if (confirmLeaving) return;
    setConfirmLeaving(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      setView('form');
      setConfirmLeaving(false);
    }, reduced ? 0 : EXIT_MS);
  };

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setText((t) => ({ ...t, [key]: value }));

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same photo can be chosen again
    if (!file) return;
    setPhotoError(null);
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ ...prepared, url: URL.createObjectURL(prepared.photo) });
    } catch (error) {
      setPhotoError(
        error instanceof PhotoError && error.reason === 'too-big' ? 'Esa foto pesa más de 10 MB, elige otra' : 'Eso no es una foto, elige otra',
      );
    } finally {
      setPreparing(false);
    }
  };

  const toggleTag = (tag: Tag) =>
    set('tags', text.tags.includes(tag) ? text.tags.filter((t) => t !== tag) : text.tags.length < MAX_TAGS ? [...text.tags, tag] : text.tags);

  const title = text.title.trim();
  const mapsUrl = text.mapsUrl.trim();
  const zone = text.zone.trim();
  const mapsError = mapsUrl !== '' && !mapsUrl.startsWith('https://') ? 'Pega un enlace de Google Maps' : null;
  const titleShort = title.length > 0 && title.length < TITLE_MIN;
  const missing = missingText([...(photo ? [] : ['la foto']), ...(title ? [] : ['el título'])]);
  const blocker = missing ?? (titleShort ? 'El título necesita al menos 3 letras' : mapsError);
  const canPublish = !blocker && !create.isPending && !preparing;

  const dirty =
    Boolean(photo) || title !== '' || text.price.trim() !== '' || mapsUrl !== '' || text.tags.length > 0 || zone !== defaultZone.trim();

  const canClose = () => {
    if (create.isPending) return false;
    if (view === 'confirm') {
      keepEditing();
      return false;
    }
    if (dirty) {
      setView('confirm');
      return false;
    }
    return true;
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} canClose={canClose} className="upload">
      {(close, forceClose) => {
        const publish = () => {
          if (!photo || !canPublish) return;
          create.mutate(
            {
              title,
              photo: photo.photo,
              thumb: photo.thumb,
              price: text.price.trim() || undefined,
              zone: zone || undefined,
              tags: text.tags,
              mapsUrl: mapsUrl || undefined,
            },
            {
              onSuccess: (result) => {
                onPublished(result);
                forceClose();
              },
            },
          );
        };
        const discard = () => forceClose();

        return (
          <>
            <header className="sheet__bar">
              <button type="button" className="icon-btn" aria-label="Volver" onClick={close}>
                <ArrowLeftIcon className="sheet__icon-phone" />
                <CloseIcon className="sheet__icon-desk" />
              </button>
              <h2 id={titleId} className="sheet__bar-title">Subir letrero</h2>
            </header>

            <div className="sheet__body" inert={view === 'confirm'}>
              <div className="sheet__content upload__form">
                {/* Photo: required, rear camera first (wiki #52) */}
                <section className="upload__photo" aria-labelledby={`${fieldId}-photo`}>
                  <h3 id={`${fieldId}-photo`} className="upload__label">Foto</h3>
                  {photo ? (
                    <div key={photo.url} className="upload__preview">
                      <img src={photo.url} alt="Foto del letrero" />
                      <button type="button" className="btn btn--secondary btn--small upload__change" disabled={preparing} onClick={() => galleryRef.current?.click()}>
                        Cambiar foto
                      </button>
                    </div>
                  ) : (
                    <div className="upload__pick" aria-busy={preparing || undefined}>
                      <button type="button" className="btn btn--full" disabled={preparing} onClick={() => cameraRef.current?.click()}>
                        {preparing ? 'Preparando la foto…' : 'Tomar foto'}
                      </button>
                      <button type="button" className="btn btn--secondary btn--full" disabled={preparing} onClick={() => galleryRef.current?.click()}>
                        Elegir de la galería
                      </button>
                    </div>
                  )}
                  <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                  <input ref={galleryRef} className="sr-only" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                  {photoError && <p className="field__error" role="alert">{photoError}</p>}
                </section>

                <div className="field">
                  <div className="upload__label-row">
                    <label htmlFor={`${fieldId}-title`}>Título</label>
                    <span className="meta" aria-hidden="true">{text.title.length}/{TITLE_MAX}</span>
                  </div>
                  <input
                    id={`${fieldId}-title`}
                    className="input input--box"
                    type="text"
                    enterKeyHint="done"
                    maxLength={TITLE_MAX}
                    placeholder="Ej.: Almuerzo completo con sopa"
                    value={text.title}
                    aria-invalid={titleTouched && titleShort ? true : undefined}
                    aria-describedby={titleTouched && titleShort ? `${fieldId}-title-error` : undefined}
                    onBlur={() => setTitleTouched(true)}
                    onChange={(e) => set('title', e.target.value)}
                  />
                  {titleTouched && titleShort && (
                    <p id={`${fieldId}-title-error`} className="field__error">El título necesita al menos 3 letras</p>
                  )}
                </div>

                <button
                  type="button"
                  className="upload__more"
                  aria-expanded={text.detailsOpen}
                  aria-controls={`${fieldId}-details`}
                  onClick={() => set('detailsOpen', !text.detailsOpen)}
                >
                  Más detalles
                  <ChevronDownIcon size={20} />
                </button>

                <div id={`${fieldId}-details`} className="upload__details" data-open={text.detailsOpen || undefined} inert={!text.detailsOpen}>
                  <div className="upload__details-inner">
                    <div className="field">
                      <label htmlFor={`${fieldId}-price`}>Precio</label>
                      <input
                        id={`${fieldId}-price`}
                        className="input input--box"
                        type="text"
                        placeholder="Ej.: Bs 38"
                        value={text.price}
                        onChange={(e) => set('price', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`${fieldId}-zone`}>Zona</label>
                      <input
                        id={`${fieldId}-zone`}
                        className="input input--box"
                        type="text"
                        list={`${fieldId}-zones`}
                        autoComplete="off"
                        value={text.zone}
                        onChange={(e) => set('zone', e.target.value)}
                      />
                      <datalist id={`${fieldId}-zones`}>
                        {SUGGESTED_ZONES[city].map((z) => (
                          <option key={z} value={z} />
                        ))}
                      </datalist>
                    </div>
                    <fieldset className="upload__tags">
                      <legend>Etiquetas <span className="meta">(hasta {MAX_TAGS})</span></legend>
                      <div className="upload__chips">
                        {TAGS.map((tag) => {
                          const on = text.tags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              className="chip"
                              aria-pressed={on}
                              disabled={!on && text.tags.length >= MAX_TAGS}
                              onClick={() => toggleTag(tag)}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="field">
                      <label htmlFor={`${fieldId}-maps`}>Enlace de Google Maps</label>
                      <input
                        id={`${fieldId}-maps`}
                        className="input input--box"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://maps.app.goo.gl/…"
                        value={text.mapsUrl}
                        aria-invalid={mapsError ? true : undefined}
                        aria-describedby={mapsError ? `${fieldId}-maps-error` : undefined}
                        onChange={(e) => set('mapsUrl', e.target.value)}
                      />
                      {mapsError && <p id={`${fieldId}-maps-error`} className="field__error">{mapsError}</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sheet__actions" inert={view === 'confirm'}>
              {create.isError ? (
                <p key="error" className="sheet__message sheet__message--error upload__msg" role="alert">{publishError(create.error)}</p>
              ) : blocker ? (
                <p key={blocker} className="sheet__message upload__msg" id={`${fieldId}-blocker`}>{blocker}</p>
              ) : city !== viewingCity ? (
                <p key="city" className="sheet__message upload__msg">Se publicará en {city}</p>
              ) : null}
              <button
                type="button"
                className="btn sheet__full"
                disabled={!canPublish}
                aria-describedby={blocker ? `${fieldId}-blocker` : undefined}
                onClick={publish}
              >
                {create.isPending ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Publicando…
                  </>
                ) : create.isError ? (
                  'Reintentar'
                ) : (
                  'Publicar'
                )}
              </button>
            </div>

            {view === 'confirm' && (
              <div className="upload__confirm" data-leaving={confirmLeaving || undefined}>
                <div className="upload__confirm-scrim" aria-hidden="true" onClick={keepEditing} />
                <div className="upload__confirm-card" role="alertdialog" aria-labelledby={`${fieldId}-confirm`} aria-describedby={`${fieldId}-confirm-text`}>
                  <h3 id={`${fieldId}-confirm`} ref={confirmHeading} tabIndex={-1} className="upload__confirm-title">¿Descartar el letrero?</h3>
                  <p id={`${fieldId}-confirm-text`} className="upload__confirm-text">Se borran la foto y lo que escribiste.</p>
                  <div className="confirm__actions">
                    <button type="button" className="btn btn--secondary" onClick={keepEditing}>Seguir editando</button>
                    <button type="button" className="btn btn--danger" onClick={discard}>Descartar</button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }}
    </Sheet>
  );
}
