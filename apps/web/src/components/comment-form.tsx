"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCommentAction } from "@/app/actions";

export function CommentForm({ ticketId, number, active }: { ticketId: string; number: number; active: boolean }) {
  const [state, action, pending] = useActionState(addCommentAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card mb-4 space-y-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="number" value={number} />
      <label className="label" htmlFor="comment-body">
        Parler à l&apos;agent
      </label>
      <textarea
        id="comment-body"
        name="body"
        rows={2}
        required
        maxLength={4000}
        className="input"
        placeholder={
          active
            ? "Une précision, une correction de cap… L'agent la lit avant sa prochaine passe."
            : "Une note sur ce ticket. Relance-le pour que l'agent la prenne en compte."
        }
      />
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer"}
        </button>
        {state.ok && <span className="text-sm text-emerald-400">Envoyé</span>}
        {state.error && <span className="whitespace-pre-wrap text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
