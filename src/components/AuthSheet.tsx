// «Crea tu cuenta para seguir» (wiki › Entrada y cuenta): Google or e-mail + password, and the
// «¿La olvidaste?» step. Closing it returns to where the person was, with nothing lost.
import { useId, useState, type FormEvent } from 'react';
import { isDataError, useRequestPasswordReset, useSignInWithEmail, useSignInWithGoogle } from '../data';
import { CloseIcon, EyeIcon, EyeOffIcon, GoogleIcon, MailIcon } from './icons';
import { errorMessage } from './messages';
import { Sheet } from './Sheet';
import './auth-sheet.css';

type Mode = 'choose' | 'email' | 'forgot';
/** The steps in order: going to a later one slides forward (from the right), to an earlier one back. */
const ORDER: Mode[] = ['choose', 'email', 'forgot'];
type AuthSheetProps = {
  reason: string;
  title?: string;
  /** Opens straight on the e-mail form («Usar mi correo» in Yo) or on «¿La olvidaste?» (invalid-link page). */
  start?: 'email' | 'forgot';
  /** Runs (and is awaited) before leaving for Google, to save the pending action and any draft. */
  beforeGoogle?: () => Promise<void>;
  onSignedIn: () => void;
  onClose: () => void;
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const EMAIL_HINT = 'Escribe un correo con @';
const PASSWORD_HINT = 'La contraseña tiene al menos 6 caracteres';
const SENT_MESSAGE = 'Te enviamos un correo. Si no llega, revisa Spam';

export function AuthSheet({ reason, title = 'Crea tu cuenta para seguir', start, beforeGoogle, onSignedIn, onClose }: AuthSheetProps) {
  const titleId = useId();
  const [mode, setCurrentMode] = useState<Mode>(start ?? 'choose');
  // Like a tab change: the new step slides in from the side it lives on. The first one arrives with the sheet.
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null);
  const setMode = (next: Mode) => {
    setDirection(ORDER.indexOf(next) > ORDER.indexOf(mode) ? 'forward' : 'back');
    setCurrentMode(next);
  };
  // The e-mail is kept here so it survives going to «¿La olvidaste?» and back
  const [emailValue, setEmailValue] = useState('');
  const google = useSignInWithGoogle();
  // Saving the pending action can take a moment: the button already says «Iniciando sesión…» meanwhile
  const [saving, setSaving] = useState(false);
  const googleBusy = google.isPending || saving;
  const email = useSignInWithEmail();
  const reset = useRequestPasswordReset();

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close) => {
        const done = () => {
          onSignedIn();
          close();
        };
        const withGoogle = () => {
          setSaving(true);
          Promise.resolve(beforeGoogle?.())
            .catch(() => undefined)
            .then(() => {
              google.mutate(undefined, { onSuccess: done });
              setSaving(false);
            });
        };
        const forgot = mode === 'forgot';
        return (
          <>
            <header className="sheet__bar">
              <h2 id={titleId} className="sheet__bar-title">{forgot ? 'Recupera tu contraseña' : title}</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">
              <div className="sheet__content auth">
                <div key={mode} className="auth__pane" data-direction={direction ?? undefined}>
                  <p className="auth__reason">
                    {forgot ? 'Te enviamos un correo con un enlace para poner una contraseña nueva.' : reason}
                  </p>
                  {mode === 'choose' && (
                    <div className="auth__choices">
                      <button type="button" className="btn btn--secondary btn--full auth__google" disabled={googleBusy} onClick={withGoogle}>
                        <GoogleIcon /> {googleBusy ? 'Iniciando sesión…' : 'Continuar con Google'}
                      </button>
                      <button type="button" className="btn btn--secondary btn--full" onClick={() => setMode('email')}>
                        <MailIcon size={20} /> Usar mi correo
                      </button>
                      {google.error && <p className="auth__error" role="alert">{errorMessage(google.error)}</p>}
                    </div>
                  )}
                  {mode === 'email' && (
                    <EmailForm
                      email={emailValue}
                      onEmailChange={setEmailValue}
                      pending={email.isPending}
                      error={email.error}
                      googlePending={googleBusy}
                      onEdit={() => email.error && email.reset()}
                      onSubmit={(values) => email.mutate(values, { onSuccess: done })}
                      onGoogle={withGoogle}
                      onForgot={() => {
                        email.reset();
                        reset.reset();
                        setMode('forgot');
                      }}
                      onBack={() => setMode('choose')}
                    />
                  )}
                  {forgot && (
                    <ForgotForm
                      email={emailValue}
                      onEmailChange={setEmailValue}
                      pending={reset.isPending}
                      sent={reset.isSuccess}
                      error={reset.error}
                      onSubmit={(address) => reset.mutate(address)}
                      onBack={() => {
                        reset.reset();
                        setMode('email');
                      }}
                    />
                  )}
                </div>
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

type EmailFormProps = {
  email: string;
  onEmailChange: (value: string) => void;
  pending: boolean;
  error: unknown;
  googlePending: boolean;
  onEdit: () => void;
  onSubmit: (values: { email: string; password: string }) => void;
  onGoogle: () => void;
  onForgot: () => void;
  onBack: () => void;
};

function EmailForm({ email, onEmailChange, pending, error, googlePending, onEdit, onSubmit, onGoogle, onForgot, onBack }: EmailFormProps) {
  const emailId = useId();
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState<{ email?: string; password?: string }>({});

  // Wiki #73: a Google e-mail points to its button; a wrong password points to «¿La olvidaste?»
  const code = isDataError(error) ? error.code : undefined;
  const googleAccount = code === 'google_account';
  const wrongPassword = code === 'wrong_password';
  // Field errors come first from the form, then from the data layer's `details.field`
  const field = isDataError(error) && error.code === 'validation' ? error.field : undefined;
  const emailError = local.email ?? (field === 'email' ? EMAIL_HINT : undefined);
  const passwordError = local.password ?? (field === 'password' ? PASSWORD_HINT : wrongPassword ? 'Contraseña incorrecta' : undefined);
  const general = error && !field && !googleAccount && !wrongPassword ? errorMessage(error) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof local = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = EMAIL_HINT;
    if (password.length < 6) next.password = PASSWORD_HINT;
    setLocal(next);
    if (next.email || next.password) {
      document.getElementById(next.email ? emailId : passwordId)?.focus();
      return;
    }
    onSubmit({ email: email.trim(), password });
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
          value={email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
          onChange={(e) => {
            onEmailChange(e.target.value);
            onEdit();
          }}
        />
        {emailError && <p id={`${emailId}-error`} className="field__error">{emailError}</p>}
      </div>
      {googleAccount ? (
        <div className="auth__choices">
          <p className="auth__error" role="alert">Esta cuenta entra con Google</p>
          <button type="button" className="btn btn--full auth__google" disabled={googlePending} onClick={onGoogle}>
            <GoogleIcon /> {googlePending ? 'Iniciando sesión…' : 'Continuar con Google'}
          </button>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor={passwordId}>Contraseña</label>
            <div className="field__with-action">
              <input
                id={passwordId}
                className="input input--box"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? `${passwordId}-error` : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  onEdit();
                }}
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
            {wrongPassword && (
              <button type="button" className="auth__link" onClick={onForgot}>¿La olvidaste?</button>
            )}
          </div>
          {general && <p className="auth__error" role="alert">{general}</p>}
          <button type="submit" className="btn btn--full" disabled={pending}>
            {pending ? 'Iniciando sesión…' : 'Continuar'}
          </button>
        </>
      )}
      <button type="button" className="btn btn--secondary btn--full" onClick={onBack}>
        Volver a las opciones
      </button>
    </form>
  );
}

