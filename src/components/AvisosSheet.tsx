// Avisos (SPEC 24, wiki › 3 · Yo › Avisos, #110, #126, #203, #214, #216): one sheet, from the bell on every tab and
// from the Avisos card in Yo. Newest first, 30 at a time with «Ver más». Tapping a notice marks it read and opens its
// question or letrero once the sheet has closed; one that is gone shows «Esto ya no está disponible» inside the
// sheet, with a way back to the list. A pending contact request is answered right in the notice.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMarkAllNoticesRead, useMarkNoticeRead, useMyPhone, useNotices, useRespondContact, type Notice, type NoticeKind } from '../data';
import { ContactBox } from './ContactRequest';
import { ArrowLeftIcon, BellIcon, CloseIcon, CommentIcon, ContactIcon, QuestionIcon, ThumbIcon } from './icons';
import { errorMessage } from './messages';
import { noticeFocus, noticeLine, type NoticeFocus } from './notices';
import { Sheet } from './Sheet';
import { timeAgo } from './time';
import './avisos-sheet.css';
import './contact-request.css';

const KIND_ICON: Record<NoticeKind, (props: { size?: number }) => ReactNode> = {
  answer: QuestionIcon,
  comment: CommentIcon,
  helpful: ThumbIcon,
  sign_helpful: ThumbIcon,
  contact_request: ContactIcon,
  contact_accepted: ContactIcon,
  urgent: BellIcon,
  reminder: QuestionIcon,
};

/** New rows from «Ver más» rise in one after another, never longer than 10 steps. */
const STAGGER_CAP = 10;

type AvisosSheetProps = {
  onClose: () => void;
  /** Called as the sheet closes; `focus` is the answer or comment the notice is about. */
  onOpenQuestion: (id: number, focus?: NoticeFocus) => void;
  onOpenSign: (id: number) => void;
  onGoHoy: () => void;
};

