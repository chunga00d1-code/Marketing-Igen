import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { TemplateLayer } from './types';

interface UseBulkKeyboardShortcutsOptions {
  layers: TemplateLayer[];
  selectedLayerId: string;
  setEditingLayerId: Dispatch<SetStateAction<string>>;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return !!element && (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
    || element.getAttribute('contenteditable') === 'true'
  );
}

export function useBulkKeyboardShortcuts({
  layers,
  selectedLayerId,
  setEditingLayerId,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onUndo,
  onRedo,
}: UseBulkKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      const modifierPressed = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifierPressed && key === 'c') {
        event.preventDefault();
        onCopy();
        return;
      }
      if (modifierPressed && key === 'v') {
        event.preventDefault();
        onPaste();
        return;
      }
      if (modifierPressed && key === 'd') {
        event.preventDefault();
        onDuplicate();
        return;
      }
      if (modifierPressed && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) onRedo(); else onUndo();
        return;
      }
      if (modifierPressed && key === 'y') {
        event.preventDefault();
        onRedo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        onDelete();
        return;
      }

      const layer = layers.find((item) => item.id === selectedLayerId);
      if (
        layer?.type === 'text'
        && !layer.locked
        && !event.altKey
        && (event.key === 'Backspace' || event.key.length === 1)
      ) {
        setEditingLayerId(selectedLayerId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    layers,
    onCopy,
    onDelete,
    onDuplicate,
    onPaste,
    onRedo,
    onUndo,
    selectedLayerId,
    setEditingLayerId,
  ]);
}
