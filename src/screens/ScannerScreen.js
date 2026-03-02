import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Linking, ActivityIndicator, ScrollView, Switch, LayoutAnimation, UIManager, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

// Import Firebase
import { auth, db } from '../config/firebase';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CATEGORIES = [
  'Food & Dining', 'Health & Gym', 'Software/Cloud', 
  'Entertainment', 'Education', 'Shopping', 
  'Transport', 'Bills', 'Transfers'
];

export default function ScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedUpiId, setScannedUpiId] = useState(null);
  const [payeeName, setPayeeName] = useState('Unknown Merchant');
  
  const [amount, setAmount] = useState('');
  const [isAmountLocked, setIsAmountLocked] = useState(false);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('Transfers');
  const [isSubscription, setIsSubscription] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const text = reason.toLowerCase();
    
    if (text.includes('aws') || text.includes('google') || text.includes('hosting') || text.includes('domain')) setCategory('Software/Cloud');
    else if (text.includes('zomato') || text.includes('swiggy') || text.includes('coffee') || text.includes('food') || text.includes('dinner')) setCategory('Food & Dining');
    else if (text.includes('gym') || text.includes('protein') || text.includes('supplement') || text.includes('health')) setCategory('Health & Gym');
    else if (text.includes('netflix') || text.includes('spotify') || text.includes('movie') || text.includes('prime')) setCategory('Entertainment');
    else if (text.includes('gate') || text.includes('course') || text.includes('udemy') || text.includes('tuition')) setCategory('Education');
    else if (text.includes('amazon') || text.includes('flipkart') || text.includes('myntra') || text.includes('mall') || text.includes('shop')) setCategory('Shopping');
    else if (text.includes('uber') || text.includes('ola') || text.includes('petrol') || text.includes('flight') || text.includes('train')) setCategory('Transport');
    else if (text.includes('wifi') || text.includes('rent') || text.includes('electricity') || text.includes('bill') || text.includes('recharge')) setCategory('Bills');
  }, [reason]);

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color="#00E5FF" />
        <Text style={styles.text}>Camera access required for UPI scanning.</Text>
        <TouchableOpacity style={styles.neonButton} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getUpiParam = (url, paramName) => {
    const regex = new RegExp(`[?&]${paramName}(=([^&#]*)|&|#|$)`);
    const results = regex.exec(url);
    if (!results || !results[2]) return null;
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  };

  const handleBarCodeScanned = ({ data }) => {
    if (!data || !data.toLowerCase().startsWith('upi://pay')) {
      return Alert.alert('Security Alert', 'Invalid QR code. This is not a recognized UPI format.');
    }

    try {
      const extractedPa = getUpiParam(data, 'pa');
      const extractedPn = getUpiParam(data, 'pn');
      const extractedAm = getUpiParam(data, 'am');
      
      if (!extractedPa || !extractedPa.includes('@')) {
        return Alert.alert('Security Alert', 'This QR code is missing a valid merchant UPI ID.');
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      
      setScannedUpiId(extractedPa);
      setPayeeName(extractedPn || 'Verified Merchant');

      if (extractedAm) {
        setAmount(extractedAm);
        setIsAmountLocked(true); 
      } else {
        setAmount('');
        setIsAmountLocked(false);
      }

    } catch (error) {
      Alert.alert('Scan Error', 'Could not process this QR code safely.');
    }
  };

  // --- THE NEW SILENT WATERFALL ALGORITHM ---
  const executePayment = async () => {
    if (!amount || isNaN(parseFloat(amount))) return Alert.alert('Error', 'Please enter a valid amount.');
    setIsProcessing(true);

    const finalReason = reason || `Paid ${payeeName}`; 
    const transactionRef = 'FV' + Date.now() + Math.floor(Math.random() * 1000);

    // Secure query parameters (includes mode=02 to fix PhonePe ₹2000 limit)
    const params = `pa=${scannedUpiId}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(finalReason)}&tr=${transactionRef}&mode=02`;
    
    // We create a list of possible app links to try
    const targetApps = [
      `upi://pay?${params}`,          // 1. Generic Standard (Works for Android 15)
      `phonepe://upi/pay?${params}`,  // 2. PhonePe Fallback (Fixes Android 10 bug)
      `tez://upi/pay?${params}`,      // 3. GPay Fallback
      `paytmmp://pay?${params}`       // 4. Paytm Fallback
    ];

    let successfullyOpened = false;

    // The code will silently loop through the list. If one fails, it instantly tries the next.
    for (const appUrl of targetApps) {
      try {
        await Linking.openURL(appUrl);
        successfullyOpened = true;
        break; // If it successfully opens the app, STOP trying the others!
      } catch (error) {
        // App not found, loop continues to the next one instantly
      }
    }

    if (!successfullyOpened) {
      setIsProcessing(false);
      return Alert.alert('Error', 'No UPI payment app found. Please install GPay, PhonePe, or Paytm.');
    }

    // If it worked, set the timeout to verify the transfer
    setTimeout(() => {
      Alert.alert(
        "Verify Transfer",
        `Did your transfer of ₹${amount} to ${payeeName} succeed?`,
        [
          { 
            text: "Failed / Cancelled", 
            style: "cancel", 
            onPress: () => {
              setIsProcessing(false);
              setScannedUpiId(null); 
            } 
          },
          { 
            text: "Yes, Transfer Successful", 
            onPress: async () => {
              try {
                await addDoc(collection(db, 'transactions'), {
                  uid: auth.currentUser.uid,
                  amount: parseFloat(amount),
                  payee: payeeName,
                  reason: finalReason,
                  category: category, 
                  isSubscription: isSubscription,
                  type: 'debit',
                  timestamp: new Date().toISOString()
                });

                const userRef = doc(db, 'users', auth.currentUser.uid);
                await updateDoc(userRef, {
                  currentBalance: increment(-parseFloat(amount))
                });

                setIsProcessing(false);
                navigation.goBack();
              } catch (dbError) {
                Alert.alert('Database Error', 'Could not save the transaction.');
                setIsProcessing(false);
              }
            } 
          }
        ]
      );
    }, 1500); // Wait 1.5 seconds so the bank app fully opens before showing this alert
  };

  if (scannedUpiId) {
    return (
      <View style={styles.paymentContainer}>
        <Text style={styles.title}>Authorize Payment</Text>
        <Text style={styles.subtitle}>Paying: <Text style={styles.highlight}>{payeeName}</Text></Text>

        <Text style={styles.label}>AMOUNT (₹)</Text>
        <TextInput 
          style={[styles.input, isAmountLocked && { color: '#10B981', borderColor: '#10B981' }]} 
          keyboardType="numeric" 
          placeholder="0.00" 
          placeholderTextColor="#475569" 
          value={amount} 
          onChangeText={setAmount} 
          editable={!isAmountLocked} 
          autoFocus={!isAmountLocked} 
        />
        {isAmountLocked && <Text style={{color: '#10B981', fontSize: 12, marginTop: -12, marginBottom: 16, fontWeight: 'bold'}}>Amount fixed by merchant QR</Text>}
        
        <Text style={styles.label}>PURPOSE (Optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. Dinner split..." placeholderTextColor="#475569" value={reason} onChangeText={setReason} />
        
        <Text style={styles.label}>SELECT CATEGORY (Required)</Text>
        <View style={styles.categoryScrollWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity 
                key={cat} 
                style={[styles.categoryPill, category === cat && styles.categoryPillActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setCategory(cat);
                }}
              >
                <Text style={[styles.categoryPillText, category === cat && styles.categoryPillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Recurring Subscription</Text>
            <Text style={styles.switchSubLabel}>Flag for tracking & analytics</Text>
          </View>
          <Switch
            trackColor={{ false: '#334155', true: '#00E5FF' }}
            thumbColor={isSubscription ? '#FFFFFF' : '#94A3B8'}
            onValueChange={setIsSubscription}
            value={isSubscription}
          />
        </View>
        
        <TouchableOpacity style={styles.payButton} onPress={executePayment} disabled={isProcessing}>
          {isProcessing ? <ActivityIndicator color="#000" /> : <Text style={styles.payButtonText}>Execute Transfer</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.cancelButton} onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setScannedUpiId(null);
        }}>
          <Text style={styles.cancelText}>Cancel & Rescan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scannedUpiId ? undefined : handleBarCodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.scannerBox} />
        <Text style={styles.scanText}>ALIGN QR WITHIN FRAME</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#0B0F19' },
  text: { textAlign: 'center', marginBottom: 20, fontSize: 16, color: '#94A3B8' },
  overlay: { flex: 1, backgroundColor: 'rgba(11, 15, 25, 0.4)', justifyContent: 'center', alignItems: 'center' },
  scannerBox: { width: 280, height: 280, borderColor: '#00E5FF', borderWidth: 2, backgroundColor: 'transparent', borderRadius: 24, shadowColor: '#00E5FF', shadowOpacity: 0.8, shadowRadius: 20 },
  scanText: { color: '#00E5FF', marginTop: 30, fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  
  paymentContainer: { flex: 1, backgroundColor: '#0B0F19', padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#94A3B8', marginBottom: 24 },
  highlight: { color: '#00E5FF', fontWeight: 'bold' },
  
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, letterSpacing: 1 },
  input: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 20, fontSize: 20, color: '#FFF', fontWeight: 'bold', borderWidth: 1, borderColor: '#334155' },
  
  categoryScrollWrapper: { height: 50, marginBottom: 24 },
  categoryScroll: { alignItems: 'center', paddingRight: 20 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  categoryPillActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF', shadowColor: '#00E5FF', shadowOpacity: 0.4, shadowRadius: 8 },
  categoryPillText: { color: '#94A3B8', fontWeight: '600', fontSize: 14 },
  categoryPillTextActive: { color: '#0B0F19', fontWeight: '800' },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 32, borderWidth: 1, borderColor: '#334155' },
  switchLabel: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  switchSubLabel: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  payButton: { backgroundColor: '#00E5FF', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 16, shadowColor: '#00E5FF', shadowOpacity: 0.4, shadowRadius: 10 },
  payButtonText: { color: '#000', fontSize: 18, fontWeight: '900', textTransform: 'uppercase' },
  cancelButton: { padding: 16, alignItems: 'center' },
  cancelText: { color: '#EF4444', fontSize: 16, fontWeight: 'bold' },
  neonButton: { backgroundColor: '#00E5FF', padding: 16, borderRadius: 12 },
  buttonText: { color: '#000', fontWeight: 'bold' },
});