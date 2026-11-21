// /nueva-contrasena: where the recovery e-mail link lands, outside the shell (SPEC 04, SPEC 07).
// Three states: checking the link, the form (valid link) and «Este enlace ya no sirve».
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { isDataError, useRecoveryReady, useUpdatePassword } from '../data';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { errorMessage } from '../components/messages';
import { PageFrame } from '../components/PageFrame';
import '../components/auth-sheet.css';

const PASSWORD_HINT = 'La contraseña tiene al menos 6 caracteres';

export function NewPasswordPage() {
  const navigate = useNavigate();
  const ready = useRecoveryReady();

  return (
    <PageFrame title="Nueva contraseña">
      <main className="page__main">
        {ready.isPending ? (
          <>
            <h1 tabIndex={-1} className="page__title">Nueva contraseña</h1>
            <p role="status" className="page__lead">Revisando tu enlace…</p>
          </>
        ) : ready.data ? (
          <NewPasswordForm onDone={() => navigate('/', { replace: true })} />
        ) : (
          <div className="empty">
            <h1 tabIndex={-1} className="empty__title">Este enlace ya no sirve</h1>
            <button type="button" className="btn" onClick={() => navigate('/', { replace: true, state: { forgotPassword: true } })}>
              Pedir otro
            </button>
          </div>
        )}
      </main>
    </PageFrame>
  );
}

function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState<string | undefined>();
  const update = useUpdatePassword();

  const field = isDataError(update.error) && update.error.code === 'validation' ? update.error.field : undefined;
  const passwordError = local ?? (field === 'password' ? PASSWORD_HINT : undefined);
  const general = update.error && !field ? errorMessage(update.error) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      setLocal(PASSWORD_HINT);
      document.getElementById(passwordId)?.focus();
      return;
    }
    setLocal(undefined);
    update.mutate(password, { onSuccess: onDone });
  };

  return (
    <>
      <h1 tabIndex={-1} className="page__title">Nueva contraseña</h1>
      <form className="auth__form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={passwordId}>Contraseña nueva</label>
          <div className="field__with-action">
            <input
              id={passwordId}
              className="input input--box"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? `${passwordId}-error` : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn field__action"
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={show}
              onClick={() => setShow((s) => !s)}
            >
              {show ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
          {passwordError && <p id={`${passwordId}-error`} className="field__error">{passwordError}</p>}
        </div>
        {general && <p className="auth__error" role="alert">{general}</p>}
        <button type="submit" className="btn btn--full" disabled={update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </>
  );
}
