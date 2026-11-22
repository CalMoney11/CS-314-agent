import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Small inline warning shown inside a card when one data source fails. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FECACA' },
  text: { color: '#B91C1C', fontSize: 13 },
});
