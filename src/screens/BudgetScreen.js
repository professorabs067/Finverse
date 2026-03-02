import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, LayoutAnimation, UIManager, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FinanceContext } from '../context/FinanceContext';

// Import Firebase
import { auth, db } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, getDoc, increment } from 'firebase/firestore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Ensure this matches the categories from ScannerScreen
const CATEGORIES = [
  'Food & Dining', 'Health & Gym', 'Software/Cloud', 
  'Entertainment', 'Education', 'Shopping', 
  'Transport', 'Bills'
];

export default function BudgetScreen() {
  const { transactions } = useContext(FinanceContext);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  
  const [editingBudget, setEditingBudget] = useState(null);
  
  // Budget Form states
  const [category, setCategory] = useState('Food & Dining');
  const [limit, setLimit] = useState('');
  
  // Goal Form states
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const currentMonth = new Date().toISOString().slice(0, 7); 

    // Listen for Budgets
    const budgetsRef = collection(db, 'budgets');
    const qBudgets = query(budgetsRef, where('uid', '==', uid), where('month', '==', currentMonth));
    
    const unsubBudgets = onSnapshot(qBudgets, (querySnapshot) => {
      const budgetList = [];
      querySnapshot.forEach((doc) => budgetList.push({ id: doc.id, ...doc.data() }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBudgets(budgetList);
    });

    // Listen for Goals
    const goalsRef = collection(db, 'goals');
    const qGoals = query(goalsRef, where('uid', '==', uid));
    
    const unsubGoals = onSnapshot(qGoals, (querySnapshot) => {
      const goalList = [];
      querySnapshot.forEach((doc) => goalList.push({ id: doc.id, ...doc.data() }));
      setGoals(goalList);
      setLoading(false);
    });

    return () => {
      unsubBudgets();
      unsubGoals();
    };
  }, []);

  const calculateSpent = (categoryName) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return transactions
      .filter(t => t.category === categoryName && t.type === 'debit' && t.timestamp?.startsWith(currentMonth))
      .reduce((acc, curr) => acc + curr.amount, 0);
  };

  const calculateTotalMonthlySpend = () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return transactions
      .filter(t => t.type === 'debit' && t.timestamp?.startsWith(currentMonth))
      .reduce((acc, curr) => acc + curr.amount, 0);
  };

  const calculateTotalIncome = () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return transactions
      .filter(t => t.type === 'credit' && t.timestamp?.startsWith(currentMonth))
      .reduce((acc, curr) => acc + curr.amount, 0);
  };

  const handleSaveBudget = async () => {
    if (!category || !limit) return Alert.alert('Error', 'Please fill all fields');
    if (parseFloat(limit) <= 0) return Alert.alert('Error', 'Limit must be greater than 0');

    setLoading(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const budgetData = {
        uid: auth.currentUser.uid,
        category: category,
        limit: parseFloat(limit),
        month: currentMonth,
        updatedAt: new Date().toISOString()
      };

      if (editingBudget) {
        await updateDoc(doc(db, 'budgets', editingBudget.id), budgetData);
      } else {
        await setDoc(doc(db, 'budgets', `${auth.currentUser.uid}_${category}_${currentMonth}`), budgetData);
      }
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to save budget');
    }
    setLoading(false);
  };

  const handleSaveGoal = async () => {
    if (!goalName || !goalTarget) return Alert.alert('Error', 'Fill all fields');
    
    setLoading(true);
    try {
      await addDoc(collection(db, 'goals'), {
        uid: auth.currentUser.uid,
        name: goalName,
        target: parseFloat(goalTarget),
        currentAmount: 0, // NEW: Start at 0
        createdAt: new Date().toISOString()
      });
      setGoalModalVisible(false);
      setGoalName('');
      setGoalTarget('');
    } catch (error) {
      console.error("GOAL SAVE ERROR:", error);
      Alert.alert('Firebase Error', error.message); 
    }
    setLoading(false);
  };

  // --- NEW: Active Contribution Engine ---
  const handleContributeToGoal = (goal) => {
    Alert.prompt(
      `Fund ${goal.name}`,
      `How much are you moving to this goal?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deposit",
          onPress: async (amount) => {
            const depositAmount = parseFloat(amount);
            if (!amount || isNaN(depositAmount) || depositAmount <= 0) return;
            
            try {
              const uid = auth.currentUser.uid;
              
              // 1. Check if user has enough main balance
              const userRef = doc(db, 'users', uid);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists() && userSnap.data().currentBalance < depositAmount) {
                return Alert.alert("Insufficient Funds", "You don't have enough balance to make this deposit.");
              }

              // 2. Add to Goal
              const newTotal = (goal.currentAmount || 0) + depositAmount;
              await updateDoc(doc(db, 'goals', goal.id), {
                currentAmount: newTotal,
                updatedAt: new Date().toISOString()
              });

              // 3. Deduct from Main User Balance
              await updateDoc(userRef, {
                currentBalance: increment(-depositAmount)
              });

              // 4. Log it as a "Transfer" transaction so the ledger is accurate
              await addDoc(collection(db, 'transactions'), {
                uid: uid,
                amount: depositAmount,
                reason: `Funded Goal: ${goal.name}`,
                category: 'Transfers',
                type: 'debit', // Money left the main wallet
                timestamp: new Date().toISOString()
              });

            } catch (error) {
              Alert.alert("Error", "Could not process deposit.");
            }
          }
        }
      ],
      "plain-text",
      "",
      "number-pad"
    );
  };

  const deleteBudget = (id) => {
    Alert.alert('Delete', 'Remove this budget limit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'budgets', id)) }
    ]);
  };

  const deleteGoal = (id) => {
    Alert.alert('Delete', 'Remove this goal? The funds will NOT be returned to your main balance automatically.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'goals', id)) }
    ]);
  };

  const totalMonthlySpend = calculateTotalMonthlySpend();
  const totalIncome = calculateTotalIncome();

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color="#00E5FF" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* --- SAVINGS & INCOME OVERVIEW --- */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>MONTHLY OVERVIEW</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>+₹{totalIncome.toFixed(0)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Spent</Text>
              <Text style={[styles.summaryValue, { color: '#F43F5E' }]}>-₹{totalMonthlySpend.toFixed(0)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Gross Saved</Text>
              <Text style={[styles.summaryValue, { color: (totalIncome - totalMonthlySpend) >= 0 ? '#00E5FF' : '#F43F5E' }]}>
                ₹{(totalIncome - totalMonthlySpend).toFixed(0)}
              </Text>
            </View>
          </View>
        </View>

        {/* --- ACTIVE GOALS --- */}
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>SAVINGS GOALS</Text>
          <TouchableOpacity onPress={() => setGoalModalVisible(true)}>
            <Ionicons name="add-circle" size={24} color="#00E5FF" />
          </TouchableOpacity>
        </View>

        {goals.length === 0 && (
           <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No active goals. Start saving!</Text>
          </View>
        )}

        {goals.map((goal) => {
          const savedSoFar = goal.currentAmount || 0;
          const progress = Math.min(savedSoFar / goal.target, 1);
          
          return (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View>
                  <Text style={styles.goalName}>🎯 {goal.name}</Text>
                  <Text style={styles.goalTargetText}>Target: ₹{goal.target.toLocaleString()}</Text>
                </View>
                <View style={styles.goalActions}>
                  <TouchableOpacity style={styles.depositBtn} onPress={() => handleContributeToGoal(goal)}>
                    <Ionicons name="add" size={20} color="#0B0F19" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteGoal(goal.id)}>
                    <Ionicons name="trash-outline" size={20} color="#475569" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: '#10B981' }]} />
              </View>
              
              <View style={styles.footerRow}>
                <Text style={styles.goalText}>₹{savedSoFar.toLocaleString()} saved</Text>
                <Text style={[styles.percentText, {color: '#10B981'}]}>{Math.round(progress * 100)}% Complete</Text>
              </View>
            </View>
          );
        })}

        {/* --- CATEGORY BUDGETS --- */}
        <View style={[styles.headerRow, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>CATEGORY LIMITS</Text>
          <TouchableOpacity onPress={() => {
            setEditingBudget(null); setLimit(''); setCategory('Food & Dining'); setModalVisible(true);
          }}>
            <Ionicons name="add-circle" size={24} color="#00E5FF" />
          </TouchableOpacity>
        </View>

        {budgets.length === 0 && (
           <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No category limits set.</Text>
          </View>
        )}

        {budgets.map((budget) => {
          const spent = calculateSpent(budget.category);
          const progress = budget.limit > 0 ? spent / budget.limit : 0;
          const isOver = progress > 1;
          const remaining = budget.limit - spent;

          return (
            <View key={budget.id} style={styles.budgetCard}>
              <View style={styles.budgetHeader}>
                <Text style={styles.categoryText}>{budget.category.toUpperCase()}</Text>
                <View style={styles.budgetActions}>
                  <TouchableOpacity onPress={() => { setEditingBudget(budget); setCategory(budget.category); setLimit(budget.limit.toString()); setModalVisible(true); }}>
                    <Ionicons name="create-outline" size={20} color="#00E5FF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteBudget(budget.id)}>
                    <Ionicons name="trash-outline" size={20} color="#F43F5E" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.amountRow}>
                <Text style={[styles.spentAmount, { color: isOver ? '#F43F5E' : '#FFF' }]}>₹{spent.toFixed(0)}</Text>
                <Text style={styles.limitAmount}>/ ₹{budget.limit.toFixed(0)}</Text>
              </View>
              
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: isOver ? '#F43F5E' : '#00E5FF' }]} />
              </View>

              <View style={styles.footerRow}>
                <Text style={styles.remainingText}>
                  {isOver ? `⚠️ Over limit by ₹${Math.abs(remaining).toFixed(0)}` : `${Math.round(progress * 100)}% utilized`}
                </Text>
                <Text style={[styles.percentText, { color: isOver ? '#F43F5E' : '#94A3B8' }]}>
                  {isOver ? 'Exceeded' : `₹${remaining.toFixed(0)} left`}
                </Text>
              </View>
            </View>
          );
        })}

      </ScrollView>

      {/* --- ADD/EDIT BUDGET MODAL --- */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingBudget ? 'Edit Limit' : 'Set Category Limit'}</Text>

            <Text style={styles.modalLabel}>SELECT CATEGORY</Text>
            <View style={styles.categoryScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity 
                    key={cat} 
                    style={[styles.categoryPill, category === cat && styles.categoryPillActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.categoryPillText, category === cat && styles.categoryPillTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={styles.modalLabel}>MONTHLY LIMIT (₹)</Text>
            <TextInput style={styles.modalInput} value={limit} onChangeText={setLimit} placeholder="e.g. 5000" placeholderTextColor="#64748B" keyboardType="numeric" autoFocus />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveBudget} disabled={loading}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>SAVE LIMIT</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- ADD GOAL MODAL --- */}
      <Modal visible={goalModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Savings Goal</Text>

            <Text style={styles.modalLabel}>WHAT ARE YOU SAVING FOR?</Text>
            <TextInput style={styles.modalInput} value={goalName} onChangeText={setGoalName} placeholder="e.g. MacBook Pro, Trip to Goa" placeholderTextColor="#64748B" autoFocus />

            <Text style={styles.modalLabel}>TARGET AMOUNT (₹)</Text>
            <TextInput style={styles.modalInput} value={goalTarget} onChangeText={setGoalTarget} placeholder="e.g. 150000" placeholderTextColor="#64748B" keyboardType="numeric" />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setGoalModalVisible(false)}>
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveButton, {backgroundColor: '#10B981'}]} onPress={handleSaveGoal} disabled={loading}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>CREATE GOAL</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.5 },
  
  summaryCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', fontWeight: '800' },
  summaryValue: { fontSize: 20, fontWeight: '900' },

  goalCard: { backgroundColor: 'rgba(16, 185, 129, 0.05)', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', marginBottom: 16 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  goalName: { fontSize: 14, fontWeight: '800', color: '#10B981', letterSpacing: 1, marginBottom: 2 },
  goalText: { fontSize: 12, color: '#10B981', fontWeight: '700' },
  goalTargetText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  goalActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  depositBtn: { backgroundColor: '#10B981', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  budgetCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  categoryText: { fontSize: 13, fontWeight: '800', color: '#F8FAFC', letterSpacing: 1 },
  budgetActions: { flexDirection: 'row', gap: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  spentAmount: { fontSize: 24, fontWeight: '900' },
  limitAmount: { fontSize: 14, fontWeight: '700', color: '#64748B', marginLeft: 4 },
  
  progressBarBackground: { height: 8, backgroundColor: '#0B0F19', borderRadius: 4, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remainingText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  percentText: { fontSize: 12, fontWeight: '700' },

  emptyContainer: { marginBottom: 24, paddingVertical: 12, alignItems: 'center' },
  emptyText: { color: '#475569', fontSize: 13, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,15,25,0.95)', justifyContent: 'flex-end', padding: 0 },
  modalContent: { backgroundColor: '#1E293B', padding: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderColor: '#334155' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 24, letterSpacing: 1 },
  modalLabel: { fontSize: 11, fontWeight: '800', color: '#00E5FF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  modalInput: { backgroundColor: '#0B0F19', borderRadius: 12, padding: 16, color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  
  categoryScrollWrapper: { height: 50, marginBottom: 20 },
  categoryScroll: { alignItems: 'center', paddingRight: 20 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#0B0F19', borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  categoryPillActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF' },
  categoryPillText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
  categoryPillTextActive: { color: '#0B0F19', fontWeight: '800' },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 20 },
  modalCancelButton: { flex: 1, backgroundColor: '#0B0F19', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  modalCancelText: { color: '#94A3B8', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  modalSaveButton: { flex: 1, backgroundColor: '#00E5FF', padding: 16, borderRadius: 12, alignItems: 'center' },
  modalSaveText: { color: '#0B0F19', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});