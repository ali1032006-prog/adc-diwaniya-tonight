import { useId } from 'react';

/**
 * The woven band: an original repeat of triangles and a lozenge in the app's four colour roles,
 * drawn for Diwaniya Tonight after the banded structure of Sadu weaving. Not traced from any cloth.
 */
export function WovenBand({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`woven-band ${className}`} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <defs>
        <pattern id={`wb${id}`} width="24" height="6" patternUnits="userSpaceOnUse">
          <rect width="24" height="6" className="wb-ground" />
          <path d="M0 6 L3 0 L6 6 Z M6 0 L9 6 L12 0 Z" className="wb-wool" />
          <path d="M18 0.6 L21 3 L18 5.4 L15 3 Z" className="wb-saffron" />
          <rect x="12" y="2.4" width="2" height="1.2" className="wb-camel" />
          <rect x="22" y="2.4" width="2" height="1.2" className="wb-camel" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#wb${id})`} />
    </svg>
  );
}
