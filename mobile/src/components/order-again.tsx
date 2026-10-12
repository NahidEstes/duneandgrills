import { Modal, Text, View } from 'react-native';
import { Button, Notice, styles } from './ui';
import type { useOrderAgain } from '../hooks/useOrderAgain';
export function OrderAgainFeedback({ action }: { action: ReturnType<typeof useOrderAgain> }) {
  return <><Notice message={action.error} />{!!action.message && <Text style={styles.text}>{action.message}</Text>}
    <Modal visible={!!action.choice} transparent animationType="fade" onRequestClose={() => { if (!action.busy) action.cancel(); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 }}><View accessibilityViewIsModal style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Your cart already has items</Text><Text style={styles.text}>Merge this order with your cart, or replace it with eligible items at current prices. Nothing is ordered automatically.</Text>
        <Notice message={action.error} /><Button title="Merge with cart" disabled={action.disabled} onPress={() => action.choose(false)} /><Button title="Replace cart" secondary disabled={action.disabled} onPress={() => action.choose(true)} /><Button title="Cancel" secondary disabled={action.busy} onPress={action.cancel} />
      </View></View>
    </Modal></>;
}
