// «Canjear» (SPEC 29, wiki › flujo-final › Yo › Canjear, #219): one sheet with three views. The list of active
// offers in the person's city, a confirmation, and the receipt shown at the counter. Opened with `receiptId`, it
// shows only that receipt (from Movimientos). Paying is all or nothing: on any failure nothing was charged, and
// the sheet says why. While it pays, the sheet cannot be closed and the button takes no second tap.
import { useId, useState } from 'react';
import { BOLIVIA_TIME_ZONE, isDataError, useOffers, useRedeem, useRedemption, type Id, type Offer, type Redemption } from '../data';
import { ArrowLeftIcon, CloseIcon, ExternalIcon } from './icons';
import { formatAmount } from './movements';
import { Sheet } from './Sheet';
import { Yapita } from './Yapita';
import './redeem-sheet.css';

const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';

/** «23 nov 2026, 15:42», in Bolivian time. */
const WHEN = new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: BOLIVIA_TIME_ZONE });

const yapitas = (n: number) => `${n} ${n === 1 ? 'yapita' : 'yapitas'}`;

/** What a failed redemption says (wiki › Canjear › Si falla). Nothing was charged in any case. */
function redeemError(error: unknown): { text: string; retry: boolean } {
  if (isDataError(error)) {
    if (error.code === 'limit' && error.limit === 'insufficient_balance') return { text: 'Te faltan yapitas para este canje', retry: false };
    if (error.code === 'limit' && error.limit === 'redeem_per_day') return { text: 'Ya la canjeaste hoy', retry: false };
    if (error.code === 'forbidden') return { text: 'El canje no está disponible ahora', retry: false };
    if (error.code === 'offline') return { text: 'Sin conexión, intenta de nuevo', retry: true };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { text: 'Sin conexión, intenta de nuevo', retry: true };
  return { text: 'No se pudo canjear, intenta de nuevo', retry: true };
}

type RedeemSheetProps = {
  /** The person's confirmed balance, to tell which offers they can afford. */
  balance: number | null;
  /** Open on this receipt only (from Movimientos). */
  receiptId?: Id | null;
  onClose: () => void;
};

type View = { name: 'list' } | { name: 'confirm'; offer: Offer } | { name: 'receipt'; receipt: Redemption };

export function RedeemSheet({ balance, receiptId = null, onClose }: RedeemSheetProps) {
  const titleId = useId();
  const [view, setView] = useState<View>({ name: 'list' });
  const redeem = useRedeem();
  const busy = redeem.isPending;

  return (
    <Sheet labelledBy={titleId} onClose={onClose} canClose={() => !busy} className="redeem">
      {(close) => {
        if (receiptId !== null) return <StoredReceipt id={receiptId} titleId={titleId} onClose={close} />;
        if (view.name === 'receipt') return <ReceiptView receipt={view.receipt} titleId={titleId} onClose={close} />;

        if (view.name === 'confirm') {
          const { offer } = view;
          const failure = redeem.isError ? redeemError(redeem.error) : null;
          const pay = () => {
            if (busy) return;
            redeem.mutate(offer.id, { onSuccess: (receipt) => setView({ name: 'receipt', receipt }) });
          };
          return (
            <>
              <header className="sheet__bar">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Volver a las ofertas"
                  disabled={busy}
                  onClick={() => {
                    redeem.reset();
                    setView({ name: 'list' });
                  }}
                >
                  <ArrowLeftIcon />
                </button>
                <h2 id={titleId} className="sheet__bar-title">Canjear</h2>
              </header>
              <div className="sheet__body">
                <div className="sheet__content redeem__content">
                  <div className="redeem__confirm">
                    <Yapita size="lg" />
                    <p className="redeem__question">
                      {/* The title starts with a capital («Un refresco…»): quoted, it reads right mid-sentence */}
                      ¿Canjear {yapitas(offer.cost)} por «{offer.title}» en {offer.partner.name}?
                    </p>
                    <p className="meta">
                      {offer.partner.zone} · {offer.partner.city}
                    </p>
                  </div>
                </div>
              </div>
              <div className="sheet__actions">
                {failure && (
                  <p className="sheet__message sheet__message--error" role="alert">
                    {failure.text}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    redeem.reset();
                    setView({ name: 'list' });
                  }}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="btn redeem__pay"
                  disabled={busy || (failure !== null && !failure.retry)}
                  aria-busy={busy || undefined}
                  onClick={pay}
                >
                  {busy ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Canjeando…
                    </>
                  ) : failure?.retry ? (
                    'Reintentar'
                  ) : (
                    'Canjear'
                  )}
                </button>
              </div>
            </>
          );
        }

        return (
          <>
            <header className="sheet__bar">
              <h2 id={titleId} className="sheet__bar-title">Canjear</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">
              <div className="sheet__content redeem__content">
                <OfferList
                  balance={balance}
                  onPick={(offer) => {
                    redeem.reset();
                    setView({ name: 'confirm', offer });
                  }}
                />
              </div>
            </div>
          </>
        );
      }}
    </Sheet>
  );
}

