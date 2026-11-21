// /nueva-contrasena: where the recovery e-mail link lands, outside the shell (SPEC 04).
// Empty until T15 adds the form and checks the recovery token.
import { PageFrame } from '../components/PageFrame';

export function NewPasswordPage() {
  return (
    <PageFrame title="Nueva contraseña">
      <main className="page__main">
        <h1 tabIndex={-1} className="page__title">Nueva contraseña</h1>
      </main>
    </PageFrame>
  );
}
