import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const CURSOR_OFFSET = 12;

type CursorTooltipContextValue = {
  setContent: (content: string | null) => void;
  setPosition: (x: number, y: number) => void;
};

const CursorTooltipContext = React.createContext<CursorTooltipContextValue | null>(null);

export function CursorTooltipProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  const value = React.useMemo(
    () => ({
      setContent,
      setPosition,
    }),
    []
  );

  const tooltipEl = content ? (
    <div
      className={cn(
        "fixed z-[100] pointer-events-none overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md max-w-xs"
      )}
      style={{
        left: position.x + CURSOR_OFFSET,
        top: position.y + CURSOR_OFFSET,
      }}
    >
      {content}
    </div>
  ) : null;

  return (
    <CursorTooltipContext.Provider value={value}>
      {children}
      {createPortal(tooltipEl, document.body)}
    </CursorTooltipContext.Provider>
  );
}

export function CursorTooltip({
  content,
  children,
  asChild,
}: {
  content: string;
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const ctx = React.useContext(CursorTooltipContext);

  const handleMouseEnter = React.useCallback(
    (e: React.MouseEvent) => {
      ctx?.setContent(content);
      ctx?.setPosition(e.clientX, e.clientY);
    },
    [content, ctx]
  );

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent) => {
      ctx?.setPosition(e.clientX, e.clientY);
    },
    [ctx]
  );

  const handleMouseLeave = React.useCallback(() => {
    ctx?.setContent(null);
  }, [ctx]);

  if (!ctx) return <>{children}</>;

  const props = {
    onMouseEnter: handleMouseEnter,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, props);
  }

  return (
    <span className="inline-block" {...props}>
      {children}
    </span>
  );
}