export function AvisosSheet({ onClose, onOpenQuestion, onOpenSign, onGoHoy }: AvisosSheetProps) {
  const titleId = useId();
  const notices = useNotices();
  const markRead = useMarkNoticeRead();
  const markAll = useMarkAllNoticesRead();
  const [gone, setGone] = useState(false);
  // Rows from this index on just arrived through «Ver más»: they rise in
  const [revealFrom, setRevealFrom] = useState<number | null>(null);
  const listTop = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const items = notices.data?.pages.flatMap((page) => page.items) ?? [];
  const anyUnread = items.some((n) => !n.read);

  // Back from «no disponible»: the list where it was
  useLayoutEffect(() => {
    if (!gone && bodyRef.current) bodyRef.current.scrollTop = listTop.current;
  }, [gone]);

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close, forceClose) => {
        const open = (notice: Notice) => {
          if (!notice.read) markRead.mutate(notice);
          if (!notice.open) {
            listTop.current = bodyRef.current?.scrollTop ?? 0;
            setGone(true);
            return;
          }
          const target = notice.open;
          forceClose();
          if (target.kind === 'question') onOpenQuestion(target.id, noticeFocus(notice));
          else onOpenSign(target.id);
        };

        return (
          <>
            <header className="sheet__bar">
              {gone ? (
                <button type="button" className="icon-btn" aria-label="Volver a Avisos" onClick={() => setGone(false)}>
                  <ArrowLeftIcon />
                </button>
              ) : null}
              <h2 id={titleId} className="sheet__bar-title">Avisos</h2>
              <div className="sheet__bar-actions">
                {!gone && anyUnread && (
                  <button type="button" className="link-btn avisos__all" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
                    Marcar todo como leído
                  </button>
                )}
                <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                  <CloseIcon />
                </button>
              </div>
            </header>
            <div ref={bodyRef} className="sheet__body">
              {!gone && markAll.isError && (
                <p className="field__error avisos__error" role="alert">{errorMessage(markAll.error)}</p>
              )}
              {gone ? (
                <div className="sheet__content empty avisos__step">
                  <h3 className="empty__title">Esto ya no está disponible</h3>
                  <div className="empty__actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        forceClose();
                        onGoHoy();
                      }}
                    >
                      Ir a Hoy
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setGone(false)}>
                      Volver a Avisos
                    </button>
                  </div>
                </div>
              ) : notices.isPending ? (
                <div className="sheet__content" aria-busy="true">
                  <p className="sr-only" role="status">Cargando…</p>
                  <ul className="rows">
                    {[0, 1, 2, 3].map((i) => (
                      <li key={i}>
                        <div className="skeleton" style={{ height: '3rem', flex: 1 }} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : notices.isError && items.length === 0 ? (
                <div className="sheet__content empty">
                  <p className="empty__text">Algo falló, intenta de nuevo</p>
                  <button type="button" className="btn btn--secondary btn--small" onClick={() => notices.refetch()}>Reintentar</button>
                </div>
              ) : items.length === 0 ? (
                <div className="sheet__content empty">
                  <h3 className="empty__title">Sin avisos por ahora</h3>
                  <p className="empty__text">Aquí verás cuando alguien te responda o le sirva tu letrero.</p>
                </div>
              ) : (
                <div className="sheet__content avisos__content">
                  <ul className="avisos__list">
                    {items.map((notice, i) => {
                      const stagger = revealFrom !== null && i >= revealFrom ? Math.min(i - revealFrom, STAGGER_CAP) : null;
                      return (
                        <NoticeRow
                          key={`${notice.kind}-${notice.id}`}
                          notice={notice}
                          stagger={stagger}
                          onOpen={() => open(notice)}
                          onAnswered={() => {
                            if (!notice.read) markRead.mutate(notice);
                          }}
                        />
                      );
                    })}
                  </ul>
                  {notices.hasNextPage && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--small avisos__more"
                      disabled={notices.isFetchingNextPage}
                      onClick={() => {
                        setRevealFrom(items.length);
                        void notices.fetchNextPage();
                      }}
                    >
                      {notices.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        );
      }}
    </Sheet>
  );
}

type NoticeRowProps = {
  notice: Notice;
  /** Position in the batch that just arrived through «Ver más», or null. */
  stagger: number | null;
  onOpen: () => void;
  onAnswered: () => void;
};

function NoticeRow({ notice, stagger, onOpen, onAnswered }: NoticeRowProps) {
  const Icon = KIND_ICON[notice.kind];
  return (
    <li
      className={stagger !== null ? 'aviso aviso--rise' : 'aviso'}
      data-unread={notice.read ? undefined : ''}
      style={stagger !== null ? { ['--i' as string]: stagger } : undefined}
    >
      <button type="button" className="aviso__open" onClick={onOpen}>
        <span className="aviso__icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="aviso__main">
          <span className="aviso__line">
            {notice.read ? null : <span className="sr-only">Nuevo: </span>}
            {noticeLine(notice)}
          </span>
          {notice.text && <span className="aviso__text">{notice.text}</span>}
          <span className="meta">{timeAgo(notice.createdAt)}</span>
        </span>
        <span className="aviso__dot" aria-hidden="true" />
      </button>
      {(notice.kind === 'contact_request' || notice.kind === 'contact_accepted') && notice.contact && (
        <NoticeContact notice={notice} onAnswered={onAnswered} />
      )}
    </li>
  );
}

/**
 * A contact request answered right in the notice (wiki #110, #216): Aceptar shares the e-mail and the phone saved in
 * Ajustes › Mi celular. Once accepted, the other person's details; «Ahora no» leaves a short line.
 */
function NoticeContact({ notice, onAnswered }: { notice: Notice; onAnswered: () => void }) {
  const contact = notice.contact!;
  const respond = useRespondContact();
  const myPhone = useMyPhone(notice.kind === 'contact_request' && contact.status === 'pending');
  const [working, setWorking] = useState<'accept' | 'decline' | null>(null);
  const name = notice.actor?.trim() || 'Un vecino';

  if (contact.status === 'accepted' && contact.other) {
    return (
      <div className="aviso__contact aviso--fade">
        <ContactBox name={name} details={contact.other} />
      </div>
    );
  }
  if (notice.kind !== 'contact_request' || contact.requestedByMe) return null;
  if (contact.status === 'declined') {
    return <p className="contact__status aviso__contact aviso--fade">Preferiste no compartir tu contacto</p>;
  }

  const phone = myPhone.data ?? null;
  const questionId = notice.open?.kind === 'question' ? notice.open.id : 0;
  const answer = (accept: boolean) => {
    setWorking(accept ? 'accept' : 'decline');
    respond.mutate(
      { requestId: contact.requestId, questionId, accept, phone: accept ? (phone ?? undefined) : undefined },
      { onSuccess: onAnswered, onSettled: () => setWorking(null) },
    );
  };
  const busy = respond.isPending;
  const spinner = <span className="spinner" aria-hidden="true" />;

  return (
    <div className="aviso__contact contact__incoming">
      <p className="meta">{phone ? 'Si aceptas, compartes tu correo y tu celular de Ajustes.' : 'Si aceptas, compartes tu correo.'}</p>
      {respond.isError && <p className="field__error" role="alert">{errorMessage(respond.error)}</p>}
      <div className="aviso__buttons">
        <button type="button" className="btn btn--secondary btn--small" disabled={busy} aria-busy={working === 'decline' || undefined} onClick={() => answer(false)}>
          {working === 'decline' ? <>{spinner} Ahora no</> : 'Ahora no'}
        </button>
        <button type="button" className="btn btn--small" disabled={busy || myPhone.isPending} aria-busy={working === 'accept' || undefined} onClick={() => answer(true)}>
          {working === 'accept' ? <>{spinner} Aceptando…</> : 'Aceptar'}
        </button>
      </div>
    </div>
  );
}
