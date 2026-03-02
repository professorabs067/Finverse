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
  const [childExists, setChildExists] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchChild = async () => {
      try {
        const childDoc = await getDoc(doc(db, 'users', childId));
        if (isMounted) {
          if (childDoc.exists()) {
            setChildData(childDoc.data());
            setChildExists(true);
          } else {
            setChildExists(false);
            // Clean up parent's link if child account doesn't exist
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { 
              linkedChild: null 
            });
          }
        }
      } catch (error) {
        console.error("Error fetching child:", error);
        if (isMounted) {
          Alert.alert("Error", "Failed to fetch child account data.");
        }
      }
    };
    
    fetchChild();

    const q = query(
      collection(db, 'transactions'), 
      where('uid', '==', childId), 
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        if (!isMounted) return;
        const txs = [];
        snapshot.forEach((doc) => txs.push({ id: doc.id, ...doc.data() }));
        setTransactions(txs);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error("Transactions snapshot error:", error);
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
          Alert.alert("Error", "Failed to load transactions.");
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [childId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const childDoc = await getDoc(doc(db, 'users', childId));
      if (childDoc.exists()) {
        setChildData(childDoc.data());
        setChildExists(true);
      } else {
        setChildExists(false);
        // Clean up parent's link
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { 
          linkedChild: null 
        });
      }
    } catch (error) {
      console.error("Refresh error:", error);
      Alert.alert("Error", "Failed to refresh data.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleUnlink = () => {
    Alert.alert(
      "Disconnect Account", 
      "Are you sure you want to stop tracking this child? You'll need to scan their QR code again to reconnect.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Disconnect", 
          style: "destructive", 
          onPress: async () => {
            setLoading(true);
            try {
              // Only update parent's document, child's document might not exist
              await updateDoc(doc(db, 'users', auth.currentUser.uid), { 
                linkedChild: null 
              });
              
              // Try to update child's document only if it exists
              try {
                const childDoc = await getDoc(doc(db, 'users', childId));
                if (childDoc.exists()) {
                  await updateDoc(doc(db, 'users', childId), { 
                    linkedParent: null 
                  });
                }
              } catch (childError) {
                console.log("Child account may not exist, skipping cleanup");
              }
              
              Alert.alert("Success", "Child account disconnected.");
              navigation.goBack();
            } catch (error) {
              console.error("Unlink error:", error);
              Alert.alert("Error", "Failed to disconnect account.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  // Show loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#00E5FF" />
        <Text style={styles.loadingText}>Loading child data...</Text>
      </SafeAreaView>
    );
  }

  // Show error state if child doesn't exist
  if (!childExists) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Error</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="account-alert" size={80} color="#EF4444" />
          <Text style={styles.errorTitle}>Account Not Found</Text>
          <Text style={styles.errorText}>
            The child account you were tracking no longer exists. 
            The link has been automatically removed from your account.
          </Text>
          
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={handleGoBack}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color="#00E5FF" />
            ) : (
              <>
                <Ionicons name="refresh" size={20} color="#00E5FF" />
                <Text style={styles.refreshButtonText}>Check Again</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show if child data is missing (unlikely but handle it)
  if (!childData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Data Error</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="database-alert" size={80} color="#F59E0B" />
          <Text style={styles.errorTitle}>Data Unavailable</Text>
          <Text style={styles.errorText}>
            Unable to load child account data. Please try again.
          </Text>
          
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={handleRefresh}
            disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color="#00E5FF" />
            ) : (
              <Text style={styles.retryButtonText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalSpent = transactions
    .filter(t => t.type === 'debit')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const totalIncome = transactions
    .filter(t => t.type === 'credit')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const savings = totalIncome - totalSpent;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Child Report</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshIcon}>
            <Ionicons 
              name={refreshing ? "sync" : "refresh"} 
              size={24} 
              color={refreshing ? '#64748B' : '#00E5FF'} 
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleUnlink}>
            <MaterialCommunityIcons name="link-variant-off" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.profileSection}>
          <MaterialCommunityIcons name="account-child-circle" size={60} color="#00E5FF" />
          <View style={styles.profileInfo}>
            <Text style={styles.childName}>{childData.name}</Text>
            <Text style={styles.childEmail}>{childData.email || 'No email provided'}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Current Balance</Text>
            <Text style={styles.statValue}>₹{childData.currentBalance?.toFixed(2) || '0.00'}</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Spent</Text>
            <Text style={[styles.statValue, { color: '#F43F5E' }]}>₹{totalSpent.toFixed(2)}</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Income</Text>
            <Text style={[styles.statValue, { color: '#10B981' }]}>₹{totalIncome.toFixed(2)}</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Savings</Text>
            <Text style={[styles.statValue, { color: savings >= 0 ? '#10B981' : '#EF4444' }]}>
              ₹{savings.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.lastActive}>
          <MaterialCommunityIcons name="clock-outline" size={14} color="#64748B" />
          <Text style={styles.lastActiveText}>
            Last active: {childData.lastActive ? new Date(childData.lastActive).toLocaleDateString() : 'Unknown'}
          </Text>
        </View>
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.sectionTitle}>TRANSACTION LOG</Text>
        <Text style={styles.transactionCount}>{transactions.length} entries</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.txCard}>
            <View style={[styles.txIconContainer, { 
              backgroundColor: item.type === 'credit' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)'
            }]}>
              <MaterialCommunityIcons 
                name={item.type === 'credit' ? 'cash-plus' : 'cash-minus'} 
                size={20} 
                color={item.type === 'credit' ? '#10B981' : '#F43F5E'} 
              />
            </View>
            <View style={styles.txDetails}>
              <Text style={styles.txReason}>{item.reason}</Text>
              <View style={styles.txMeta}>
                <Text style={styles.txCategory}>{item.category}</Text>
                <Text style={styles.txDate}> • {new Date(item.timestamp).toLocaleDateString()}</Text>
              </View>
            </View>
            <Text style={[styles.txAmount, { color: item.type === 'credit' ? '#10B981' : '#F43F5E' }]}>
              {item.type === 'credit' ? '+' : '-'}₹{item.amount.toFixed(2)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubText}>Transactions will appear here once the child makes any</Text>
          </View>
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  center: { justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#FFF' 
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  refreshIcon: {
    marginRight: 8
  },
  
  summaryCard: { 
    backgroundColor: '#1E293B', 
    margin: 20, 
    padding: 20, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1
  },
  childName: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: '#FFF', 
    marginBottom: 4
  },
  childEmail: {
    fontSize: 14,
    color: '#64748B'
  },
  
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 16
  },
  statItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF'
  },
  
  lastActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155'
  },
  lastActiveText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 6
  },

  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12
  },
  sectionTitle: { 
    fontSize: 14, 
    fontWeight: '900', 
    color: '#94A3B8', 
    letterSpacing: 1.5
  },
  transactionCount: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600'
  },
  
  txCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderColor: '#1E293B', 
    marginHorizontal: 20 
  },
  txIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  txDetails: { 
    flex: 1 
  },
  txReason: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#F8FAFC', 
    marginBottom: 4 
  },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  txCategory: { 
    fontSize: 12, 
    color: '#64748B', 
    fontWeight: '600' 
  },
  txDate: {
    fontSize: 12,
    color: '#475569'
  },
  txAmount: { 
    fontSize: 16, 
    fontWeight: '900' 
  },
  
  // Error states
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 20,
    marginBottom: 12
  },
  errorText: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30
  },
  
  // Empty states
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 40
  },
  emptyText: { 
    color: '#64748B', 
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center' 
  },
  emptySubText: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8
  },
  
  // Buttons
  retryButton: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12
  },
  retryButtonText: {
    color: '#0B0F19',
    fontSize: 16,
    fontWeight: 'bold'
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    gap: 8
  },
  refreshButtonText: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '600'
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14
  }
});