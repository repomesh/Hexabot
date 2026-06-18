/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { useCallback, useState } from "react";

/**
 * Manages the "See Code" feature: tracks which node's def is currently
 * highlighted in the YAML editor.
 *
 *   string → that def is active (YAML highlighted)
 *   null   → no active highlight
 */
export function useWorkflowNodeCode() {
  const [activeCodeDef, setActiveCodeDef] = useState<string | null>(null);
  /**
   * Toggle highlight for a def, or clear it.
   * Called with no args (or null) to clear; with a def name to toggle.
   */
  const setActive = useCallback((defName?: string | null) => {
    setActiveCodeDef((prev) =>
      !defName ? null : prev === defName ? null : defName,
    );
  }, []);

  return { activeCodeDef, setActive };
}
