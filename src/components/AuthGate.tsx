// Soft wall (wiki › Entrada y cuenta): acting without an account opens «Crea tu cuenta para seguir»;
// after signing in, the pending action runs on its own. Looking never needs an account.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../data';
import { AuthSheet } from './AuthSheet';

type Require = (reason: string, action: () => void, title?: string) => void;
const RequireContext = createContext<Require>((_reason, action) => action());

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const [pending, setPending] = useState<{ reason: string; action: () => void; title?: string } | null>(null);
  const signedIn = useRef(false);
  const ready = session.data?.status === 'signed-in';

  const require = useCallback<Require>(
    (reason, action, title) => {
      if (ready) action();
      else {
        signedIn.current = false;
        setPending({ reason, action, title });
      }
    },
    [ready],
  );

  return (
    <RequireContext.Provider value={require}>
      {children}
      {pending && (
        <AuthSheet
          reason={pending.reason}
          title={pending.title}
          onSignedIn={() => {
            signedIn.current = true;
          }}
          onClose={() => {
            const { action } = pending;
            setPending(null);
            if (signedIn.current) action();
          }}
        />
      )}
    </RequireContext.Provider>
  );
}

/** `requireAccount(reason, action, title?)`: runs `action` now, or after the person creates an account. */
export const useRequireAccount = () => useContext(RequireContext);
