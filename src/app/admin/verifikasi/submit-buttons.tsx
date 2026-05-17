"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  formAction: (formData: FormData) => void | Promise<void>;
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  hiddenFields?: Record<string, string>;
};

function SubmitButtonInner({
  formAction,
  idleLabel,
  pendingLabel,
  className,
}: Omit<SubmitButtonProps, "hiddenFields">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function PendingSubmitButton({
  formAction,
  idleLabel,
  pendingLabel,
  className,
  hiddenFields,
}: SubmitButtonProps) {
  return (
    <>
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={`${name}-${value}`} type="hidden" name={name} value={value} />
      ))}
      <SubmitButtonInner
        formAction={formAction}
        idleLabel={idleLabel}
        pendingLabel={pendingLabel}
        className={className}
      />
    </>
  );
}
