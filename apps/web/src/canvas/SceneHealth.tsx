import { sceneCollisions } from '@ic/core';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useDeferredValue, useMemo } from 'react';
import { nodeLabel, selectScene } from '../state/selectors';
import { useEditor } from '../state/store';

/**
 * Whether items overlap by the layout's own rule (D13), after every edit. The check runs on
 * a deferred scene, so a drag stays smooth and the chip catches up when the hand stops.
 */
export function SceneHealth() {
  const scene = useDeferredValue(useEditor(selectScene));
  const lib = useEditor((s) => s.library);
  const pairs = useMemo(() => (lib ? sceneCollisions(scene, lib) : []), [scene, lib]);
  const items = scene.nodes.filter((n) => n.ref.kind === 'item').length;
  if (!lib || items < 2) return null;

  if (pairs.length === 0) {
    return (
      <div className="health" title="Предметы не наезжают друг на друга">
        <CircleCheck size={15} strokeWidth={2} aria-hidden="true" />
        <span className="health__text">Наложений нет</span>
      </div>
    );
  }
  const label = (id: string) => {
    const node = scene.nodes.find((n) => n.id === id);
    return node ? nodeLabel(node, lib).toLowerCase() : id;
  };
  const [a, b] = pairs[0]!;
  const more = pairs.length > 1 ? ` и ещё ${pairs.length - 1}` : '';
  return (
    <div className="health health--warn" title="Подвиньте один из предметов или уменьшите масштаб">
      <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
      <span className="health__text">
        Наложение: {label(a)} и {label(b)}
        {more}
      </span>
    </div>
  );
}
