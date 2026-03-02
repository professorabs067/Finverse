import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { FinanceContext } from '../context/FinanceContext';

// Import Firebase
import { auth, db } from '../config/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const screenWidth = Dimensions.get('window').width;
const GEMINI_API_KEY = "AIzaSyDn3CQWDczkph14EU4kTQpwbeSjqFR944s"; // ⚠️ PASTE YOUR KEY HERE

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

// Helper to get local date string YYYY-MM-DD safely
const getLocalDateString = (dateObj) => {
  const offset = dateObj.getTimezoneOffset() * 60000;
  return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
};

export default function StatsScreen() {
  const { balance } = useContext(FinanceContext);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Diary & Calendar States
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // AI States
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const txRef = collection(db, 'transactions');
    const q = query(txRef, where('uid', '==', uid), orderBy('timestamp', 'desc'));
    
    const unsubscribeTx = onSnapshot(q, (querySnapshot) => {
      const txs = [];
      querySnapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() });
      });
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsubscribeTx();
  }, []);

  const calculateStats = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const weekAgo = new Date(now.setDate(now.getDate() - 7));

    const totalSpent = transactions.filter(t => t.type === 'debit').reduce((acc, curr) => acc + curr.amount, 0);
    const monthlySpent = transactions.filter(t => {
      const txDate = new Date(t.timestamp);
      return t.type === 'debit' && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
    }).reduce((acc, curr) => acc + curr.amount, 0);

    const weeklySpent = transactions.filter(t => t.type === 'debit' && new Date(t.timestamp) >= weekAgo).reduce((acc, curr) => acc + curr.amount, 0);

    const categoryTotals = transactions.reduce((acc, tx) => {
      if (tx.type === 'debit') acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    }, {});

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayTotal = transactions.filter(t => {
        const txDate = new Date(t.timestamp);
        return t.type === 'debit' && txDate >= dayStart && txDate <= dayEnd;
      }).reduce((acc, curr) => acc + curr.amount, 0);
      
      last7Days.push(dayTotal);
    }

    const avgDaily = weeklySpent / 7;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysPassed = new Date().getDate();
    const projectedMonthly = (monthlySpent / daysPassed) * daysInMonth;

    return { totalSpent, monthlySpent, weeklySpent, categoryTotals, last7Days, avgDaily, projectedMonthly };
  };

  const stats = transactions.length > 0 ? calculateStats() : null;
  const pieData = stats ? Object.keys(stats.categoryTotals).map((key, index) => ({
    name: key,
    amount: stats.categoryTotals[key],
    color: ['#00E5FF', '#3B82F6', '#8B5CF6', '#F43F5E', '#10B981', '#F59E0B'][index % 6],
    legendFontColor: '#94A3B8',
    legendFontSize: 12,
  })) : [];

  // --- DIARY ENGINE: Filter & Mark Dates ---
  const markedDates = {};
  
  // 1. Add dots to days that have transactions
  transactions.forEach(tx => {
    const dString = getLocalDateString(new Date(tx.timestamp));
    markedDates[dString] = { marked: true, dotColor: tx.type === 'debit' ? '#F43F5E' : '#10B981' };
  });
  
  // 2. Highlight the currently selected date
  markedDates[selectedDate] = { 
    ...markedDates[selectedDate], 
    selected: true, 
    selectedColor: '#00E5FF', 
    selectedTextColor: '#0B0F19' 
  };

  const diaryTransactions = transactions.filter(tx => {
    return getLocalDateString(new Date(tx.timestamp)) === selectedDate;
  });

  const dailySpent = diaryTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
  const dailyEarned = diaryTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);

  const toggleCalendar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsCalendarOpen(!isCalendarOpen);
  };

  const onDayPress = (day) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(day.dateString);
    setIsCalendarOpen(false);
    setAiResponse(''); // Clear AI response when changing pages
  };

  const handleAskGemini = async () => {
    if (!aiQuery) return;
    setIsAILoading(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    try {
      const txList = diaryTransactions.map(t => `${t.type === 'debit' ? 'Spent' : 'Earned'} ₹${t.amount} on ${t.category} (${t.reason})`).join(' | ');

      const promptText = `
        You are a highly analytical, CFO-level financial advisor embedded in the FinVerse app.
        The user is looking at their Financial Diary for the date: ${selectedDate}.
        
        DIARY PAGE DATA FOR ${selectedDate}:
        - Total Outflow (Spent): ₹${dailySpent}
        - Total Inflow (Earned): ₹${dailyEarned}
        - Specific Transactions Today: ${txList || "No transactions recorded on this date."}
        
        GLOBAL CONTEXT:
        - 7-Day Average Burn Rate: ₹${stats ? stats.avgDaily.toFixed(0) : 0}/day
        
        User Query: "${aiQuery}"
        
        Analyze their diary data to answer their query. Be direct, use numbers, and act like a strict financial coach. Max 3 sentences. No markdown.
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
      });

      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        setAiResponse(data.candidates[0].content.parts[0].text);
      } else {
        setAiResponse("Analysis failed. Try rephrasing your query.");
      }
    } catch (error) {
      setAiResponse("Network error. Unable to reach Gemini servers.");
    }
    setIsAILoading(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.headerTitle}>FINANCIAL INTELLIGENCE</Text>

          {/* --- DIARY-AWARE AI ADVISORY --- */}
          <View style={styles.aiCard}>
            <View style={styles.aiHeaderRow}>
              <MaterialCommunityIcons name="robot-outline" size={24} color="#00E5FF" />
              <View>
                <Text style={styles.aiHeader}>CFO ADVISOR</Text>
                <Text style={styles.aiContextText}>Currently analyzing: {selectedDate}</Text>
              </View>
            </View>

            <View style={styles.aiInputRow}>
              <TextInput 
                style={styles.aiInput} 
                placeholder={`Ask about your spending on ${selectedDate}...`}
                placeholderTextColor="#475569" 
                value={aiQuery} 
                onChangeText={setAiQuery} 
              />
              <TouchableOpacity style={styles.aiSendBtn} onPress={handleAskGemini} disabled={isAILoading}>
                {isAILoading ? <ActivityIndicator color="#0B0F19" size="small" /> : <Ionicons name="send" size={18} color="#0B0F19" />}
              </TouchableOpacity>
            </View>

            {aiResponse ? (
              <View style={styles.aiResponseBox}>
                <Text style={styles.aiResponseText}>{aiResponse}</Text>
              </View>
            ) : null}
          </View>

          {/* --- THE FINANCIAL DIARY --- */}
          <View style={styles.diaryContainer}>
            
            <View style={styles.diaryHeaderContainer}>
              <Text style={styles.sectionTitle}>YOUR FINANCIAL DIARY</Text>
              
              {/* Calendar Toggle Button */}
              <TouchableOpacity style={styles.calendarToggleBtn} onPress={toggleCalendar}>
                <Ionicons name="calendar-outline" size={16} color="#00E5FF" />
                <Text style={styles.calendarToggleText}>
                  {selectedDate === getLocalDateString(new Date()) ? 'Today' : selectedDate}
                </Text>
                <Ionicons name={isCalendarOpen ? "chevron-up" : "chevron-down"} size={16} color="#00E5FF" />
              </TouchableOpacity>
            </View>

            {/* Expandable Calendar View */}
            {isCalendarOpen && (
              <View style={styles.calendarWrapper}>
                <Calendar
                  current={selectedDate}
                  onDayPress={onDayPress}
                  markedDates={markedDates}
                  theme={{
                    backgroundColor: '#1E293B',
                    calendarBackground: '#1E293B',
                    textSectionTitleColor: '#94A3B8',
                    selectedDayBackgroundColor: '#00E5FF',
                    selectedDayTextColor: '#0B0F19',
                    todayTextColor: '#00E5FF',
                    dayTextColor: '#F8FAFC',
                    textDisabledColor: '#334155',
                    dotColor: '#F43F5E',
                    monthTextColor: '#FFF',
                    arrowColor: '#00E5FF',
                    textDayFontWeight: '600',
                    textMonthFontWeight: 'bold',
                    textDayHeaderFontWeight: '600',
                  }}
                />
              </View>
            )}

            {/* Diary Page Content */}
            <View style={styles.diaryPage}>
              <View style={styles.diarySummaryRow}>
                <View style={styles.diaryStatBox}>
                  <Text style={styles.diaryStatLabel}>OUTFLOW</Text>
                  <Text style={styles.diaryStatOut}>-₹{dailySpent.toFixed(2)}</Text>
                </View>
                <View style={styles.diaryStatDivider} />
                <View style={styles.diaryStatBox}>
                  <Text style={styles.diaryStatLabel}>INFLOW</Text>
                  <Text style={styles.diaryStatIn}>+₹{dailyEarned.toFixed(2)}</Text>
                </View>
              </View>

              {diaryTransactions.length > 0 ? (
                diaryTransactions.map(tx => {
                  const catMeta = CATEGORY_MAP[tx.category] || CATEGORY_MAP['Transfers'];
                  const isCredit = tx.type === 'credit';
                  return (
                    <View key={tx.id} style={styles.txRow}>
                      <View style={[styles.txIcon, { backgroundColor: `${catMeta.color}15` }]}>
                        <MaterialCommunityIcons name={catMeta.icon} size={20} color={catMeta.color} />
                      </View>
                      <View style={styles.txInfo}>
                        <Text style={styles.txReason}>{tx.reason}</Text>
                        <Text style={styles.txCatText}>{tx.category}</Text>
                      </View>
                      <Text style={[styles.txAmt, { color: isCredit ? '#10B981' : '#F8FAFC' }]}>
                        {isCredit ? '+' : '-'}₹{parseFloat(tx.amount).toFixed(2)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyDiaryState}>
                  <MaterialCommunityIcons name="book-open-blank-variant" size={40} color="#334155" />
                  <Text style={styles.emptyDiaryText}>No entries for this date.</Text>
                </View>
              )}
            </View>
          </View>

          {/* MACRO CHARTS */}
          {stats && (
            <View style={[styles.chartCard, {marginTop: 20}]}>
              <Text style={styles.chartTitle}>MACRO SPENDING BY CATEGORY</Text>
              {pieData.length > 0 ? (
                <>
                  <PieChart
                    data={pieData}
                    width={screenWidth - 80}
                    height={200}
                    chartConfig={{ color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})` }}
                    accessor="amount"
                    backgroundColor="transparent"
                    paddingLeft="0"
                    absolute
                  />
                  <View style={styles.categoryList}>
                    {Object.keys(stats.categoryTotals).map((category, index) => (
                      <View key={category} style={styles.categoryItem}>
                        <View style={styles.categoryLeft}>
                          <View style={[styles.categoryDot, { backgroundColor: ['#00E5FF', '#3B82F6', '#8B5CF6', '#F43F5E', '#10B981', '#F59E0B'][index % 6] }]} />
                          <Text style={styles.categoryName}>{category}</Text>
                        </View>
                        <Text style={styles.categoryAmount}>₹{stats.categoryTotals[category].toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>No macro data yet</Text>
              )}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 20, letterSpacing: 1 },
  
  // AI Card
  aiCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#00E5FF', marginBottom: 24, shadowColor: '#00E5FF', shadowOpacity: 0.1, shadowRadius: 10 },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  aiHeader: { fontSize: 14, fontWeight: '900', color: '#00E5FF', letterSpacing: 1 },
  aiContextText: { fontSize: 10, color: '#10B981', fontWeight: 'bold', marginTop: 2 },
  aiInputRow: { flexDirection: 'row', gap: 12 },
  aiInput: { flex: 1, backgroundColor: '#0B0F19', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#FFF', fontSize: 13 },
  aiSendBtn: { backgroundColor: '#00E5FF', width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  aiResponseBox: { marginTop: 16, backgroundColor: 'rgba(0, 229, 255, 0.1)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.3)' },
  aiResponseText: { color: '#E2E8F0', fontSize: 14, lineHeight: 22 },

  // Financial Diary
  diaryContainer: { marginBottom: 20 },
  diaryHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.5 },
  
  calendarToggleBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#334155', gap: 6 },
  calendarToggleText: { color: '#00E5FF', fontSize: 12, fontWeight: '700' },
  
  calendarWrapper: { backgroundColor: '#1E293B', borderRadius: 20, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },

  diaryPage: { backgroundColor: '#1E293B', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#334155' },
  diarySummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B0F19', borderRadius: 16, padding: 16, marginBottom: 16 },
  diaryStatBox: { flex: 1, alignItems: 'center' },
  diaryStatLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 4 },
  diaryStatOut: { fontSize: 18, fontWeight: '900', color: '#F43F5E' },
  diaryStatIn: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  diaryStatDivider: { width: 1, height: 30, backgroundColor: '#334155' },

  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B0F19', padding: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  txInfo: { flex: 1 },
  txReason: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', marginBottom: 2 },
  txCatText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  txAmt: { fontSize: 15, fontWeight: '900' },
  
  emptyDiaryState: { alignItems: 'center', paddingVertical: 32 },
  emptyDiaryText: { color: '#64748B', fontSize: 13, fontWeight: '600', marginTop: 12 },

  // Macro Charts
  chartCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  chartTitle: { fontSize: 12, fontWeight: '900', color: '#94A3B8', marginBottom: 16, letterSpacing: 1 },
  categoryList: { marginTop: 20, gap: 12 },
  categoryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  categoryName: { fontSize: 13, color: '#F8FAFC', fontWeight: '600' },
  categoryAmount: { fontSize: 14, color: '#FFF', fontWeight: '800' },
  emptyText: { color: '#64748B', fontSize: 14, fontWeight: '600', textAlign: 'center', marginVertical: 20 },
});