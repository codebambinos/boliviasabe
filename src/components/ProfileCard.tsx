// Yo › profile card (wiki › 3 · Yo, SPEC 21): name, city and zone, stars, badge, balance, the bar toward the
// exchange and «Editar». While the balance loads it shows the pulsing bar, never an old number (#195).
// With the redemption switched on (SPEC 29, #219) the bar toward 100 gives way to «Canjear yapitas».
import { useEffect, useState } from 'react';
import { REDEEM_ENABLED, type Profile, type Wallet } from '../data';
import { StarIcon } from './icons';
import { CANJE_GOAL, formatStars } from './movements';
import { Yapita } from './Yapita';

type ProfileCardProps = {
  profile: Profile | null;
  wallet: Wallet | undefined;
  onEdit: () => void;
  /** Opens «Canjear» (only with the switch on). */
  onRedeem?: () => void;
};

export function ProfileCard({ profile, wallet, onEdit, onRedeem }: ProfileCardProps) {
  const balance = wallet?.balance ?? null;
  const progress = Math.min(100, Math.round(((balance ?? 0) / CANJE_GOAL) * 100));
  // The bar animates only once a balance has been shown: loading → first number lands in place (SPEC 28, A2)
  const [barLive, setBarLive] = useState(false);
  useEffect(() => {
    if (balance !== null) setBarLive(true);
  }, [balance]);
  const place = profile ? `${profile.city} · ${profile.zone}` : '';

  return (
    <div className="card profile yo-grid__profile">
      <div className="aguayo profile__stripe" />
      <div className="profile__head">
        {/* key: after «Guardar» the new name and zone fade in instead of jumping */}
        <div key={`${profile?.displayName}|${place}`} className="profile__who yo-fade">
          <h2 className="profile__name">{profile?.displayName ?? 'Sin perfil'}</h2>
          <p className="meta">{place}</p>
        </div>
        <button type="button" className="btn btn--secondary btn--small" onClick={onEdit} disabled={!profile}>
          Editar
        </button>
      </div>
      {profile && (
        <p className="profile__badge">
          {profile.stars !== null && (
            <span className="profile__stars">
              <StarIcon size={14} /> {formatStars(profile.stars)}
            </span>
          )}
          <span className="tag">{profile.badge}</span>
        </p>
      )}
      <div className="profile__balance">
        <Yapita size="lg" />
        <div>
          <p className="profile__amount num">
            {balance === null ? (
              <span className="num-wait" aria-label="Cargando" />
            ) : (
              <span key={balance} className="yo-fade">{balance}</span>
            )}
          </p>
          <p className="meta">yapitas</p>
        </div>
      </div>
      {REDEEM_ENABLED ? (
        <button type="button" className="btn btn--full profile__redeem" onClick={onRedeem} disabled={!onRedeem || balance === null}>
          Canjear yapitas
        </button>
      ) : (
        <>
          <div
            className={barLive ? 'progress progress--live' : 'progress'}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={CANJE_GOAL}
            aria-valuenow={balance ?? 0}
            aria-label="Yapitas hacia el canje"
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <p className="meta profile__goal">
            {balance ?? 0} de {CANJE_GOAL} · Canje con negocios, próximamente
          </p>
        </>
      )}
      <p className="profile__why">Ganas yapitas cuando un letrero o una respuesta tuya le sirve a alguien.</p>
    </div>
  );
}
