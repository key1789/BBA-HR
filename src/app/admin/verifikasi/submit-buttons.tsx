"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  formAction: (formData: FormData) => void | Promise<void>;
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  /** Hidden inputs added to the containing form. Safe only when this is the
   *  sole PendingSubmitButton inside that form (e.g. MobileActionBar). */
  hiddenFields?: Record<string, string>;
  /**
   * When set, a hidden `<input name={buttonName} value={buttonValue}>` is
   * injected into the form on click — so only the clicked button's value
   * ends up in FormData (not all siblings'). Avoids the React 19 hydration
   * mismatch that occurs when `name` is placed directly on a button whose
   * `formAction` is a server action (React overwrites `name` with the
   * serialised action ID during SSR).
   */
  buttonName?: string;
  buttonValue?: string;
};

function SubmitButtonInner({
  formAction,
  idleLabel,
  pendingLabel,
  className,
  buttonName,
  buttonValue,
}: Omit<SubmitButtonProps, "hiddenFields">) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="submit"
      formAction={formAction}
      disabled={pending}
      className={className}
      onClick={() => {
        if (!buttonName) return;
        const form = ref.current?.form;
        if (!form) return;
        // Reuse or create a single hidden input per discriminator name so we
        // don't accumulate duplicates across multiple clicks.
        const marker = `__btn_disc_${buttonName}`;
        let el = form.querySelector<HTMLInputElement>(`input[data-btn-disc="${marker}"]`);
        if (!el) {
          el = document.createElement("input");
          el.type = "hidden";
          el.name = buttonName;
          el.dataset.btnDisc = marker;
          form.appendChild(el);
        }
        el.value = buttonValue ?? "";
      }}
    >
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
  buttonName,
  buttonValue,
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
        buttonName={buttonName}
        buttonValue={buttonValue}
      />
    </>
  );
}
