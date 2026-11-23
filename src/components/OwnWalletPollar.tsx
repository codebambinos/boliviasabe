// The part of «Mi billetera propia» that needs Pollar's SDK (SPEC 31). Loaded lazily by OwnWalletCard.
//   connect: Pollar login → wait until the wallet is READY → YAPITA trustline → the server verifies the token,
//            links the address and pays the 5-yapita welcome once.
//   redeem:  offers of partners with a wallet → confirm → the server starts the redemption → the neighbor signs the
//            payment with Pollar (memo `canje:<id>`) → the server verifies it on Horizon → receipt.
import '@pollar/react/styles.css';
import { PollarProvider, usePollar } from '@pollar/react';
import { useEffect, useId, useRef, useState } from 'react';
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

export default function OwnWalletPollar(props: Props) {
  const apiKey = import.meta.env.VITE_POLLAR_PUBLISHABLE_KEY as string | undefined;
  if (!apiKey || !props.issuer) return <p className="field__error" role="alert">{CONNECT_ERROR}</p>;
  return (
    <PollarProvider client={{ apiKey, stellarNetwork: props.network }}>
      {props.mode === 'connect' ? <Connect {...props} issuer={props.issuer} /> : <Redeem {...props} />}
    </PollarProvider>
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
        const token = accessToken(pollar);
        if (!token) throw new Error('no token');
        const result = await link.mutateAsync(token);
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

function Redeem({ network, balance, onDone }: Props) {
  const titleId = useId();
  const pollar = usePollar();
  const offers = useOwnOffers();
  const start = useStartOwnRedeem();
  const confirm = useConfirmOwnRedeem();
  const [view, setView] = useState<View>({ name: 'list' });
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<{ text: string; retry: boolean } | null>(null);

  const pay = async (offer: Offer) => {
    if (paying) return;
    setPaying(true);
    setFailure(null);
    try {
      if (!pollar.isAuthenticated) {
        pollar.openLoginModal();
        throw new Error('login');
      }
      const started = await start.mutateAsync(offer.id);
      const outcome = await pollar.runTx(
        'payment',
        { destination: started.destination, amount: started.amount, asset: { type: 'credit_alphanum4', code: 'YAPITA', issuer: started.issuer } },
        { memo: { type: 'text', value: started.memo } },
      );
      if (outcome.status !== 'success' && outcome.status !== 'pending') throw new Error('cosign');
      const receipt = await confirm.mutateAsync({ redemptionId: started.redemptionId, txHash: outcome.hash });
      setView({ name: 'receipt', receipt });
    } catch (error) {
      setFailure(isDataError(error) ? redeemError(error) : { text: 'No se pudo canjear, intenta de nuevo', retry: true });
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
                <h2 id={titleId} className="sheet__bar-title">Canjear en la red principal</h2>
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
              <h2 id={titleId} className="sheet__bar-title">Canjear en la red principal</h2>
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
