import { Image } from 'react-native';

// Source logo is 402 × 330; width follows height so it is never stretched.
const ASPECT = 402 / 330;

export function BrandLogo({ height }: { height: number }) {
  return (
    <Image
      source={require('../../assets/murlidharenterpriselogo-removebg-preview.png')}
      accessibilityLabel="Murlidhar Enterprise logo"
      resizeMode="contain"
      style={{ height, width: Math.round(height * ASPECT) }}
    />
  );
}
