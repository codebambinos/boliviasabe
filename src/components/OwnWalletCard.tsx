// Yo › «Mi billetera propia · Stellar (red principal)» (SPEC 31, wiki › flujo-final › Yo, #221). Only with
// VITE_MAINNET_ENABLED and for invited accounts (the server decides). Not linked: «Conectar mi billetera». Linked:
// address, balance read from Horizon, explorer and «Canjear en la red principal». Pollar's SDK lives in
// OwnWalletPollar and loads only when one of the two buttons is used, so the pilot never downloads it.
import { lazy, Suspense, useState } from 'react';
import { MAINNET_ENABLED, useOwnWallet } from '../data';
import { CheckIcon, CopyIcon, ExternalIcon } from './icons';
import { shortHash } from './movements';
import { Toast } from './Toast';
import { Yapita } from './Yapita';

const OwnWalletPollar = lazy(() => import('./OwnWalletPollar'));

const EXPLORER = { testnet: 'https://stellar.expert/explorer/testnet', mainnet: 'https://stellar.expert/explorer/public' } as const;

export function OwnWalletCard() {
  const status = useOwnWallet();
  const [action, setAction] = useState<'connect' | 'redeem' | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!MAINNET_ENABLED || !status.data?.invited) return null;
  const { address, balance, network } = status.data;
  const networkName = network === 'mainnet' ? 'red principal' : 'red de pruebas';

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the address stays visible to copy by hand */
    }
  };

  return (
    <div className="card own-wallet yo-grid__own">
      <h2 className="card__title">Mi billetera propia</h2>
      <p className="meta own-wallet__net">Stellar ({networkName})</p>

      {address ? (
        <>
          <div className="own-wallet__balance">
            <Yapita size="lg" />
            <p className="profile__amount num">{balance === null ? <span className="num-wait" aria-label="Cargando" /> : balance}</p>
            <p className="meta">yapitas</p>
          </div>
          <p className="own-wallet__address">
            <span className="num">{shortHash(address)}</span>
            <button type="button" className="btn btn--secondary btn--small" onClick={copy}>
              {copied ? (
                <>
                  <CheckIcon size={16} /> Copiado
                </>
              ) : (
                <>
                  <CopyIcon size={16} /> Copiar
                </>
              )}
            </button>
          </p>
          <a className="row__record" href={`${EXPLORER[network]}/account/${address}`} target="_blank" rel="noreferrer">
            Ver en el explorador <ExternalIcon size={12} />
          </a>
          <button type="button" className="btn btn--full own-wallet__action" onClick={() => setAction('redeem')}>
            Canjear en la red principal
          </button>
        </>
      ) : (
        <>
          <p className="empty__text">Tu propia billetera en la red principal de Stellar. Sin claves ni XLM: lo cubre la app.</p>
          <button type="button" className="btn btn--full own-wallet__action" onClick={() => setAction('connect')}>
            Conectar mi billetera
          </button>
        </>
      )}

      {action && (
        <Suspense fallback={<p className="meta own-wallet__loading">Abriendo tu billetera…</p>}>
          <OwnWalletPollar
            mode={action}
            network={network}
            issuer={status.data.issuer}
            balance={balance}
            onDone={(message) => {
              setAction(null);
              if (message) setToast(message);
              void status.refetch();
            }}
          />
        </Suspense>
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
