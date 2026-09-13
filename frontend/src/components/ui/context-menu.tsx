import {useEffect, useRef, type HTMLAttributes, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {cn} from '@/lib/utils';

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function ContextMenu({open, x, y, onOpenChange, children}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onOpenChange, open]);

  if (!open) return null;
  const menuWidth = Math.min(224, window.innerWidth - 16);
  const left = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 8);
  const top = Math.max(8, Math.min(y, window.innerHeight - 320));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Object actions"
      onContextMenu={(event) => event.preventDefault()}
      style={{position: 'fixed', left, top, width: menuWidth, maxHeight: 312}}
      className="z-50 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--popover)] py-1 text-[var(--popover-foreground)] shadow-md"
    >
      {children}
    </div>,
    document.body,
  );
}

export function ContextMenuItem({className, onClick, ...props}: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'mx-1 flex h-9 w-[calc(100%_-_0.5rem)] cursor-pointer items-center gap-2 rounded-sm px-2.5 text-left text-sm outline-none transition-colors hover:bg-[var(--accent)] focus:bg-[var(--accent)] [&_svg]:h-4 [&_svg]:w-4',
        className,
      )}
      onClick={onClick}
      {...props}
    />
  );
}

export function ContextMenuSeparator() {
  return <div role="separator" className="mx-1 my-1 border-t border-[var(--border)]" />;
}
