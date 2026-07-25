"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * Accessible zoom/pan viewer for the official released image. Keyboard:
 * +/- zoom, arrow keys pan, 0 resets. No enhancement or recognition is
 * performed — this only magnifies the official public copy.
 */
export function ImageViewer({
  src,
  alt,
  downloadLabel,
  zoomInLabel,
  zoomOutLabel,
  resetLabel,
  fullscreenLabel,
}: {
  src: string;
  alt: string;
  downloadLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  resetLabel: string;
  fullscreenLabel: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackEvent("witness_image_view");
  }, []);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const onKeyDown = (event: React.KeyboardEvent) => {
    const pan = 40;
    switch (event.key) {
      case "+":
      case "=":
        setZoom((z) => clampZoom(z + 0.5));
        break;
      case "-":
        setZoom((z) => clampZoom(z - 0.5));
        break;
      case "0":
        reset();
        break;
      case "ArrowLeft":
        setOffset((o) => ({ ...o, x: o.x + pan }));
        break;
      case "ArrowRight":
        setOffset((o) => ({ ...o, x: o.x - pan }));
        break;
      case "ArrowUp":
        setOffset((o) => ({ ...o, y: o.y + pan }));
        break;
      case "ArrowDown":
        setOffset((o) => ({ ...o, y: o.y - pan }));
        break;
      case "Escape":
        if (fullscreen) setFullscreen(false);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  useEffect(() => {
    if (fullscreen) dialogRef.current?.focus();
  }, [fullscreen]);

  const stage = (
    <div
      role="application"
      aria-label={`${alt} — ${zoomInLabel} (+), ${zoomOutLabel} (-), ${resetLabel} (0)`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragState.current = {
          startX: event.clientX,
          startY: event.clientY,
          baseX: offset.x,
          baseY: offset.y,
        };
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragState.current) return;
        setOffset({
          x: dragState.current.baseX + (event.clientX - dragState.current.startX),
          y: dragState.current.baseY + (event.clientY - dragState.current.startY),
        });
      }}
      onPointerUp={() => {
        dragState.current = null;
      }}
      className="relative touch-none select-none overflow-hidden rounded-lg border border-charcoal-300 bg-charcoal-950"
      style={{ aspectRatio: "4 / 3" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="h-full w-full object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          cursor: zoom > 1 ? "grab" : "default",
        }}
      />
    </div>
  );

  const controls = (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Image controls">
      <Button variant="outline" size="sm" onClick={() => setZoom((z) => clampZoom(z + 0.5))} aria-label={zoomInLabel}>
        <Plus aria-hidden /> {zoomInLabel}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setZoom((z) => clampZoom(z - 0.5))} aria-label={zoomOutLabel}>
        <Minus aria-hidden /> {zoomOutLabel}
      </Button>
      <Button variant="outline" size="sm" onClick={reset}>
        <RotateCcw aria-hidden /> {resetLabel}
      </Button>
      {!fullscreen ? (
        <Button variant="outline" size="sm" onClick={() => setFullscreen(true)}>
          <Maximize2 aria-hidden /> {fullscreenLabel}
        </Button>
      ) : null}
      <ButtonLink href={src} download variant="outline" size="sm" onClick={() => trackEvent("flyer_download", { asset: "witness_image" })}>
        <Download aria-hidden /> {downloadLabel}
      </ButtonLink>
    </div>
  );

  return (
    <div>
      {stage}
      {controls}
      {fullscreen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col bg-charcoal-950/95 p-4"
          onKeyDown={onKeyDown}
        >
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="text-paper hover:bg-charcoal-800"
              onClick={() => setFullscreen(false)}
              aria-label="Close fullscreen view"
            >
              <X aria-hidden /> Close
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            />
          </div>
          <div className="flex justify-center">{controls}</div>
        </div>
      ) : null}
    </div>
  );
}
