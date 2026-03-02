// src/screens/UnlockScreen.js
import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { FinanceContext } from '../context/FinanceContext';

// Import Firebase
import { auth, db } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function UnlockScreen({ navigation }) {
  const [pinCode, setPinCode] = useState(['', '', '', '']);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const { setUserName, setBalance } = useContext(FinanceContext);

  useEffect(() => {
    // 1. Check Firebase Session on App Load
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Session exists! Check if user has a profile
        await checkUserProfile(user);
      } else {
        // No session. Send to Phone Auth for sign up / login.
        setIsCheckingSession(false);
        navigation.replace('PhoneAuth');
      }
    });

    return unsubscribe; // Cleanup listener
  }, []);

  const checkUserProfile = async (user) => {
    try {
      // Check if user has a profile in Firestore
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        // User has profile, proceed to unlock
        setIsCheckingSession(false);
        checkBiometrics();
      } else {
        // User is authenticated but hasn't set up profile
        setIsCheckingSession(false);
        navigation.replace('Login');
      }
    } catch (error) {
      console.error('Profile check error:', error);
      setIsCheckingSession(false);
      navigation.replace('PhoneAuth');
    }
  };

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock FinVerse',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        unlockApp();
      }
    }
  };

  const unlockApp = async () => {
    try {
      // 2. Fetch the user's data from Firestore using their unique ID
      const docRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const userData = docSnap.data();
        setUserName(userData.name);
        setBalance(userData.currentBalance);
        navigation.replace('Main'); // Everything is setup, go to Dashboard
      } else {
        // User is authenticated via OTP, but hasn't set up their profile/PIN yet
        navigation.replace('Login'); 
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to secure server.');
    }
  };

  const handleKeypadPress = async (num) => {
    let newPin = [...pinCode];
    const emptyIndex = newPin.findIndex((val) => val === '');
    if (emptyIndex !== -1) {
      newPin[emptyIndex] = num;
      setPinCode(newPin);
      
      // If PIN is full, verify it against SecureStore
      if (emptyIndex === 3) {
        const savedPin = await SecureStore.getItemAsync('userPin');
        const enteredPin = newPin.join('');

        if (enteredPin === savedPin) {
          unlockApp();
        } else {
          Alert.alert('Access Denied', 'Incorrect PIN.');
          setPinCode(['', '', '', '']); // Reset
        }
      }
    }
  };

  if (isCheckingSession) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="scan-circle-outline" size={80} color="#00E5FF" style={styles.neonGlow} />
        <ActivityIndicator size="large" color="#00E5FF" style={{ marginTop: 20 }} />
        <Text style={{ color: '#00E5FF', marginTop: 10, fontWeight: 'bold' }}>Securing Connection...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="finger-print" size={80} color="#00E5FF" style={styles.neonGlow} />
        <Text style={styles.title}>System Locked</Text>
        <Text style={styles.subtitle}>Enter PIN or use Biometrics</Text>

        <View style={styles.pinContainer}>
          {pinCode.map((digit, index) => (
            <View key={index} style={[styles.pinDot, digit !== '' && styles.pinDotFilled]} />
          ))}
        </View>

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'bio'].map((key) => (
            <TouchableOpacity 
              key={key} 
              style={styles.keypadButton} 
              onPress={() => {
                if (key === 'C') setPinCode(['', '', '', '']);
                else if (key === 'bio') checkBiometrics();
                else handleKeypadPress(key);
              }}
            >
              {key === 'bio' ? (
                <Ionicons name="finger-print-outline" size={28} color="#00E5FF" />
              ) : (
                <Text style={styles.keypadText}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={() => navigation.replace('PhoneAuth')}>
          <Text style={styles.forgotText}>Forgot PIN? Re-authenticate</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  neonGlow: { textShadowColor: '#00E5FF', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFF' },
  subtitle: { fontSize: 14, color: '#94A3B8', marginTop: 8, marginBottom: 40 },
  pinContainer: { flexDirection: 'row', gap: 20, marginBottom: 60 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#334155' },
  pinDotFilled: { backgroundColor: '#00E5FF', borderColor: '#00E5FF', shadowColor: '#00E5FF', shadowOpacity: 0.8, shadowRadius: 10, elevation: 5 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 280, gap: 15 },
  keypadButton: { width: 75, height: 75, borderRadius: 40, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
  keypadText: { fontSize: 28, color: '#FFF', fontWeight: '600' },
  forgotText: { color: '#F43F5E', marginTop: 40, fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 },
});