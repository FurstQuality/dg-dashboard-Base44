import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * MobileSheet — bottom drawer on mobile, centered dialog on desktop.
 */
type Ctx = { isMobile: boolean };
const MobileSheetCtx = React.createContext<Ctx>({ isMobile: false });

type RootProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

export function MobileSheet({ children, open, onOpenChange }: RootProps) {
  const isMobile = useIsMobile();
  return (
    <MobileSheetCtx.Provider value={{ isMobile }}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </MobileSheetCtx.Provider>
  );
}

type TriggerProps = {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function MobileSheetTrigger({ asChild, children, className }: TriggerProps) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  return isMobile ? (
    <DrawerTrigger asChild={asChild} className={className}>
      {children}
    </DrawerTrigger>
  ) : (
    <DialogTrigger asChild={asChild} className={className}>
      {children}
    </DialogTrigger>
  );
}

export function MobileSheetClose({ asChild, children, className }: TriggerProps) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  return isMobile ? (
    <DrawerClose asChild={asChild} className={className}>
      {children}
    </DrawerClose>
  ) : (
    <DialogClose asChild={asChild} className={className}>
      {children}
    </DialogClose>
  );
}

export function MobileSheetContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  if (isMobile) {
    return (
      <DrawerContent
        className={cn("max-h-[90dvh]", className)}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-2xl overflow-y-auto px-1">{children}</div>
      </DrawerContent>
    );
  }
  return <DialogContent className={cn("sm:max-w-lg", className)}>{children}</DialogContent>;
}

export function MobileSheetHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  return isMobile ? <DrawerHeader {...props} /> : <DialogHeader {...props} />;
}

export function MobileSheetTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  return isMobile ? (
    <DrawerTitle className={className}>{children}</DrawerTitle>
  ) : (
    <DialogTitle className={className}>{children}</DialogTitle>
  );
}

export function MobileSheetDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  return isMobile ? (
    <DrawerDescription className={className}>{children}</DrawerDescription>
  ) : (
    <DialogDescription className={className}>{children}</DialogDescription>
  );
}

export function MobileSheetFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = React.useContext(MobileSheetCtx);
  return isMobile ? <DrawerFooter {...props} /> : <DialogFooter {...props} />;
}
