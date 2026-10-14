import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { T, useTheme } from './controls';

/** A simple centred dialog with a title; the content brings its own buttons. */
export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.overlay, justifyContent: 'center', padding: 16 }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <ScrollView
          style={{ maxHeight: '94%', alignSelf: 'center', width: '100%', maxWidth: 520, flexGrow: 0 }}
          contentContainerStyle={{ backgroundColor: t.surface, borderRadius: 10, borderWidth: 1, borderColor: t.border }}
          keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <T size={18} weight="600">
              {title}
            </T>
          </View>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}
