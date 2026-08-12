'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NetworkBadge } from '@/components/NetworkBadge';

/**
 * MobileNav - Hamburger trigger + in-flow drawer for the shared header,
 * shown only below the md breakpoint. The drawer is a normal block (no
 * fixed/sticky, no portal) that pushes the rest of the header down when
 * open, and closes itself on toggle or after a link navigation.
 *
 * The trigger button lives inside the header's flex row, so the drawer
 * renders offset from the viewport's left edge by however far that row
 * item sits from it. A static full-bleed CSS trick can't correct for that
 * (it only recenters elements that start out page-centered), so we measure
 * the drawer's actual offset on open and cancel it with a negative margin,
 * pinning the drawer to the viewport width without going off-screen.
 *
 * The wrapper below is a shrink-to-fit flex item (sized to the button when
 * closed) and the last item in a `justify-between` row, so it hugs the
 * row's right edge. If it were left to reflow when the drawer's width jumps
 * to the viewport width, it would widen and its left edge would slide left,
 * invalidating an offset measured in the same pass. Pinning the wrapper to
 * its button-only width as soon as it mounts (before the drawer can ever
 * affect it) keeps that edge stable, so the offset measured on open is the
 * one still true after the drawer's own width/margin are applied.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);
  const [bleed, setBleed] = useState<{ marginLeft: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (wrapperRef.current) {
      setButtonWidth(wrapperRef.current.getBoundingClientRect().width);
    }
  }, []);

  useLayoutEffect(() => {
    if (open && drawerRef.current) {
      const { left } = drawerRef.current.getBoundingClientRect();
      setBleed({ marginLeft: -left, width: document.documentElement.clientWidth });
    } else {
      setBleed(null);
    }
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      className="md:hidden"
      style={buttonWidth ? { width: buttonWidth } : undefined}
    >
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="p-2 -mr-2 text-gray-400 hover:text-white transition-colors"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={drawerRef}
          style={bleed ? { marginLeft: bleed.marginLeft, width: bleed.width } : undefined}
          className="border-t border-zinc-800 bg-zinc-950"
        >
          <nav className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4">
            <Link href="/verify" onClick={close} className="text-sm text-gray-400 hover:text-white transition-colors">
              Verify
            </Link>
            <Link href="/registry" onClick={close} className="text-sm text-gray-400 hover:text-white transition-colors">
              Registry
            </Link>
            <Link href="/docs" onClick={close} className="text-sm text-gray-400 hover:text-white transition-colors">
              Docs
            </Link>
            <NetworkBadge />
          </nav>
        </div>
      )}
    </div>
  );
}
