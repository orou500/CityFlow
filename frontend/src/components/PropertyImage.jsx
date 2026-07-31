import { useState } from 'react';
import { getPropertyImage, FALLBACK_PROPERTY_IMAGE } from '../utils/propertyImages';

export default function PropertyImage({ property, alt, className }) {
  const [src, setSrc] = useState(() => getPropertyImage(property));

  return (
    <img
      src={src}
      alt={alt || property?.name || ''}
      loading="lazy"
      className={className}
      onError={() => {
        if (src !== FALLBACK_PROPERTY_IMAGE) setSrc(FALLBACK_PROPERTY_IMAGE);
      }}
    />
  );
}
