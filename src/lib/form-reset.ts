import { useState } from "react";

// Reset local form fields before rendering changed inputs, never after paint.
// The callback may only update state owned by the component calling this hook.
export function useFormReset(deps: unknown[], reset: () => void) {
  const [previous, setPrevious] = useState<unknown[] | null>(null);
  if (previous === null || deps.length !== previous.length || deps.some((value, i) => !Object.is(value, previous[i]))) {
    setPrevious([...deps]);
    reset();
  }
}
