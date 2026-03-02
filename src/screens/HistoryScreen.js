import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, LayoutAnimation, UIManager, Platform ,ScrollView} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';

// Import Firebase
import { auth, db } from '../config/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HistoryScreen({ navigation }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All'); // All, Week, Month, Year, Custom

  // Custom Date Picker State
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('start'); // 'start' or 'end'

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'transactions'), where('uid', '==', auth.currentUser.uid), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = [];
      snapshot.forEach((doc) => txs.push({ id: doc.id, ...doc.data() }));
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDateChange = (event, selectedDate) => {
    setShowPicker(false); // Native android behavior requires closing immediately
    if (selectedDate) {
      if (pickerMode === 'start') {
        setStartDate(selectedDate);
      } else {
        setEndDate(selectedDate);
      }
    }
  };

  const openPicker = (mode) => {
    setPickerMode(mode);
    setShowPicker(true);
  };

  const getFilteredData = () => {
    const now = new Date();
    return transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      if (filter === 'Week') return (now - txDate) / (1000 * 60 * 60 * 24) <= 7;
      if (filter === 'Month') return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      if (filter === 'Year') return txDate.getFullYear() === now.getFullYear();
      
      if (filter === 'Custom') {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return txDate >= start && txDate <= end;
      }
      
      return true; // 'All'
    });
  };

  const generatePDF = async () => {
    const data = getFilteredData();
    let totalSpent = 0;
    let totalIncome = 0;

    const tableRows = data.map(tx => {
      if (tx.type === 'debit') totalSpent += tx.amount;
      if (tx.type === 'credit') totalIncome += tx.amount;
      
      const color = tx.type === 'credit' ? '#10B981' : '#F43F5E';
      return `
        <tr>
          <td>${new Date(tx.timestamp).toLocaleDateString()}</td>
          <td>${tx.reason}</td>
          <td>${tx.category}</td>
          <td style="color: ${color}; font-weight: bold;">${tx.type === 'credit' ? '+' : '-'}₹${tx.amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const reportTitle = filter === 'Custom' 
      ? `FinVerse Report: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}` 
      : `FinVerse Expense Report (${filter})`;

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Helvetica, sans-serif; padding: 40px; color: #333; }
            h1 { color: #00E5FF; text-align: center; background: #0B0F19; padding: 20px; border-radius: 10px;}
            .summary { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 18px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <div class="summary">
            <span style="color: #10B981">Total Income: ₹${totalIncome.toFixed(2)}</span>
            <span style="color: #F43F5E">Total Spent: ₹${totalSpent.toFixed(2)}</span>
          </div>
          <table>
            <tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr>
            ${tableRows}
          </table>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      Alert.alert('Error', 'Could not generate PDF.');
    }
  };

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color="#00E5FF" /></View>;

  const filteredTransactions = getFilteredData();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
      </View>

      {/* FILTER TABS */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 12, paddingHorizontal: 20}}>
          {['All', 'Week', 'Month', 'Year', 'Custom'].map(f => (
            <TouchableOpacity 
              key={f} 
              style={[styles.filterPill, filter === f && styles.filterPillActive]} 
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setFilter(f);
              }}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* CUSTOM DATE PICKER UI */}
      {filter === 'Custom' && (
        <View style={styles.customDateContainer}>
          <TouchableOpacity style={styles.dateBox} onPress={() => openPicker('start')}>
            <Text style={styles.dateLabel}>FROM</Text>
            <Text style={styles.dateValue}>{startDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#64748B" />
          <TouchableOpacity style={styles.dateBox} onPress={() => openPicker('end')}>
            <Text style={styles.dateLabel}>TO</Text>
            <Text style={styles.dateValue}>{endDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* NATIVE DATE PICKER COMPONENT */}
      {showPicker && (
        <DateTimePicker
          value={pickerMode === 'start' ? startDate : endDate}
          mode="date"
          display="default"
          maximumDate={new Date()} // Prevent selecting future dates
          onChange={handleDateChange}
        />
      )}

      <TouchableOpacity style={styles.downloadBtn} onPress={generatePDF}>
        <MaterialCommunityIcons name="file-pdf-box" size={24} color="#0B0F19" />
        <Text style={styles.downloadBtnText}>Export {filter} Report</Text>
      </TouchableOpacity>

      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.txCard}>
            <View style={styles.txDetails}>
              <Text style={styles.txReason}>{item.reason}</Text>
              <Text style={styles.txCategory}>{item.category} • {new Date(item.timestamp).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.txAmount, { color: item.type === 'credit' ? '#10B981' : '#F8FAFC' }]}>
              {item.type === 'credit' ? '+' : '-'}₹{parseFloat(item.amount).toFixed(2)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{color: '#64748B', marginTop: 40}}>No transactions found in this range.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#334155' },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  
  filterRow: { paddingVertical: 20 },
  filterPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  filterPillActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF' },
  filterText: { color: '#94A3B8', fontWeight: 'bold' },
  filterTextActive: { color: '#0B0F19' },

  customDateContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: 20, backgroundColor: '#1E293B', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  dateBox: { alignItems: 'center', flex: 1 },
  dateLabel: { fontSize: 10, color: '#64748B', fontWeight: 'bold', letterSpacing: 1, marginBottom: 4 },
  dateValue: { color: '#00E5FF', fontSize: 16, fontWeight: 'bold' },

  downloadBtn: { flexDirection: 'row', backgroundColor: '#00E5FF', marginHorizontal: 20, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 8 },
  downloadBtnText: { color: '#0B0F19', fontWeight: '900', fontSize: 16 },

  txCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#1E293B', marginHorizontal: 20 },
  txDetails: { flex: 1 },
  txReason: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  txCategory: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  txAmount: { fontSize: 16, fontWeight: '900' },
});