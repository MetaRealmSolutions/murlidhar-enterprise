import { TextField } from './controls';

/** A date box (yyyy-mm-dd). On web it is the browser's date picker (see date-field.web.tsx). */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  return <TextField label={label} value={value} onChangeText={onChange} placeholder="yyyy-mm-dd" autoCapitalize="none" autoCorrect={false} maxLength={10} />;
}
