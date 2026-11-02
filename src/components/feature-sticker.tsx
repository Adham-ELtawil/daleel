"use client";
import { Sticker } from "@/src/stickers/Sticker";
import { DALEEL_PALETTE, featureIcons, type FeatureName } from "@/src/stickers/icons";

// Decorative: the text beside it carries the meaning. Fixed box, so no layout shift before paint;
// the kit pauses off-screen stickers and shows icon.still under prefers-reduced-motion.
export function FeatureSticker({ name, size = 88 }: { name: FeatureName; size?: number }) {
  return (
    <span
      aria-hidden="true"
      data-sticker={name}
      className="feature-sticker block shrink-0"
      style={{ width: size, height: size }}
    >
      <Sticker icon={featureIcons[name]} palette={DALEEL_PALETTE} label="" />
    </span>
  );
}
