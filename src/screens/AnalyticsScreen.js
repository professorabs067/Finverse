import React, { useContext } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { FinanceContext } from '../../App';

export default function AnalyticsScreen() {
  const { balance, transactions } = useContext(FinanceContext);
  
  const totalSpent = transactions.filter(t => t.type === 'debit').reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>This Month</Text>
          <Text style={styles.statsSpent}>₹{totalSpent.toFixed(2)}</Text>
          <Text style={styles.statsLabel}>Total Expenses</Text>
        </View>

        <View style={styles.aiCard}>
          <Text style={styles.aiHeader}>✨ Gemini AI Analysis</Text>
          <Text style={styles.aiText}>
            "Based on your recent transactions, you have spent ₹{totalSpent} so far. 
            Your current balance of ₹{balance} suggests you are on track with your goals, 
            but consider cutting back on discretionary expenses to maximize your savings this week."
          </Text>
          <Text style={styles.aiSubtext}>*Connect the Gemini API backend to generate real-time dynamic advice based on your array of transactions.*</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 24 },
  statsCard: { backgroundColor: '#111827', padding: 24, borderRadius: 16, marginBottom: 24, alignItems: 'center' },
  statsTitle: { color: '#9CA3AF', fontSize: 14, fontWeight: '600', textTransform: 'uppercase' },
  statsSpent: { color: '#FFFFFF', fontSize: 36, fontWeight: 'bold', marginVertical: 8 },
  statsLabel: { color: '#D1D5DB', fontSize: 14 },
  aiCard: { backgroundColor: '#DBEAFE', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  aiHeader: { fontSize: 18, fontWeight: 'bold', color: '#1E40AF', marginBottom: 12 },
  aiText: { fontSize: 16, color: '#1E3A8A', lineHeight: 24 },
  aiSubtext: { fontSize: 12, color: '#60A5FA', marginTop: 16, fontStyle: 'italic' },
});