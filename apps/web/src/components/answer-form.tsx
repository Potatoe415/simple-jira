"use client";

import { useActionState, useRef } from "react";
import { answerQuestionAction } from "@/app/actions";

export function AnswerForm({ questionId, options }: { questionId: string; options: string[] }) {
  const [state, action, pending] = useActionState(answerQuestionAction, {});
  const answerRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="question_id" value={questionId} />
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                if (answerRef.current) answerRef.current.value = option;
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={answerRef}
        name="answer"
        rows={2}
        required
        placeholder="Your answer, in one sentence"
        className="input"
      />
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Sending…" : "Answer and unblock"}
        </button>
        {state.error && <span className="text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
