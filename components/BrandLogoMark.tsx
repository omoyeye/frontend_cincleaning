import React from 'react';

/** Public path - file lives in `public/brand-logo.png` */
export const BRAND_LOGO_PATH = '/brand-logo.png';

const BrandLogoMark: React.FC<{
  className?: string;
  alt?: string;
}> = ({
  className = 'h-20 w-auto max-w-[400px] object-contain object-left',
  alt = 'CiN - Clean It Neatly UK Cleaning Services',
}) => <img src={BRAND_LOGO_PATH} alt={alt} className={className} decoding="async" loading="eager" />;

export default BrandLogoMark;
