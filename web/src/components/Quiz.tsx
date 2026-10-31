import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { QuizQuestion } from '../api';

// A few questions at the end of a chapter. Answers are shown at once; nothing is saved.
export default function Quiz({ questions }: { questions: QuizQuestion[] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-accent">Test dig selv</h2>
      <ol className="space-y-6">
        {questions.map((q, i) => (
          <Question key={i} number={i + 1} q={q} />
        ))}
      </ol>
    </section>
  );
}

function Question({ number, q }: { number: number; q: QuizQuestion }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 font-medium">
        {number}. {q.question}
      </p>
      <div className="grid gap-2">
        {q.options.map((option, i) => {
          const right = i === q.answer;
          const state = picked === null ? 'open' : right ? 'right' : picked === i ? 'wrong' : 'other';
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className={`flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                state === 'right'
                  ? 'border-jade bg-jade/15'
                  : state === 'wrong'
                    ? 'border-danger bg-danger/10'
                    : state === 'other'
                      ? 'border-line opacity-60'
                      : 'border-line hover:border-accent hover:bg-surface-2'
              }`}
            >
              {option}
              {state === 'right' && <Check className="h-5 w-5 shrink-0 text-jade" />}
              {state === 'wrong' && <X className="h-5 w-5 shrink-0 text-danger" />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="mt-3 text-sm text-muted">
          {picked === q.answer ? 'Rigtigt! ' : 'Ikke helt. '}
          {q.explanation}
        </p>
      )}
    </li>
  );
}
