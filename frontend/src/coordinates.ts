import type { Highlight, Scaled } from 'react-pdf-highlighter-extended';
import type { HighlightRegion } from './models';

function clampFraction(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function fromScaled(rect: Scaled): HighlightRegion | null {
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const rectangle = {
    left: clampFraction(rect.x1 / rect.width),
    top: clampFraction(rect.y1 / rect.height),
    right: clampFraction(rect.x2 / rect.width),
    bottom: clampFraction(rect.y2 / rect.height),
  };
  if (!(rectangle.left < rectangle.right && rectangle.top < rectangle.bottom)) return null;
  return { pageNumber: rect.pageNumber, rectangle };
}

export function toHighlight(id: string, region: HighlightRegion): Highlight {
  const { pageNumber, rectangle } = region;
  return {
    id,
    type: 'area',
    position: {
      // The library projects these ratios onto the current page viewport.
      boundingRect: {
        x1: rectangle.left, y1: rectangle.top, x2: rectangle.right, y2: rectangle.bottom,
        width: 1, height: 1, pageNumber,
      },
      rects: [],
    },
  };
}
