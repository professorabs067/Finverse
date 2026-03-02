import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  ActivityIndicator, Animated, Dimensions, Alert, Modal, TextInput, 
  KeyboardAvoidingView, Platform, ScrollView, LayoutAnimation, UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LineChart } from 'react-native-chart-kit';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

// Import Firebase
import { auth, db } from '../config/firebase';
import { doc, onSnapshot, collection, query, where, orderBy, addDoc, updateDoc, increment, getDocs } from 'firebase/firestore';

// Configure Notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

// ⚠️ PASTE YOUR GEMINI API KEY HERE
const GEMINI_API_KEY = "AIzaSyDgq1MsYJ_eoylSyJ9sWdozu9yYtMNbkZ0"; 

const CATEGORIES = [
  'Food & Dining', 'Health & Gym', 'Software/Cloud', 
  'Entertainment', 'Education', 'Shopping', 
  'Transport', 'Bills', 'Transfers', 'Income'
];

const CATEGORY_MAP = {
  'Food & Dining': { icon: 'hamburger', color: '#F59E0B' },
  'Health & Gym': { icon: 'dumbbell', color: '#10B981' },
  'Software/Cloud': { icon: 'cloud-outline', color: '#3B82F6' },
  'Entertainment': { icon: 'popcorn', color: '#8B5CF6' },
  'Education': { icon: 'school-outline', color: '#F43F5E' },
  'Shopping': { icon: 'shopping-outline', color: '#EC4899' },
  'Transport': { icon: 'car-outline', color: '#F97316' },
  'Bills': { icon: 'lightning-bolt-outline', color: '#06B6D4' },
  'Transfers': { icon: 'bank-transfer', color: '#94A3B8' },
  'Income': { icon: 'cash-plus', color: '#10B981' }
};