type ForgotFormProps = {
  email: string;
  onEmailChange: (value: string) => void;
  pending: boolean;
  sent: boolean;
  error: unknown;
  onSubmit: (email: string) => void;
  onBack: () => void;
};

function ForgotForm({ email, onEmailChange, pending, sent, error, onSubmit, onBack }: ForgotFormProps) {
  const emailId = useId();
  const [local, setLocal] = useState<string | undefined>();
  const field = isDataError(error) && error.code === 'validation' ? error.field : undefined;
  const emailError = local ?? (field === 'email' ? EMAIL_HINT : undefined);
  const general = error && !field ? errorMessage(error) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setLocal(EMAIL_HINT);
      document.getElementById(emailId)?.focus();
      return;
    }
    setLocal(undefined);
    onSubmit(email.trim());
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
          value={email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
          onChange={(e) => onEmailChange(e.target.value)}
        />
        {emailError && <p id={`${emailId}-error`} className="field__error">{emailError}</p>}
      </div>
      {general && <p className="auth__error" role="alert">{general}</p>}
      {/* The live region stays in the page so the message is announced when it appears */}
      <p className="sr-only" role="status">{sent ? SENT_MESSAGE : ''}</p>
      {sent && <p className="auth__sent" aria-hidden="true">{SENT_MESSAGE}</p>}
      <button type="submit" className="btn btn--full" disabled={pending}>
        {pending ? 'Enviando…' : sent ? 'Enviar otra vez' : 'Enviar correo'}
      </button>
      <button type="button" className="btn btn--secondary btn--full" onClick={onBack}>
        Volver a entrar
      </button>
    </form>
  );
}
