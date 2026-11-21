// An <img> that fades in once it has loaded instead of popping in (wiki #194). While it loads, its frame shows the
// skeleton pulse or a blurred thumbnail (CSS: `.fade-img`). Use `key={src}` when the source can change.
// Loaded with CORS, so the service worker can keep the photo for offline use (an opaque response is not cached, #197).
import { useCallback, useState, type ImgHTMLAttributes } from 'react';

export function FadeImage({ className, onLoad, onError, crossOrigin = 'anonymous', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  // A cached image may be complete before React attaches onLoad
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <img
      {...props}
      crossOrigin={crossOrigin}
      ref={ref}
      className={className ? `fade-img ${className}` : 'fade-img'}
      data-loaded={loaded || undefined}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        setLoaded(true); // never leave an invisible broken image pulsing forever
        onError?.(event);
      }}
    />
  );
}
