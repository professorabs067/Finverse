// src/screens/PhoneAuthScreen.js
import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';

// Import your Firebase instances
import { auth, db } from '../config/firebase';
import { firebaseConfig } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function PhoneAuthScreen({ navigation }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const recaptchaVerifier = useRef(null);

  // 1. Send OTP via Firebase
  const handleSendOTP = async () => {
    if (phoneNumber.length >= 10) {
      setLoading(true);
      try {
        const phoneProvider = new PhoneAuthProvider(auth);
        const id = await phoneProvider.verifyPhoneNumber(
          `+91${phoneNumber}`,
          recaptchaVerifier.current
        );
        setVerificationId(id);
        setIsVerifying(true);
        Alert.alert('Success', 'OTP sent successfully!');
      } catch (error) {
        console.error('OTP Error:', error);
        Alert.alert('Error', error.message || 'Failed to send OTP. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      Alert.alert('Invalid', 'Please enter a valid 10-digit phone number.');
    }
  };

  // 2. Verify OTP & Create Session
  const handleVerifyOTP = async () => {
    if (otp.length === 6 && verificationId) {
      setLoading(true);
      try {
        const credential = PhoneAuthProvider.credential(verificationId, otp);
        const userCredential = await signInWithCredential(auth, credential);
        
        // Save phone number to user document in Firestore
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          // User already has a profile, update phone number if needed
          await setDoc(userRef, {
            phoneNumber: `+91${phoneNumber}`,
            lastLogin: new Date().toISOString()
          }, { merge: true });
          
          // User exists, go directly to Main (Dashboard)
          navigation.replace('Main');
        } else {
          // New user, save phone number and go to profile setup
          await setDoc(userRef, {
            phoneNumber: `+91${phoneNumber}`,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          });
          
          // New user - go to profile setup
          navigation.replace('Login', { phoneNumber: `+91${phoneNumber}` });
        }
      } catch (error) {
        console.error('Verification Error:', error);
        Alert.alert('Error', 'Invalid OTP. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Invisible Recaptcha required by Firebase */}
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={firebaseConfig}
        attemptInvisibleVerification={true}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="scan-circle-outline" size={100} color="#00E5FF" style={styles.neonGlow} />
        </View>
        <Text style={styles.title}>FinVerse<Text style={styles.aiDot}>.</Text>AI</Text>
        <Text style={styles.subtitle}>Secure financial intelligence.</Text>

        {!isVerifying ? (
          <View style={styles.inputSection}>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color="#00E5FF" style={styles.inputIcon} />
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter mobile number"
                placeholderTextColor="#475569"
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                editable={!loading}
              />
            </View>
            <TouchableOpacity 
              style={[styles.neonButton, loading && styles.disabledButton]} 
              onPress={handleSendOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Send Secure OTP</Text>
                  <Ionicons name="arrow-forward" size={20} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputSection}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#00E5FF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit OTP"
                placeholderTextColor="#475569"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                editable={!loading}
              />
            </View>
            <TouchableOpacity 
              style={[styles.neonButton, loading && styles.disabledButton]} 
              onPress={handleVerifyOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Authenticate</Text>
                  <Ionicons name="shield-checkmark" size={20} color="#000" />
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setIsVerifying(false)} disabled={loading}>
              <Text style={styles.linkText}>Change Phone Number</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { flex: 1, justifyContent: 'center', padding: 32 },
  iconContainer: { alignItems: 'center', marginBottom: 16 },
  neonGlow: { textShadowColor: '#00E5FF', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
  title: { fontSize: 42, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', letterSpacing: 2 },
  aiDot: { color: '#00E5FF' },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 48, textTransform: 'uppercase', letterSpacing: 1 },
  inputSection: { width: '100%' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 24, paddingHorizontal: 16, height: 60 },
  inputIcon: { marginRight: 12 },
  prefix: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  input: { flex: 1, color: '#F8FAFC', fontSize: 18, fontWeight: '600' },
  neonButton: { flexDirection: 'row', height: 60, backgroundColor: '#00E5FF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 15, elevation: 10 },
  disabledButton: { opacity: 0.5, shadowOpacity: 0.3 },
  buttonText: { color: '#000000', fontSize: 18, fontWeight: '800', marginRight: 8, textTransform: 'uppercase' },
  linkText: { color: '#00E5FF', textAlign: 'center', marginTop: 20, fontSize: 14, fontWeight: '600' }
});