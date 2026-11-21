// TEMPORARY smoke screen of ¿Alguien sabe? (T11). T20 builds the real one.
import { Hint } from '../components/Hint';
import { useShell } from '../components/useShell';
import type { City } from '../data';

export function PreguntasPage() {
  return <PreguntasSample city={useShell().city} />;
}

function PreguntasSample({ city }: { city: City }) {
  return (
    <>
      <h1 className="screen-title">¿Alguien sabe?</h1>
      <Hint id="preguntas">Pregunta lo que necesites saber: quien te ayude gana yapitas.</Hint>
      <div className="empty">
        <h2 className="empty__title">Nadie preguntó todavía en {city}</h2>
        <p className="empty__text">¿Buscas un plomero, una farmacia de turno o si hay agua en tu zona? Pregunta con el botón «Preguntar».</p>
      </div>
    </>
  );
}

