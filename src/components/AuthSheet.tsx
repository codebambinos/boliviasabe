// «Crea tu cuenta para seguir» (wiki › Entrada y cuenta): Google or e-mail + password.
// Closing it returns to where the person was, with nothing lost.
import { useId, useState, type FormEvent } from 'react';
import { isDataError, useSignInWithEmail, useSignInWithGoogle } from '../data';
import { CloseIcon, EyeIcon, EyeOffIcon, GoogleIcon, MailIcon } from './icons';
import { errorMessage } from './messages';
import { Sheet } from './Sheet';
import './auth-sheet.css';

type AuthSheetProps = { reason: string; title?: string; onSignedIn: () => void; onClose: () => void };

export function AuthSheet({ reason, title = 'Crea tu cuenta para seguir', onSignedIn, onClose }: AuthSheetProps) {
  const titleId = useId();
  const [mode, setMode] = useState<'choose' | 'email'>('choose');
  const google = useSignInWithGoogle();
  const email = useSignInWithEmail();

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close) => {
        const done = () => {
          onSignedIn();
          close();
        };
        return (
          <>
            <header className="sheet__bar">
              <h2 id={titleId} className="sheet__bar-title">{title}</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">
              <div className="sheet__content auth">
                <p className="auth__reason">{reason}</p>
                {mode === 'choose' ? (
                  <div className="auth__choices">
                    <button
                      type="button"
                      className="btn btn--secondary btn--full auth__google"
                      disabled={google.isPending}
                      onClick={() => google.mutate(undefined, { onSuccess: done })}
                    >
                      <GoogleIcon /> {google.isPending ? 'Entrando…' : 'Continuar con Google'}
                    </button>
                    <button type="button" className="btn btn--secondary btn--full" onClick={() => setMode('email')}>
                      <MailIcon size={20} /> Usar mi correo
                    </button>
                    {google.error && (
                      <p className="auth__error" role="alert">{errorMessage(google.error)}</p>
                    )}
                  </div>
                ) : (
                  <EmailForm
                    pending={email.isPending}
                    error={email.error}
                    onSubmit={(values) => email.mutate(values, { onSuccess: done })}
                    onBack={() => setMode('choose')}
                  />
                )}
                {/* New tab: the sheet and anything typed stay put (wiki › Entrada y cuenta) */}
                <p className="auth__legal">
                  Al entrar aceptas{' '}
                  <a href="/privacidad" target="_blank" rel="noopener">cómo cuidamos tus datos</a>
                </p>
              </div>
            </div>
          </>
        );
      }}
    </Sheet>
  );
}

function EmailForm({
  pending,
  error,
  onSubmit,
  onBack,
}: {
  pending: boolean;
  error: unknown;
  onSubmit: (values: { email: string; password: string }) => void;
  onBack: () => void;
}) {
  const emailId = useId();
  const passwordId = useId();
  const [values, setValues] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState<{ email?: string; password?: string }>({});

  // Field errors come first from the form, then from the data layer's `details.field`
  const field = isDataError(error) && error.code === 'validation' ? error.field : undefined;
  const emailError = local.email ?? (field === 'email' ? 'Escribe un correo con @' : undefined);
  const passwordError = local.password ?? (field === 'password' ? 'La contraseña tiene al menos 6 caracteres' : undefined);
  const general = error && !field ? errorMessage(error) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof local = {};
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) next.email = 'Escribe un correo con @';
    if (values.password.length < 6) next.password = 'La contraseña tiene al menos 6 caracteres';
    setLocal(next);
    if (next.email || next.password) {
      document.getElementById(next.email ? emailId : passwordId)?.focus();
      return;
    }
    onSubmit({ email: values.email.trim(), password: values.password });
  };

  return (
    <form className="auth__form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={emailId}>Correo</label>
        <input
          id={emailId}
          className="input input--box"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
        {emailError && <p id={`${emailId}-error`} className="field__error">{emailError}</p>}
      </div>
      <div className="field">
        <label htmlFor={passwordId}>Contraseña</label>
        <div className="field__with-action">
          <input
            id={passwordId}
            className="input input--box"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={values.password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? `${passwordId}-error` : undefined}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
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
      <button type="submit" className="btn btn--full" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      <button type="button" className="btn btn--secondary btn--full" onClick={onBack}>
        Volver a las opciones
      </button>
    </form>
  );
}
