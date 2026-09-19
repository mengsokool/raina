"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function TopbarActions({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("topbar-actions"));
  }, []);

  if (!target) return null;

  return createPortal(children, target);
}
