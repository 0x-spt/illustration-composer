import { toast } from '../shell/toastStore';
import { decorEdited, useEditor } from './store';

let warned = false;

/**
 * Call before an action that re-lays the background decor (format, detail, background, a new composition).
 * If the user edited the decor, those edits are about to be lost: say so, once per session.
 */
export function warnDecorRebuild(): void {
  if (warned) return;
  const { history, library } = useEditor.getState();
  if (!decorEdited(history.present, library)) return;
  warned = true;
  toast('Декор фона пересобран', 'info', [
    'Ручные правки декора сбрасываются при смене формата, детализации и подложки, а также при новой сборке.',
  ]);
}
