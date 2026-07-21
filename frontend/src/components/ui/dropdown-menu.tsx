import * as React from 'react';
import {createPortal} from 'react-dom';
import {cn} from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  triggerRect: DOMRect | null;
  updatePosition: () => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | undefined>(undefined);

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error('useDropdownMenu must be used within a DropdownMenu');
  }
  return context;
}

interface DropdownMenuProps {
  children: React.ReactNode;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerRect, setTriggerRect] = React.useState<DOMRect | null>(null);
  const updatePosition = React.useCallback(() => {
    if (triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
  }, []);
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef, triggerRect, updatePosition }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownMenuContext.Provider>
  );
};

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const { open, setOpen, triggerRef, updatePosition } = useDropdownMenu();

  // Merge the forwarded ref with the context triggerRef
  React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);

  return (
    <button
      ref={triggerRef}
      onClick={(e) => {
        if (!open) updatePosition();
        setOpen(!open);
        onClick?.(e);
      }}
      {...props}
    />
  );
});
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end' | 'center';
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, children, align = 'start', ...props }, ref) => {
    const { open, setOpen, triggerRef, triggerRect, updatePosition } = useDropdownMenu();
    const contentRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement);

    React.useEffect(() => {
      if (!open) return;
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }, [open, updatePosition]);

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const isClickOnTrigger = triggerRef.current?.contains(event.target as Node);
        const isClickOnContent = contentRef.current?.contains(event.target as Node);

        if (!isClickOnContent && !isClickOnTrigger) {
          setOpen(false);
        }
      };

      if (open) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [open, setOpen, triggerRef]);

    if (!open || !triggerRect) return null;

    const viewportPadding = 8;
    const gap = 8;
    const menuWidth = Math.min(224, window.innerWidth - viewportPadding * 2);
    let left = triggerRect.left;
    if (align === 'end') {
      left = triggerRect.right - menuWidth;
    } else if (align === 'center') {
      left = triggerRect.left + triggerRect.width / 2 - menuWidth / 2;
    }
    left = Math.min(Math.max(viewportPadding, left), window.innerWidth - menuWidth - viewportPadding);

    const spaceBelow = window.innerHeight - triggerRect.bottom - gap - viewportPadding;
    const spaceAbove = triggerRect.top - gap - viewportPadding;
    const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(80, Math.min(320, openAbove ? spaceAbove : spaceBelow));

    const content = (
      <div
        ref={contentRef}
        style={{
          backgroundColor: 'var(--popover)',
          position: 'fixed',
          left: `${left}px`,
          width: `${menuWidth}px`,
          maxHeight: `${maxHeight}px`,
          overflowY: 'auto',
          ...(openAbove
            ? { bottom: `${window.innerHeight - triggerRect.top + gap}px` }
            : { top: `${triggerRect.bottom + gap}px` }),
        }}
        className={cn(
          'z-50 origin-top-right rounded-md text-popover-foreground shadow-lg ring-1 ring-border border border-border focus:outline-none',
          className
        )}
        {...props}
      >
        <div className="py-1">{children}</div>
      </div>
    );

    return createPortal(content, document.body);
  }
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onClick, ...props }, ref) => {
    const { setOpen } = useDropdownMenu();
    return (
      <div
        ref={ref}
        className={cn(
          'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
          className
        )}
        onClick={(e) => {
          onClick?.(e);
          setOpen(false);
        }}
        {...props}
      />
    );
  }
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
  )
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
