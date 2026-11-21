// /p/:id: a question's conversation as its own page, outside the shell (SPEC 04, SPEC 10). «Volver» returns to
// where the person was. It brings its own AuthGate: Guardar, Reportar and answering need the account wall here too.
import { useParams } from 'react-router';
import { sendDraftAnswer } from '../components/AnswerBox';
import { sendDraftComment } from '../components/AnswerThread';
import { AuthGate, useRegisterPendingHandlers } from '../components/AuthGate';
import { PageFrame } from '../components/PageFrame';
import { QuestionDetail } from '../components/QuestionDetail';
import { useGoBack } from '../components/useGoBack';
import { useCreateAnswer, useCreateComment, useToggleSaved } from '../data';
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
  const goBack = useGoBack();
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
        <QuestionDetail id={id} variant="page" onGone={goBack} />
      </main>
    </PageFrame>
  );
}
