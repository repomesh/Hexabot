/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { isScalar, parseDocument, type YAMLMap } from "yaml";

const HIGHLIGHT_CLASS = "workflow-yaml-node-def-highlight";

export function useYamlHighlight(
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>,
  monacoRef: MutableRefObject<Monaco | null>,
  highlightDef?: string,
  onHighlightClear?: () => void,
) {
  const decorationsRef = useRef<string[]>([]);
  const rangeRef = useRef<{ startLine: number; endLine: number } | null>(null);
  const onHighlightClearRef = useRef(onHighlightClear);
  const highlightDefRef = useRef(highlightDef);

  onHighlightClearRef.current = onHighlightClear;
  highlightDefRef.current = highlightDef;

  /** Remove decorations and reset range; optionally notify parent. */
  const clearHighlight = useCallback(
    (notify = false) => {
      const editorInstance = editorRef.current;

      if (editorInstance) {
        decorationsRef.current = editorInstance.deltaDecorations(
          decorationsRef.current,
          [],
        );
      }
      rangeRef.current = null;
      if (notify) {
        onHighlightClearRef.current?.();
      }
    },
    [editorRef],
  );
  /** Apply or clear highlight for the given definition name. */
  const setHighlight = useCallback(
    (defName: string | null) => {
      const editorInstance = editorRef.current;
      const monacoInstance = monacoRef.current;

      if (!editorInstance || !monacoInstance || !defName) {
        clearHighlight();

        return;
      }

      const model = editorInstance.getModel();

      if (!model) return;

      try {
        const doc = parseDocument(model.getValue());
        const defsMap = doc.getIn(["defs"], true) as YAMLMap | undefined;

        if (!defsMap?.items) return;

        const pair = defsMap.items.find((item) => {
          if (!item || typeof item !== "object" || !("key" in item))
            return false;

          return isScalar(item.key) && item.key.value === defName;
        }) as
          | {
              key: { range?: [number, number, number] };
              value: { range?: [number, number, number] };
            }
          | undefined;

        if (!pair?.key?.range || !pair?.value?.range) return;

        const startLine = model.getPositionAt(pair.key.range[0]).lineNumber;
        const endLine = model.getPositionAt(
          Math.max(pair.key.range[0], pair.value.range[1] - 1),
        ).lineNumber;

        rangeRef.current = { startLine, endLine };
        decorationsRef.current = editorInstance.deltaDecorations(
          decorationsRef.current,
          [
            {
              range: new monacoInstance.Range(startLine, 1, endLine, 1),
              options: {
                isWholeLine: true,
                className: HIGHLIGHT_CLASS,
                overviewRuler: {
                  color: "hsla(174,58%,38%,0.8)",
                  position: monacoInstance.editor.OverviewRulerLane.Full,
                },
              },
            },
          ],
        );
        editorInstance.revealLineInCenter(
          startLine,
          monacoInstance.editor.ScrollType.Immediate,
        );
      } catch {
        // YAML parsing failure — nothing to highlight
      }
    },
    [editorRef, monacoRef, clearHighlight],
  );
  /**
   * Call inside Monaco's `onMount`. Reveals the current highlight (if any)
   * and registers a click handler that clears it on outside-range clicks.
   */
  const setupHighlightOnMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      if (highlightDefRef.current) {
        setHighlight(highlightDefRef.current);
      }
      editorInstance.onMouseDown((e) => {
        const { startLine, endLine } = rangeRef.current ?? {};

        if (startLine === undefined || endLine === undefined) return;

        const line = e.target.position?.lineNumber;

        if (line !== undefined && line >= startLine && line <= endLine) return;

        clearHighlight(true);
      });
    },
    [setHighlight, clearHighlight],
  );

  // React to highlightDef changes after the editor is already mounted
  useEffect(() => {
    if (!editorRef.current) return;
    setHighlight(highlightDef ?? null);
  }, [highlightDef, editorRef, setHighlight]);

  return { setupHighlightOnMount };
}
