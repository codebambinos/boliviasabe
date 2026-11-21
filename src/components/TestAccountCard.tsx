// Yo › «Mi cuenta de prueba» (wiki #157): short address, Copiar and Ver en el explorador.
// States: ready · «Preparando tu cuenta» · error + Reintentar.
import { useState } from 'react';
import type { Wallet } from '../data';
import { ExternalIcon } from './icons';
import { EXPLORER_ACCOUNT, shortHash } from './movements';

type TestAccountCardProps = { wallet: Wallet | undefined; onRetry: () => void };

export function TestAccountCard({ wallet, onRetry }: TestAccountCardProps) {
  return (
    <div className="card yo-grid__account">
      <h2 className="card__title">Mi cuenta de prueba</h2>
      <p className="account__why">Cada yapita queda anotada en un registro público que nadie puede cambiar.</p>
      {wallet?.status === 'ready' && wallet.address ? (
        <div className="yo-fade">
          <p className="account__address num">{shortHash(wallet.address)}</p>
          <div className="account__actions">
            <CopyButton text={wallet.address} />
            <a className="btn btn--secondary btn--small" href={`${EXPLORER_ACCOUNT}${wallet.address}`} target="_blank" rel="noreferrer">
              Ver en el explorador <ExternalIcon size={14} />
            </a>
          </div>
        </div>
      ) : wallet?.status === 'error' ? (
        <>
          <p className="empty__text">Algo falló, intenta de nuevo</p>
          <button type="button" className="btn btn--secondary btn--small" onClick={onRetry}>Reintentar</button>
        </>
      ) : (
        <p className="empty__text" role="status">Preparando tu cuenta…</p>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--secondary btn--small"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        })
      }
    >
      <span key={String(copied)} className="yo-fade" aria-live="polite">{copied ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}
