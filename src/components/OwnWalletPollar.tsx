// The part of «Mi billetera propia» that needs Pollar's SDK (SPEC 31). Loaded lazily by OwnWalletCard.
//   connect: Pollar login → wait until the wallet is READY → YAPITA trustline → the server verifies the token,
//            links the address and pays the 5-yapita welcome once.
//   redeem:  offers of partners with a wallet → confirm → the server starts the redemption → the neighbor signs the
//            payment with Pollar (memo `canje:<id>`) → the server verifies it on Horizon → receipt.
import '@pollar/react/styles.css';
import { PollarProvider, usePollar } from '@pollar/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDataError, useConfirmOwnRedeem, useLinkOwnWallet, useOwnOffers, useStartOwnRedeem, type Offer, type Redemption } from '../data';
import { ArrowLeftIcon, CloseIcon } from './icons';
import { OfferListView, ReceiptView, redeemError } from './RedeemSheet';
import { Sheet } from './Sheet';
import { Yapita } from './Yapita';
import './redeem-sheet.css';

type Props = {
  mode: 'connect' | 'redeem';
  network: 'testnet' | 'mainnet';
  issuer: string | null;
  balance: number | null;
  /** Called when the flow ends: a toast message, or null. */
  onDone: (message: string | null) => void;
};

const EXPLORER_TX = { testnet: 'https://stellar.expert/explorer/testnet/tx/', mainnet: 'https://stellar.expert/explorer/public/tx/' } as const;
const CONNECT_ERROR = 'No se pudo conectar tu billetera, intenta de nuevo';
/** «celular» on a phone, «computadora» on a computer (wiki #228). */
const THIS_DEVICE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'este celular' : 'esta computadora';
const RECOVERY_FIRST = `Antes de canjear, elige cómo recuperar tu billetera si pierdes ${THIS_DEVICE}. Luego usa Reintentar`;
/** Link attempts 3 s apart while the YAPITA trustline waits for the person's confirmation (about a minute). */
const TRUSTLINE_TRIES = 20;

/**
 * Pollar renders its windows (login, signature confirmation, co-sign, recovery) next to its provider, with no portal.
 * Inside #root they would sit behind our sheets: Sheet makes #root inert and, on a phone, hides it. So the provider
 * lives in its own layer on <body>, which no sheet touches, and our own UI goes back into the card through a portal.
 */
function pollarLayer(): HTMLElement {
  let layer = document.getElementById('pollar-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'pollar-layer';
    document.body.append(layer);
  }
  return layer;
}

export default function OwnWalletPollar(props: Props) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const apiKey = import.meta.env.VITE_POLLAR_PUBLISHABLE_KEY as string | undefined;
  if (!apiKey || !props.issuer) return <p className="field__error" role="alert">{CONNECT_ERROR}</p>;
  const flow = props.mode === 'connect' ? <Connect {...props} issuer={props.issuer} /> : <Redeem {...props} />;
  return (
    <>
      <div ref={setSlot} />
      {createPortal(
        <PollarProvider client={{ apiKey, stellarNetwork: props.network }}>{slot && createPortal(flow, slot)}</PollarProvider>,
        pollarLayer(),
      )}
    </>
  );
}

/** The Pollar session's access token, for the server to verify. */
function accessToken(pollar: ReturnType<typeof usePollar>): string | null {
  const state = pollar.getClient().getAuthState();
  return state.step === 'authenticated' ? state.session.token.accessToken : null;
}

