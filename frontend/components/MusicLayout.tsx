import React, { ReactNode, useState } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger,
  SheetTitle
} from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MusicLayoutProps {
  sidebar: ReactNode;
  children: ReactNode; // Main Content
  player: ReactNode;
}

export function MusicLayout({ sidebar, children, player }: MusicLayoutProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Mobile Header (Only visible on small screens) */}
      <div className="md:hidden flex items-center p-4 border-b h-12">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80">
            <div className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </div>
            {React.isValidElement(sidebar) 
              ? React.cloneElement(sidebar as React.ReactElement<any>, { 
                  onItemClick: () => setOpen(false) 
                }) 
              : sidebar}
          </SheetContent>
        </Sheet>
        <span className="ml-2 font-semibold">Vibe Template CF</span>
      </div>

      <div className="flex-1 min-h-0 relative">
        {/* Desktop Layout */}
        <div className="hidden md:flex h-full">
          <aside className="w-[225px] flex-none border-r border-border/40">
            {sidebar}
          </aside>
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>

        {/* Mobile Layout (Just content, sidebar is in Sheet) */}
        <div className="md:hidden h-full">
          {children}
        </div>
      </div>

      {/* Player Bar */}
      <div className="flex-none z-50">
        {player}
      </div>
    </div>
  );
}
