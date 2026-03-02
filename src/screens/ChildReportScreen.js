import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { auth, db } from '../config/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';

export default function ChildReportScreen({ route, navigation }) {
  const { childId } = route.params;
  const [childData, setChildData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChild = async () => {
      const childDoc = await getDoc(doc(db, 'users', childId));
      if (childDoc.exists()) setChildData(childDoc.data());
    };
    fetchChild();

    const q = query(collection(db, 'transactions'), where('uid', '==', childId), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = [];
      snapshot.forEach((doc) => txs.push({ id: doc.id, ...doc.data() }));
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [childId]);

  const handleUnlink = () => {
    Alert.alert("Disconnect", "Are you sure you want to stop tracking this child?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Unlink", 
        style: "destructive", 
        onPress: async () => {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { linkedChild: null });
          await updateDoc(doc(db, 'users', childId), { linkedParent: null });
          navigation.goBack();
        }
      }
    ]);
  };

  if (loading || !childData) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color="#00E5FF" /></View>;

  const totalSpent = transactions.filter(t => t.type === 'debit').reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Child Report</Text>
        <TouchableOpacity onPress={handleUnlink}>
          <MaterialCommunityIcons name="link-variant-off" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <MaterialCommunityIcons name="account-child-circle" size={40} color="#00E5FF" />
        <Text style={styles.childName}>{childData.name}'s Account</Text>
        <Text style={styles.balanceText}>Current Balance: ₹{childData.currentBalance}</Text>
        <View style={styles.spentPill}>
          <Text style={styles.spentText}>Total Spent: ₹{totalSpent}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>TRANSACTION LOG</Text>

      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.txCard}>
            <View style={styles.txDetails}>
              <Text style={styles.txReason}>{item.reason}</Text>
              <Text style={styles.txCategory}>{item.category} • {new Date(item.timestamp).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.txAmount, { color: item.type === 'credit' ? '#10B981' : '#F43F5E' }]}>
              {item.type === 'credit' ? '+' : '-'}₹{item.amount}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No transactions yet.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  
  summaryCard: { backgroundColor: '#1E293B', margin: 20, padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  childName: { fontSize: 22, fontWeight: 'bold', color: '#FFF', marginTop: 12 },
  balanceText: { color: '#94A3B8', fontSize: 16, marginTop: 8 },
  spentPill: { backgroundColor: 'rgba(244, 63, 94, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 16, borderWidth: 1, borderColor: '#F43F5E' },
  spentText: { color: '#F43F5E', fontWeight: 'bold' },

  sectionTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '900', letterSpacing: 1.5, paddingHorizontal: 20, marginBottom: 12 },
  txCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#1E293B', marginHorizontal: 20 },
  txDetails: { flex: 1 },
  txReason: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  txCategory: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  txAmount: { fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#64748B', textAlign: 'center', marginTop: 40 }
});