function Connect({ issuer, onDone }: Props & { issuer: string }) {
  const pollar = usePollar();
  const link = useLinkOwnWallet();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'creating' | 'linking'>('login');
  const opened = useRef(false);
  const running = useRef(false);
  const creating = useRef(false);
  const provisioning = pollar.wallet?.provisioning;

  // Open Pollar's login once; the person may close it and use «Reintentar»
  useEffect(() => {
    if (!pollar.isAuthenticated && !opened.current && pollar.configStatus === 'ready') {
      opened.current = true;
      pollar.openLoginModal();
    }
  }, [pollar, pollar.isAuthenticated, pollar.configStatus]);

  // An app set to create wallets «on demand» (or to let the user choose custody) gives no wallet at login:
  // ask for it. createWallet is idempotent, so a user who already has one gets it back.
  useEffect(() => {
    if (!pollar.isAuthenticated || pollar.wallet || creating.current) return;
    creating.current = true;
    setStep('creating');
    void pollar.createWallet().catch((error: unknown) => {
      console.error('Pollar createWallet failed', error);
      setError(CONNECT_ERROR);
      creating.current = false;
    });
  }, [pollar, pollar.isAuthenticated, pollar.wallet]);

  // A co-signed wallet only lands on the ledger after the person approves its account creation. The SDK reads the
  // pending approvals when a session starts with a wallet, not after createWallet, so a wallet made «on demand» waited
  // forever until the next visit. Ask for them while the wallet is being created; Pollar then shows its approval window.
  useEffect(() => {
    if (!pollar.isAuthenticated || provisioning !== 'CREATING') return;
    const client = pollar.getClient();
    const ask = () => void client.cosign.pending().catch((error: unknown) => console.warn('Pollar pending approvals failed', error));
    ask();
    const timer = window.setInterval(ask, 5000);
    return () => window.clearInterval(timer);
  }, [pollar, pollar.isAuthenticated, provisioning]);

  useEffect(() => {
    if (!pollar.isAuthenticated || !pollar.wallet || running.current) return;
    if (provisioning === 'FAILED') {
      setError(CONNECT_ERROR);
      return;
    }
    if (provisioning && provisioning !== 'READY') {
      setStep('creating');
      return;
    }
    running.current = true;
    setStep('linking');
    void (async () => {
      try {
        // Pollar adds the app's enabled tokens (YAPITA) when it creates the wallet; asking again may fail because the
        // trustline already exists. Go on either way: the server checks the trustline on Horizon before paying.
        try {
          const trust = await pollar.setTrustline({ code: 'YAPITA', issuer });
          if (trust.status === 'cosign_pending') console.warn('YAPITA trustline waits for a co-signature');
        } catch (error) {
          console.warn('YAPITA trustline request failed; the server will check it', error);
        }
        // The trustline may still wait for the person's «Confirm» in Pollar's window (or its co-signature) when we get
        // here: until it is on the ledger the server refuses with no_trustline. Keep trying for a minute instead of
        // showing an error over Pollar's window.
        let result;
        for (let attempt = 0; ; attempt++) {
          const token = accessToken(pollar);
          if (!token) throw new Error('no token');
          try {
            result = await link.mutateAsync(token);
            break;
          } catch (error) {
            const waitingTrustline = String((error as { message?: unknown } | null)?.message ?? '').includes('no_trustline');
            if (!waitingTrustline || attempt >= TRUSTLINE_TRIES) throw error;
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        onDone(result.welcomeTxHash ? 'Billetera conectada: +5 yapitas de bienvenida' : 'Billetera conectada');
      } catch (error) {
        console.error('Own wallet link failed', error);
        setError(CONNECT_ERROR);
        running.current = false;
      }
    })();
  }, [pollar, pollar.isAuthenticated, pollar.wallet, provisioning, issuer, link, onDone]);

  if (error) {
    return (
      <div className="own-wallet__status">
        <p className="field__error" role="alert">{error}</p>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => {
            setError(null);
            if (!pollar.isAuthenticated) pollar.openLoginModal();
            else pollar.refreshWalletBalance().catch(() => undefined);
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <p className="meta own-wallet__status" role="status">
      <span className="spinner" aria-hidden="true" />{' '}
      {step === 'creating' ? 'Tu billetera todavía se está creando' : step === 'linking' ? 'Creando tu billetera…' : 'Inicia sesión en Pollar para crear tu billetera'}
    </p>
  );
}

type View = { name: 'list' } | { name: 'confirm'; offer: Offer } | { name: 'receipt'; receipt: Redemption };

/**
 * Redeeming needs a Pollar session in this browser (the wallet may have been connected on another device). Without
 * one, Pollar's login opens here, before the sheet, so the person signs in first and then picks the offer.
 */
function Redeem(props: Props) {
  const pollar = usePollar();
  const [waited, setWaited] = useState(false);
  const opened = useRef(false);

  // A saved session restores in a moment: give it that moment before asking to sign in
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (waited && !pollar.isAuthenticated && !opened.current && pollar.configStatus === 'ready') {
      opened.current = true;
      pollar.openLoginModal();
    }
  }, [waited, pollar, pollar.isAuthenticated, pollar.configStatus]);

  if (pollar.isAuthenticated && pollar.wallet) return <RedeemSheet {...props} />;
  return (
    <div className="own-wallet__status">
      <p className="meta" role="status">
        <span className="spinner" aria-hidden="true" /> {waited ? 'Inicia sesión en tu billetera para canjear' : 'Abriendo tu billetera…'}
      </p>
      {waited && (
        <>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => pollar.openLoginModal()}>
            Iniciar sesión
          </button>
          <button type="button" className="link-btn" onClick={() => props.onDone(null)}>
            Cancelar
          </button>
        </>
      )}
    </div>
  );
}

function RedeemSheet({ network, balance, onDone }: Props) {
  const titleId = useId();
  const pollar = usePollar();
  const offers = useOwnOffers();
  const start = useStartOwnRedeem();
  const confirm = useConfirmOwnRedeem();
  const [view, setView] = useState<View>({ name: 'list' });
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<{ text: string; retry: boolean } | null>(null);

  // A co-signed wallet signs nothing but its own setup until it has a way to be recovered without this device
  // (SDK_WALLET_RECOVERY_REQUIRED). Pollar's own window sets it up; the person comes back and taps «Reintentar».
  const askRecovery = () => {
    pollar.openRecoveryModal();
    setFailure({ text: RECOVERY_FIRST, retry: true });
  };

  const pay = async (offer: Offer) => {
    if (paying) return;
    if (pollar.recoveryLocked) {
      askRecovery();
      return;
    }
    setPaying(true);
    setFailure(null);
    try {
      // This sheet mounts its own Pollar provider: the saved session may still be restoring. Wait for it instead of
      // opening Pollar's login in the middle of the payment.
      const client = pollar.getClient();
      for (let i = 0; i < 20 && client.getAuthState().step !== 'authenticated'; i++) await new Promise((r) => setTimeout(r, 250));
      if (client.getAuthState().step !== 'authenticated') throw new Error('pollar_session_missing');
      if (!client.getWallet()) throw new Error('pollar_wallet_missing');

      const started = await start.mutateAsync(offer.id);
      const outcome = await pollar.runTx(
        'payment',
        // YAPITA has 6 letters: Stellar calls codes of 5 to 12 letters alphanum12 (1 to 4 is alphanum4)
        { destination: started.destination, amount: started.amount, asset: { type: 'credit_alphanum12', code: 'YAPITA', issuer: started.issuer } },
        { memo: { type: 'text', value: started.memo } },
      );
      if (outcome.status !== 'success' && outcome.status !== 'pending') throw new Error(`pollar_outcome:${JSON.stringify(outcome).slice(0, 160)}`);
      const receipt = await confirm.mutateAsync({ redemptionId: started.redemptionId, txHash: outcome.hash });
      setView({ name: 'receipt', receipt });
    } catch (error) {
      console.error('Own wallet redemption failed', error);
      if (String((error as { message?: unknown } | null)?.message ?? '').includes('SDK_WALLET_RECOVERY_REQUIRED')) {
        pollar.refreshRecovery();
        askRecovery();
        return;
      }
      const base = isDataError(error) ? redeemError(error) : { text: 'No se pudo canjear, intenta de nuevo', retry: true };
      // On testnet, say exactly what failed so the gate test can be fixed from the phone (never on mainnet)
      const e = error as { code?: unknown; message?: unknown } | null;
      const detail = network === 'testnet' ? ` (${String(e?.code ?? e?.message ?? error).slice(0, 200)})` : '';
      setFailure({ ...base, text: base.text + detail });
    } finally {
      setPaying(false);
    }
  };

  return (
    <Sheet labelledBy={titleId} onClose={() => onDone(null)} canClose={() => !paying} className="redeem">
      {(close) => {
        if (view.name === 'receipt') return <ReceiptView receipt={view.receipt} titleId={titleId} onClose={close} explorerTx={EXPLORER_TX[network]} />;
        if (view.name === 'confirm') {
          const { offer } = view;
          return (
            <>
              <header className="sheet__bar">
                <button type="button" className="icon-btn" aria-label="Volver a las ofertas" disabled={paying} onClick={() => setView({ name: 'list' })}>
                  <ArrowLeftIcon />
                </button>
                <h2 id={titleId} className="sheet__bar-title">Canjear en la {network === 'mainnet' ? 'red principal' : 'red de pruebas'}</h2>
              </header>
              <div className="sheet__body">
                <div className="sheet__content redeem__content">
                  <div className="redeem__confirm">
                    <Yapita size="lg" />
                    <p className="redeem__question">
                      ¿Canjear {offer.cost} {offer.cost === 1 ? 'yapita' : 'yapitas'} por «{offer.title}» en {offer.partner.name}?
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
                <button type="button" className="btn btn--secondary" disabled={paying} onClick={() => setView({ name: 'list' })}>
                  Volver
                </button>
                <button type="button" className="btn redeem__pay" disabled={paying || (failure !== null && !failure.retry)} aria-busy={paying || undefined} onClick={() => void pay(offer)}>
                  {paying ? (
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
              <h2 id={titleId} className="sheet__bar-title">Canjear en la {network === 'mainnet' ? 'red principal' : 'red de pruebas'}</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">
              <div className="sheet__content redeem__content">
                <OfferListView
                  offers={offers}
                  balance={balance}
                  onPick={(offer) => {
                    setFailure(null);
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