export default function DashboardScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // UI Toggles - Hidden by default for privacy
  const [showSafeToSpend, setShowSafeToSpend] = useState(true);
  const [isBalanceHidden, setIsBalanceHidden] = useState(true); 
  const [swipeAnimation] = useState(new Animated.Value(0));
  const [chartPeriod, setChartPeriod] = useState('Week');
  
  // Modals
  const [isPayModalVisible, setPayModalVisible] = useState(false);
  const [isAIModalVisible, setAIModalVisible] = useState(false);
  const [isManualModalVisible, setManualModalVisible] = useState(false);
  
  // Phone Payment State
  const [payNumber, setPayNumber] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payReason, setPayReason] = useState('');
  const [payCategory, setPayCategory] = useState('Transfers');
  const [isVerifyingNumber, setIsVerifyingNumber] = useState(false);

  // Manual Transaction State
  const [manualType, setManualType] = useState('debit'); // 'debit' or 'credit'
  const [manualAmount, setManualAmount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualCategory, setManualCategory] = useState('Food & Dining');
  
  // AI State
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Setup Notifications on Mount
  useEffect(() => {
    const setupNotifications = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        // Clear old ones just in case
        await Notifications.cancelAllScheduledNotificationsAsync();
        
        // Schedule daily journal reminder at 8:00 PM
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "FinVerse Journal 🌙",
            body: "Time to log your daily expenses. Did you stay under budget today?",
            sound: true,
          },
          trigger: {
            hour: 8,
            minute: 44,
            repeats: true,
          },
        });
      }
    };
    setupNotifications();
  }, []);

  // Firebase Data Fetch
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const userRef = doc(db, 'users', uid);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) setUserData(docSnap.data());
    });

    const txRef = collection(db, 'transactions');
    const q = query(txRef, where('uid', '==', uid), orderBy('timestamp', 'desc'));
    
    const unsubscribeTx = onSnapshot(q, (querySnapshot) => {
      const txs = [];
      querySnapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() });
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTransactions(txs);
      setLoading(false);
    });

    return () => {
      unsubscribeUser();
      unsubscribeTx();
    };
  }, []);

  // Smart Categorization for Auto-Tags
  const autoTagCategory = (text, setter) => {
    const t = text.toLowerCase();
    if (t.includes('aws') || t.includes('google') || t.includes('hosting')) setter('Software/Cloud');
    else if (t.includes('zomato') || t.includes('swiggy') || t.includes('coffee') || t.includes('food')) setter('Food & Dining');
    else if (t.includes('gym') || t.includes('protein') || t.includes('health')) setter('Health & Gym');
    else if (t.includes('netflix') || t.includes('spotify') || t.includes('movie')) setter('Entertainment');
    else if (t.includes('gate') || t.includes('course') || t.includes('udemy')) setter('Education');
    else if (t.includes('amazon') || t.includes('flipkart') || t.includes('shop')) setter('Shopping');
    else if (t.includes('uber') || t.includes('ola') || t.includes('petrol')) setter('Transport');
    else if (t.includes('wifi') || t.includes('rent') || t.includes('bill')) setter('Bills');
  };

  useEffect(() => autoTagCategory(payReason, setPayCategory), [payReason]);
  useEffect(() => autoTagCategory(manualReason, setManualCategory), [manualReason]);

  const calculateMetrics = () => {
    const currentBalance = userData?.currentBalance || 0;
    const today = new Date();
    
    const committedBudgets = transactions
      .filter(t => t.type === 'debit' && t.category === 'Bills' && new Date(t.timestamp).getMonth() === today.getMonth())
      .reduce((sum, t) => sum + t.amount, 0);
    
    const safeToSpend = currentBalance - committedBudgets;
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekTransactions = transactions.filter(t => t.type === 'debit' && new Date(t.timestamp) >= weekAgo);
    const weekSpend = weekTransactions.reduce((sum, t) => sum + t.amount, 0);
    const dailyBurn = weekTransactions.length > 0 ? weekSpend / 7 : 0;
    
    const runwayDays = dailyBurn > 0 ? Math.floor(safeToSpend / dailyBurn) : 999;
    
    const upcomingBills = [];
    const subscriptionTxs = transactions.filter(t => t.isSubscription === true || t.category === 'Software/Cloud');
    
    const uniqueSubNames = [...new Set(subscriptionTxs.map(s => s.reason))];
    const uniqueSubs = uniqueSubNames.map(name => subscriptionTxs.find(s => s.reason === name));

    uniqueSubs.forEach(sub => {
      if (!sub) return;
      const lastPaymentDate = new Date(sub.timestamp);
      const nextDueDate = new Date(lastPaymentDate);
      nextDueDate.setDate(nextDueDate.getDate() + 30);
      
      const diffTime = nextDueDate - today;
      const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysUntilDue >= 0 && daysUntilDue <= 7) {
        upcomingBills.push({ name: sub.reason, amount: sub.amount, daysLeft: daysUntilDue });
      }
    });

    const categorySpend = {};
    transactions.forEach(t => {
      if (t.type === 'debit') categorySpend[t.category] = (categorySpend[t.category] || 0) + t.amount;
    });
    const topCategory = Object.keys(categorySpend).length > 0 
      ? Object.keys(categorySpend).reduce((a, b) => categorySpend[a] > categorySpend[b] ? a : b) 
      : 'None';

    return {
      currentBalance,
      safeToSpend: Math.max(safeToSpend, 0),
      dailyBurn: dailyBurn.toFixed(0),
      runwayDays: Math.min(runwayDays, 365),
      upcomingBills,
      topCategory
    };
  };

  const metrics = userData ? calculateMetrics() : null;

  const getChartData = () => {
    let labels = [];
    let expenseData = [];
    let incomeData = [];
    const now = new Date();

    if (chartPeriod === 'Week') {
      labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      expenseData = [0, 0, 0, 0, 0, 0, 0];
      incomeData = [0, 0, 0, 0, 0, 0, 0];
      
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay() || 7; 
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - day + 1);

      transactions.forEach(tx => {
        const txDate = new Date(tx.timestamp);
        if (txDate >= startOfWeek) {
          const dayIdx = (txDate.getDay() || 7) - 1;
          if (tx.type === 'debit') expenseData[dayIdx] += tx.amount;
          if (tx.type === 'credit') incomeData[dayIdx] += tx.amount;
        }
      });
    } else if (chartPeriod === 'Month') {
      labels = ["W1", "W2", "W3", "W4"];
      expenseData = [0, 0, 0, 0];
      incomeData = [0, 0, 0, 0];
      
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      transactions.forEach(tx => {
        const txDate = new Date(tx.timestamp);
        if (txDate >= startOfMonth) {
          const weekIdx = Math.min(Math.floor((txDate.getDate() - 1) / 7), 3);
          if (tx.type === 'debit') expenseData[weekIdx] += tx.amount;
          if (tx.type === 'credit') incomeData[weekIdx] += tx.amount;
        }
      });
    } else {
      labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      expenseData = new Array(12).fill(0);
      incomeData = new Array(12).fill(0);
      
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      transactions.forEach(tx => {
        const txDate = new Date(tx.timestamp);
        if (txDate >= startOfYear) {
          const monthIdx = txDate.getMonth();
          if (tx.type === 'debit') expenseData[monthIdx] += tx.amount;
          if (tx.type === 'credit') incomeData[monthIdx] += tx.amount;
        }
      });
    }

    if (expenseData.every(v => v === 0)) expenseData[0] = 0.01;
    if (incomeData.every(v => v === 0)) incomeData[0] = 0.01;

    return {
      labels,
      datasets: [
        { data: expenseData, color: (opacity = 1) => `rgba(244, 63, 94, ${opacity})`, strokeWidth: 2 },
        { data: incomeData, color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, strokeWidth: 2 }
      ],
      legend: ["Expense", "Income"]
    };
  };

  const handleManualSubmit = async () => {
    if (!manualAmount || !manualReason) return Alert.alert("Error", "Please provide amount and purpose.");
    const amt = parseFloat(manualAmount);
    if (isNaN(amt) || amt <= 0) return Alert.alert("Error", "Invalid amount.");

    setActionLoading(true);
    try {
      const finalCategory = manualType === 'credit' ? 'Income' : manualCategory;
      
      await addDoc(collection(db, 'transactions'), {
        uid: auth.currentUser.uid,
        amount: amt,
        reason: manualReason,
        category: finalCategory,
        type: manualType,
        timestamp: new Date().toISOString()
      });

      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        currentBalance: increment(manualType === 'credit' ? amt : -amt)
      });

      setManualModalVisible(false);
      setManualAmount('');
      setManualReason('');
    } catch (e) {
      Alert.alert("Database Error", "Failed to log transaction.");
    }
    setActionLoading(false);
  };

  const executeDirectPayment = async () => {
    if (!payAmount || payNumber.length < 10) return Alert.alert('Invalid', 'Enter valid number and amount.');
    setPayModalVisible(false);

    const targetName = payeeName.replace('FinVerse User: ', '').replace('External Transfer (Standard UPI)', 'User');
    const finalReason = payReason || `Paid ${targetName}`;
    const finalUrl = `upi://pay?pa=${payNumber}@ybl&pn=${encodeURIComponent(targetName)}&am=${payAmount}&cu=INR&tn=${encodeURIComponent(finalReason)}`;

    try {
      await Linking.openURL(finalUrl);
      setTimeout(() => {
        Alert.alert(
          "Verify Transfer",
          `Did your transfer of ₹${payAmount} to ${targetName} succeed?`,
          [
            { 
              text: "Failed / Cancelled", 
              style: "cancel", 
              onPress: () => { setPayNumber(''); setPayAmount(''); setPayeeName(''); setPayReason(''); } 
            },
            { 
              text: "Yes, Transfer Successful", 
              onPress: async () => {
                await addDoc(collection(db, 'transactions'), {
                  uid: auth.currentUser.uid,
                  amount: parseFloat(payAmount),
                  reason: finalReason,
                  category: payCategory,
                  type: 'debit',
                  timestamp: new Date().toISOString()
                });
                await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                  currentBalance: increment(-parseFloat(payAmount))
                });
                setPayNumber(''); setPayAmount(''); setPayeeName(''); setPayReason('');
              } 
            }
          ]
        );
      }, 1000);
    } catch (e) {
      Alert.alert('Error', 'No compatible UPI app found.');
    }
  };

  const handleAskGemini = async () => {
    if (!aiQuery) return;
    setIsAILoading(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    try {
      const promptText = `
        You are a highly intelligent, ruthless, and attention-seeking financial coach embedded in the FinVerse app.
        Here is the user's LIVE financial truth:
        - Absolute Bank Balance: ₹${metrics.currentBalance}
        - Safe to Spend (Buffer Included): ₹${metrics.safeToSpend}
        - Daily Burn Rate: ₹${metrics.dailyBurn} / day.
        - Survival Runway: ${metrics.runwayDays} days before they go broke.
        - Worst Financial Habit: Most of their money bleeds into the "${metrics.topCategory}" category.
        
        User Query: "${aiQuery}"
        
        RULES:
        1. Be assertive, engaging, and slightly dramatic.
        2. Hook their attention immediately (e.g., "Listen to me,", "Are you serious?", "Brilliant move,").
        3. Use their actual data numbers to prove your point.
        4. Attack or praise their "${metrics.topCategory}" spending habit if relevant.
        5. Keep it punchy—maximum 3 sentences. No markdown.
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
      });

      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        setAiResponse(data.candidates[0].content.parts[0].text);
      } else {
        setAiResponse("I couldn't process that query. I need a clearer picture of what you want to do.");
      }
    } catch (error) {
      setAiResponse("Network connection severed. Check your internet.");
    }
    setIsAILoading(false);
  };

  const onGestureEvent = Animated.event([{ nativeEvent: { translationX: swipeAnimation } }], { useNativeDriver: false });
  const onHandlerStateChange = (event) => {
    if (event.nativeEvent.state === State.END) {
      if (event.nativeEvent.translationX < -50 || event.nativeEvent.translationX > 50) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowSafeToSpend(!showSafeToSpend);
      }
      Animated.spring(swipeAnimation, { toValue: 0, useNativeDriver: false }).start();
    }
  };

  const toggleBalancePrivacy = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsBalanceHidden(!isBalanceHidden);
  };

  const handleNumberInput = async (num) => {
    setPayNumber(num);
    if (num.length === 10) {
      setIsVerifyingNumber(true);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('phoneNumber', '==', `+91${num}`)); 
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          setPayeeName(`FinVerse User: ${snapshot.docs[0].data().name}`);
        } else {
          setPayeeName('External Transfer (Standard UPI)');
        }
      } catch (error) {
        setPayeeName('Network error checking registry.');
      }
      setIsVerifyingNumber(false);
    } else {
      setPayeeName('');
    }
  };

  const renderTransaction = ({ item }) => {
    const catMeta = CATEGORY_MAP[item.category] || CATEGORY_MAP['Transfers'];
    const isCredit = item.type === 'credit';
    const isSub = item.isSubscription;

    return (
      <View style={styles.txCard}>
        <View style={[styles.txIconContainer, { backgroundColor: `${catMeta.color}15` }]}>
          <MaterialCommunityIcons 
            name={isSub ? 'autorenew' : catMeta.icon} 
            size={24} 
            color={isCredit ? '#10B981' : catMeta.color} 
          />
        </View>
        <View style={styles.txDetails}>
          <Text style={styles.txReason}>{item.reason}</Text>
          <Text style={styles.txCategory}>{item.category} • {new Date(item.timestamp).toLocaleDateString()}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isCredit ? '#10B981' : '#F8FAFC' }]}>
          {isCredit ? '+' : '-'}₹{parseFloat(item.amount).toFixed(2)}
        </Text>
      </View>
    );
  };

  if (loading || !userData || !metrics) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color="#00E5FF" /></View>;

  const displayBalance = showSafeToSpend ? metrics.safeToSpend : metrics.currentBalance;

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. DIRECT PAYMENT MODAL */}
      <Modal visible={isPayModalVisible} animationType="slide" transparent={true} onRequestClose={() => setPayModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
              <Text style={styles.modalTitle}>Phone Transfer</Text>
              <TouchableOpacity onPress={() => {setPayModalVisible(false); setPayeeName(''); setPayNumber(''); setPayReason('');}}>
                <Ionicons name="close-circle" size={28} color="#475569" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>MOBILE NUMBER</Text>
            <TextInput style={styles.input} keyboardType="phone-pad" maxLength={10} placeholder="Enter 10 digit number" placeholderTextColor="#475569" value={payNumber} onChangeText={handleNumberInput} autoFocus />
            {isVerifyingNumber ? <ActivityIndicator size="small" color="#00E5FF" style={{alignSelf: 'flex-start', marginBottom: 16}} /> : null}
            {payeeName ? <Text style={[styles.verifiedText, {color: payeeName.includes('FinVerse User') ? '#10B981' : '#F59E0B'}]}><Ionicons name={payeeName.includes('FinVerse User') ? "checkmark-circle" : "swap-horizontal"} size={14} /> {payeeName}</Text> : null}
            <Text style={styles.label}>AMOUNT (₹)</Text>
            <TextInput style={styles.input} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#475569" value={payAmount} onChangeText={setPayAmount} />
            <Text style={styles.label}>PURPOSE (Optional)</Text>
            <TextInput style={styles.input} placeholder="e.g. Lunch split..." placeholderTextColor="#475569" value={payReason} onChangeText={setPayReason} />
            <Text style={styles.label}>SELECT CATEGORY (Required)</Text>
            <View style={styles.categoryScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                {CATEGORIES.filter(c => c !== 'Income').map((cat) => (
                  <TouchableOpacity key={cat} style={[styles.categoryPill, payCategory === cat && styles.categoryPillActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPayCategory(cat); }}>
                    <Text style={[styles.categoryPillText, payCategory === cat && styles.categoryPillTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.payBtn} onPress={executeDirectPayment}>
              <Text style={styles.payBtnText}>Send Securely</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 2. MANUAL CASH LOG MODAL */}
      <Modal visible={isManualModalVisible} animationType="slide" transparent={true} onRequestClose={() => setManualModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
              <Text style={styles.modalTitle}>Log Cash</Text>
              <TouchableOpacity onPress={() => {setManualModalVisible(false); setManualAmount(''); setManualReason('');}}>
                <Ionicons name="close-circle" size={28} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Segmented Control */}
            <View style={styles.segmentContainer}>
              <TouchableOpacity style={[styles.segmentBtn, manualType === 'debit' && styles.segmentBtnActiveExpense]} onPress={() => setManualType('debit')}>
                <Text style={[styles.segmentText, manualType === 'debit' && {color: '#FFF'}]}>Expense (-)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segmentBtn, manualType === 'credit' && styles.segmentBtnActiveIncome]} onPress={() => setManualType('credit')}>
                <Text style={[styles.segmentText, manualType === 'credit' && {color: '#FFF'}]}>Income (+)</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>AMOUNT (₹)</Text>
            <TextInput style={styles.input} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#475569" value={manualAmount} onChangeText={setManualAmount} autoFocus />
            
            <Text style={styles.label}>PURPOSE / REASON</Text>
            <TextInput style={styles.input} placeholder={manualType === 'debit' ? "e.g. Bought groceries..." : "e.g. Freelance gig..."} placeholderTextColor="#475569" value={manualReason} onChangeText={setManualReason} />

            {manualType === 'debit' && (
              <>
                <Text style={styles.label}>CATEGORY</Text>
                <View style={styles.categoryScrollWrapper}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                    {CATEGORIES.filter(c => c !== 'Income').map((cat) => (
                      <TouchableOpacity key={cat} style={[styles.categoryPill, manualCategory === cat && styles.categoryPillActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setManualCategory(cat); }}>
                        <Text style={[styles.categoryPillText, manualCategory === cat && styles.categoryPillTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </>
            )}
            
            <TouchableOpacity style={[styles.payBtn, manualType === 'credit' && {backgroundColor: '#10B981'}]} onPress={handleManualSubmit} disabled={actionLoading}>
              {actionLoading ? <ActivityIndicator color="#0B0F19" /> : <Text style={styles.payBtnText}>Save to Ledger</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 3. GEMINI AI ADVISOR MODAL */}
      <Modal visible={isAIModalVisible} animationType="fade" transparent={true} onRequestClose={() => setAIModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#00E5FF', borderWidth: 1 }]}>
            <View style={styles.aiModalHeader}>
              <MaterialCommunityIcons name="google-circles-extended" size={28} color="#00E5FF" />
              <Text style={styles.modalTitle}>Ask AI</Text>
            </View>
            <Text style={styles.aiSubText}>Consult your live financial data before spending.</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="e.g. Can I afford a ₹1500 dinner tonight?" placeholderTextColor="#475569" value={aiQuery} onChangeText={setAiQuery} />
            {aiResponse ? (
              <View style={styles.aiResponseBox}>
                <Text style={styles.aiResponseText}>{aiResponse}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.aiBtn} onPress={handleAskGemini} disabled={isAILoading}>
              {isAILoading ? <ActivityIndicator color="#0B0F19" /> : <Text style={styles.aiBtnText}>Analyze Scenario</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => {setAIModalVisible(false); setAiResponse(''); setAiQuery('');}}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
              <Animated.View style={styles.header}>
                <View style={styles.headerTop}>
                  <View>
                    <Text style={styles.appName}>FINVERSE</Text>
                    <Text style={styles.greeting}>{getGreeting()}, {userData.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Rewards', 'Cashback and wallet features unlocking soon!')}>
                    <MaterialCommunityIcons name="wallet-giftcard" size={30} color="#00E5FF" />
                  </TouchableOpacity>
                </View>

                {/* LIQUIDITY DISPLAY (HIDDEN BY DEFAULT) */}
                <View style={styles.balanceContainer}>
                  <Text style={styles.balanceLabel}>
                    {showSafeToSpend ? 'SAFE LIQUIDITY (BUFFER INCLUDED)' : 'TOTAL RAW CAPITAL'}
                  </Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={toggleBalancePrivacy}>
                    <Text style={styles.balanceAmount}>
                      {isBalanceHidden ? '₹ ••••••' : `₹${displayBalance.toFixed(2)}`}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.runwayPill}>
                    <Text style={styles.runwayText}>{metrics.runwayDays} Days Runway</Text>
                  </View>
                </View>
              </Animated.View>
            </PanGestureHandler>

            {/* OMNI-CHANNEL PAYMENT HUB */}
            <View style={styles.hubContainer}>
              <TouchableOpacity style={styles.hubAction} activeOpacity={1} onPress={() => navigation.navigate('Scanner')}>
                <View style={styles.hubIconBox}><MaterialCommunityIcons name="qrcode-scan" size={26} color="#00E5FF" /></View>
                <Text style={styles.hubText}>Scan QR</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.hubAction} activeOpacity={1} onPress={() => setPayModalVisible(true)}>
                <View style={styles.hubIconBox}><MaterialCommunityIcons name="cellphone-wireless" size={26} color="#00E5FF" /></View>
                <Text style={styles.hubText}>Pay Number</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.hubAction} activeOpacity={1} onPress={() => setManualModalVisible(true)}>
                <View style={styles.hubIconBox}><MaterialCommunityIcons name="cash-register" size={26} color="#00E5FF" /></View>
                <Text style={styles.hubText}>Log Cash</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.hubAction} activeOpacity={1} onPress={() => setAIModalVisible(true)}>
                <View style={[styles.hubIconBox, { backgroundColor: 'rgba(0, 229, 255, 0.15)', borderColor: '#00E5FF', borderWidth: 1 }]}>
                  <MaterialCommunityIcons name="robot-outline" size={26} color="#00E5FF" />
                </View>
                <Text style={[styles.hubText, { color: '#00E5FF' }]}>Ask AI</Text>
              </TouchableOpacity>
            </View>

            {/* INTERACTIVE ANALYTICS ENGINE */}
            <View style={styles.chartSection}>
              <View style={styles.chartHeader}>
                <Text style={styles.sectionTitle}>CASH FLOW</Text>
                <View style={styles.chartToggles}>
                  {['Week', 'Month', 'Year'].map(period => (
                    <TouchableOpacity key={period} onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setChartPeriod(period);
                    }}>
                      <Text style={[styles.chartToggleText, chartPeriod === period && styles.chartToggleActive]}>{period}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <LineChart
                data={getChartData()}
                width={width - 72} 
                height={180}
                withDots={true}
                withInnerLines={false}
                chartConfig={{
                  backgroundColor: '#1E293B',
                  backgroundGradientFrom: '#1E293B',
                  backgroundGradientTo: '#1E293B',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
                  propsForDots: { r: "4", strokeWidth: "2" }
                }}
                bezier
                style={{ borderRadius: 16, marginTop: 16 }}
              />
            </View>

            {/* AUTOPAY/SUBSCRIPTION REMINDER CARD */}
            {metrics.upcomingBills && metrics.upcomingBills.length > 0 && (
              <View style={styles.reminderCard}>
                <View style={styles.reminderHeader}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#F59E0B" />
                  <Text style={styles.reminderTitle}>UPCOMING AUTOPAYS DETECTED</Text>
                </View>
                {metrics.upcomingBills.map((bill, index) => (
                  <View key={index} style={styles.reminderRow}>
                    <Text style={styles.reminderName}>{bill.name}</Text>
                    <Text style={styles.reminderDue}>
                      ₹{bill.amount} hits in {bill.daysLeft} {bill.daysLeft === 1 ? 'day' : 'days'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginTop: 10, marginBottom: 12 }]}>LEDGER</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>Ledger is empty.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  center: { justifyContent: 'center', alignItems: 'center' },
  
  header: { padding: 24, backgroundColor: '#1E293B', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, borderWidth: 1, borderTopWidth: 0, borderColor: '#334155', marginBottom: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  appName: { fontSize: 16, fontWeight: '900', color: '#00E5FF', letterSpacing: 3, marginBottom: 4 },
  greeting: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  
  balanceContainer: { alignItems: 'center' },
  balanceLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 1 },
  balanceAmount: { fontSize: 48, fontWeight: '900', color: '#FFFFFF', marginVertical: 8 },
  runwayPill: { backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#10B981', marginTop: 4 },
  runwayText: { color: '#10B981', fontSize: 12, fontWeight: 'bold' },

  hubContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 32 },
  hubAction: { alignItems: 'center', flex: 1 },
  hubIconBox: { width: 56, height: 56, backgroundColor: '#1E293B', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  hubText: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },

  chartSection: { marginHorizontal: 20, marginBottom: 24, backgroundColor: '#1E293B', padding: 16, borderRadius: 24, borderWidth: 1, borderColor: '#334155' },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.5 },
  chartToggles: { flexDirection: 'row', gap: 12 },
  chartToggleText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  chartToggleActive: { color: '#00E5FF', borderBottomWidth: 1, borderColor: '#00E5FF' },

  reminderCard: { backgroundColor: 'rgba(245, 158, 11, 0.05)', marginHorizontal: 20, marginBottom: 24, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)' },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  reminderTitle: { color: '#F59E0B', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  reminderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  reminderName: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  reminderDue: { color: '#F59E0B', fontSize: 13, fontWeight: 'bold' },

  txCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#1E293B', marginHorizontal: 20 },
  txIconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  txDetails: { flex: 1 },
  txReason: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  txCategory: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  txAmount: { fontSize: 16, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,15,25,0.95)', justifyContent: 'flex-end', padding: 0 },
  modalContent: { backgroundColor: '#1E293B', padding: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  modalTitle: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  
  segmentContainer: { flexDirection: 'row', backgroundColor: '#0B0F19', borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentBtnActiveExpense: { backgroundColor: '#F43F5E' },
  segmentBtnActiveIncome: { backgroundColor: '#10B981' },
  segmentText: { color: '#64748B', fontWeight: '800', fontSize: 13 },

  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, letterSpacing: 1 },
  input: { backgroundColor: '#0B0F19', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 18, color: '#FFF', fontWeight: 'bold', borderWidth: 1, borderColor: '#334155' },
  verifiedText: { fontSize: 13, fontWeight: 'bold', marginBottom: 16, marginTop: -8 },
  
  categoryScrollWrapper: { height: 50, marginBottom: 20 },
  categoryScroll: { alignItems: 'center', paddingRight: 20 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#0B0F19', borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  categoryPillActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF', shadowColor: '#00E5FF', shadowOpacity: 0.4, shadowRadius: 8 },
  categoryPillText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
  categoryPillTextActive: { color: '#0B0F19', fontWeight: '800' },

  payBtn: { backgroundColor: '#00E5FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  payBtnText: { color: '#0B0F19', fontSize: 16, fontWeight: '900', textTransform: 'uppercase' },
  cancelBtn: { padding: 16, alignItems: 'center', marginBottom: 20 },
  cancelBtnText: { color: '#EF4444', fontSize: 14, fontWeight: 'bold' },

  aiModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  aiSubText: { color: '#94A3B8', fontSize: 13, marginBottom: 20 },
  aiResponseBox: { backgroundColor: 'rgba(0, 229, 255, 0.1)', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#00E5FF' },
  aiResponseText: { color: '#E2E8F0', fontSize: 14, lineHeight: 22 },
  aiBtn: { backgroundColor: '#00E5FF', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  aiBtnText: { color: '#0B0F19', fontSize: 16, fontWeight: '900', textTransform: 'uppercase' },

  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#475569', marginTop: 12, fontSize: 14, fontWeight: '600' },
});