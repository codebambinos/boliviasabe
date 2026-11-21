// /p/:id: a question's conversation as its own page, outside the shell (SPEC 04, SPEC 10). «Volver» returns to
// where the person was. It brings its own AuthGate: Guardar, Reportar and answering need the account wall here too.
import { useParams } from 'react-router';
import { sendDraftAnswer } from '../components/AnswerBox';
import { sendDraftComment } from '../components/AnswerThread';
import { AuthGate, useRegisterPendingHandlers } from '../components/AuthGate';
import { PageFrame } from '../components/PageFrame';
import { QuestionDetail } from '../components/QuestionDetail';
import { useGoBack } from '../components/useGoBack';
import { useCreateAnswer, useCreateComment, useRefresh, useToggleSaved } from '../data';
import { UnavailablePage } from './UnavailablePage';

export function QuestionDetailPage() {
  const id = Number(useParams().id);
  if (!Number.isSafeInteger(id) || id <= 0) return <UnavailablePage title="Pregunta" />;
  return (
    <AuthGate>
      <Page id={id} />
    </AuthGate>
  );
}

function Page({ id }: { id: number }) {
  // A question opened from a link or after signing in goes back to ¿Alguien sabe?
  const goBack = useGoBack('/preguntas');
  const refresh = useRefresh();
  const toggleSaved = useToggleSaved();
  const createAnswer = useCreateAnswer();
  const createComment = useCreateComment();
  useRegisterPendingHandlers({
    'save-question': ({ id: questionId }) => toggleSaved.mutate({ kind: 'question', id: questionId }),
    'save-answer': ({ id: answerId }) => toggleSaved.mutate({ kind: 'answer', id: answerId }),
    'send-answer': ({ questionId }) => sendDraftAnswer(questionId, createAnswer.mutateAsync),
    'send-comment': ({ answerId, questionId }) => sendDraftComment(answerId, questionId, createComment.mutateAsync),
  });
  return (
    <PageFrame title="Pregunta">
      <main className="page__main">
        {/* A deleted question refreshes the lists only now, as it is left (useRemoveQuestion) */}
        <QuestionDetail
          id={id}
          variant="page"
          onGone={() => {
            refresh('questions');
            goBack();
          }}
        />
      </main>
    </PageFrame>
  );
}
