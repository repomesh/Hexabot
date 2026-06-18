/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { LineCounter, parseDocument, type YAMLMap } from "yaml";

const HIGHLIGHT_CLASS = "workflow-yaml-node-def-highlight";

type HighlightState = {
  defName: string | null;
  startLine: number | null;
  endLine: number | null;
  decorationIds: string[];
};

const EMPTY_HIGHLIGHT_STATE: HighlightState = {
  defName: null,
  startLine: null,
  endLine: null,
  decorationIds: [],
};

export function useYamlHighlight(
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>,
  monacoRef: MutableRefObject<Monaco | null>,
  highlightDef?: string,
  onHighlightClear?: () => void,
) {
  const highlightStateRef = useRef<HighlightState>({
    ...EMPTY_HIGHLIGHT_STATE,
  });
  const onHighlightClearRef = useRef(onHighlightClear);
  const highlightDefRef = useRef(highlightDef);

  onHighlightClearRef.current = onHighlightClear;
  highlightDefRef.current = highlightDef;

  /**
   * Clears Monaco decorations and resets the local highlight tracking state.
   * Does NOT call onHighlightClear — callers decide whether to fire that.
   */
  const applyHighlightClear = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      highlightStateRef.current.decorationIds = editorInstance.deltaDecorations(
        highlightStateRef.current.decorationIds,
        [],
      );
      highlightStateRef.current = { ...EMPTY_HIGHLIGHT_STATE };
    },
    [],
  );
  const revealNodeDef = useCallback(
    (defName: string) => {
      const editorInstance = editorRef.current;
      const monacoInstance = monacoRef.current;

      if (!editorInstance || !monacoInstance) return;

      const model = editorInstance.getModel();

      if (!model) return;

      try {
        const lineCounter = new LineCounter();
        const doc = parseDocument(model.getValue(), { lineCounter });
        const defsMap = doc.getIn(["defs"], true) as YAMLMap | undefined;

        if (!defsMap || !("items" in defsMap)) return;

        const pair = defsMap.items.find(
          (item) =>
            item &&
            typeof item === "object" &&
            "key" in item &&
            item.key !== null &&
            typeof item.key === "object" &&
            "value" in item.key &&
            (item.key as { value: unknown }).value === defName,
        ) as
          | {
              key: { range?: [number, number, number] };
              value: { range?: [number, number, number] };
            }
          | undefined;

        if (!pair?.key?.range || !pair?.value?.range) return;

        const keyOffset = pair.key.range[0];
        const valueContentEnd = pair.value.range[1];
        const startLine = lineCounter.linePos(keyOffset).line;
        const endOffset =
          valueContentEnd > keyOffset ? valueContentEnd - 1 : keyOffset;
        const endLine = lineCounter.linePos(endOffset).line;
        const decorationIds = editorInstance.deltaDecorations(
          highlightStateRef.current.decorationIds,
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

        highlightStateRef.current = {
          defName,
          startLine,
          endLine,
          decorationIds,
        };
        // ScrollType.Immediate (1) sets scroll synchronously — prevents Monaco's
        // own initial-render requestAnimationFrame from resetting it to position 0.
        editorInstance.revealLinesInCenter(startLine, endLine, 1);
      } catch {
        // If YAML parsing fails, do nothing
      }
    },
    [editorRef, monacoRef],
  );
  const clearNodeDefHighlight = useCallback(() => {
    const editorInstance = editorRef.current;

    if (!editorInstance) return;
    applyHighlightClear(editorInstance);
  }, [applyHighlightClear, editorRef]);
  /**
   * Call inside Monaco's `onMount` after setting `editorRef.current`.
   * Reveals the current `highlightDef` (if any) and registers the mousedown
   * handler that clears the highlight on outside-range clicks.
   */
  const setupHighlightOnMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      if (highlightDefRef.current) {
        revealNodeDef(highlightDefRef.current);
      }
      editorInstance.onMouseDown((e) => {
        const state = highlightStateRef.current;

        if (
          !state.defName ||
          state.startLine === null ||
          state.endLine === null
        ) {
          return;
        }

        const clickedLine = e.target.position?.lineNumber;

        if (
          clickedLine === undefined ||
          clickedLine < state.startLine ||
          clickedLine > state.endLine
        ) {
          applyHighlightClear(editorInstance);
          onHighlightClearRef.current?.();
        }
      });
    },
    [applyHighlightClear, revealNodeDef],
  );

  // React to highlightDef changes after the editor is already mounted
  useEffect(() => {
    if (!editorRef.current) return;

    if (highlightDef) {
      revealNodeDef(highlightDef);
    } else {
      clearNodeDefHighlight();
    }
  }, [clearNodeDefHighlight, editorRef, highlightDef, revealNodeDef]);

  return { setupHighlightOnMount };
}
