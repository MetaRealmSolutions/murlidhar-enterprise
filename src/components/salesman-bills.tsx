import type { MutableRefObject } from 'react';
import { View } from 'react-native';

import { BillEntry } from './bill-entry';
import type { Salesman } from '../data/repository';

/**
 * The selected salesman's Bill Entry on the Add New Bill Entry page, for the chosen Bill Date.
 * The saved bills (the list, a bill's detail, statements and the activity log) are on the List of Bill Entry page.
 * Mount it with `key={salesman.id}` so switching salesman starts from the bill entry again.
 */
export function SalesmanBills({ salesman, date, dirtyRef, editing, onEditing }: { salesman: Salesman; date: string; dirtyRef: MutableRefObject<boolean>; editing: boolean; onEditing: (on: boolean) => void }) {
  return (
    <View style={{ gap: 28 }}>
      <BillEntry salesmanId={salesman.id} salesmanName={salesman.name} salesmanPhone={salesman.phone} date={date} dirtyRef={dirtyRef} editing={editing} onEditing={onEditing} />
    </View>
  );
}