function OfferList({ balance, onPick }: { balance: number | null; onPick: (offer: Offer) => void }) {
  const offers = useOffers();

  if (offers.isPending) {
    return (
      <ul className="rows" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div className="skeleton" style={{ height: '3.5rem', flex: 1 }} />
          </li>
        ))}
      </ul>
    );
  }
  if (offers.isError) {
    return (
      <div className="empty">
        <p className="empty__text">{!navigator.onLine ? 'Sin conexión, intenta de nuevo' : 'Algo falló, intenta de nuevo'}</p>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => offers.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (offers.data.length === 0) {
    return (
      <div className="empty">
        <p className="empty__text">Todavía no hay negocios aliados en tu ciudad</p>
      </div>
    );
  }

  return (
    <>
      {balance !== null && (
        <p className="redeem__balance">
          <Yapita size="sm" /> Tienes {yapitas(balance)}
        </p>
      )}
      <ul className="redeem__offers">
        {offers.data.map((offer) => {
          const missing = balance === null ? 0 : Math.max(0, offer.cost - balance);
          const blocked = offer.redeemedToday || missing > 0;
          const why = offer.redeemedToday ? 'Ya la canjeaste hoy' : missing > 0 ? `Te faltan ${yapitas(missing)}` : null;
          return (
            <li key={offer.id}>
              <button type="button" className="redeem__offer" disabled={blocked} onClick={() => onPick(offer)}>
                <span className="redeem__offer-main">
                  <span className="redeem__partner">{offer.partner.name}</span>
                  <span className="redeem__title">{offer.title}</span>
                  <span className="meta">
                    {offer.partner.zone} · {offer.partner.city}
                  </span>
                  {why && <span className="meta redeem__why">{why}</span>}
                </span>
                <span className="redeem__cost">
                  <Yapita size="sm" />
                  {yapitas(offer.cost)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A receipt opened again from Movimientos. */
function StoredReceipt({ id, titleId, onClose }: { id: Id; titleId: string; onClose: () => void }) {
  const receipt = useRedemption(id);
  if (receipt.data) return <ReceiptView receipt={receipt.data} titleId={titleId} onClose={onClose} />;
  return (
    <>
      <header className="sheet__bar">
        <h2 id={titleId} className="sheet__bar-title">Comprobante</h2>
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="sheet__body">
        <div className="sheet__content redeem__content">
          {receipt.isError ? (
            <div className="empty">
              <p className="empty__text">{!navigator.onLine ? 'Sin conexión, intenta de nuevo' : 'Algo falló, intenta de nuevo'}</p>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => receipt.refetch()}>
                Reintentar
              </button>
            </div>
          ) : (
            <div className="skeleton" style={{ height: '16rem' }} aria-busy="true" />
          )}
        </div>
      </div>
    </>
  );
}

/** The receipt, large enough to read across a counter. */
function ReceiptView({ receipt, titleId, onClose }: { receipt: Redemption; titleId: string; onClose: () => void }) {
  return (
    <>
      <header className="sheet__bar">
        <h2 id={titleId} className="sheet__bar-title">Comprobante</h2>
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="sheet__body">
        <div className="sheet__content redeem__content">
          <section className="receipt" aria-label="Comprobante del canje">
            <div className="aguayo receipt__stripe" />
            <Yapita size="lg" />
            <p className="receipt__status" role="status">
              Canje confirmado
            </p>
            <p className="receipt__offer">{receipt.offerTitle}</p>
            <p className="receipt__where">
              en {receipt.partnerName} · {receipt.partnerZone}
            </p>
            <p className="meta">{WHEN.format(new Date(receipt.createdAt))}</p>
            <p className="receipt__code num">Código #{receipt.id}</p>
            <p className="receipt__amount num">{formatAmount(receipt.side === 'paid' ? -receipt.cost : receipt.cost)}</p>
            <a className="receipt__link" href={EXPLORER_TX + receipt.txHash} target="_blank" rel="noreferrer">
              Ver en el explorador <ExternalIcon size={14} />
            </a>
          </section>
        </div>
      </div>
      <div className="sheet__actions">
        <button type="button" className="btn sheet__full" onClick={onClose}>
          Listo
        </button>
      </div>
    </>
  );
}
