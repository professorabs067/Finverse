// src/screens/LoginScreen.js
import React, { useContext, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FinanceContext } from '../context/FinanceContext';
import * as SecureStore from 'expo-secure-store';

// Import Firebase
import { auth, db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function LoginScreen({ navigation, route }) {
  const { setUserName, setBalance } = useContext(FinanceContext);
  const [nameInput, setNameInput] = useState('');
  const [balanceInput, setBalanceInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  
  const phoneNumber = route.params?.phoneNumber || '';

  const handleSetupComplete = async () => {
    if (!nameInput || !balanceInput || pinInput.length !== 4) {
      Alert.alert('Incomplete', 'Please fill all fields and set a 4-digit PIN.');
      return;
    }

    // Final warning about initial amount being permanent
    Alert.alert(
      '⚠️ Important Warning',
      'The initial amount you enter will be your starting balance. This cannot be modified later and will be used to calculate all your transactions. Are you absolutely sure?',
      [
        { 
          text: 'Review', 
          style: 'cancel' 
        },
        { 
          text: 'I Understand, Proceed', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Save complete user data to Firestore
              const userRef = doc(db, 'users', auth.currentUser.uid);
              await setDoc(userRef, {
                name: nameInput,
                phoneNumber: phoneNumber,
                initialBalance: parseFloat(balanceInput),
                currentBalance: parseFloat(balanceInput),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isProfileComplete: true
              });

              // Update local context
              setUserName(nameInput);
              setBalance(parseFloat(balanceInput));

              // Save PIN securely
              await SecureStore.setItemAsync('userPin', pinInput);
              
              // Navigate to Main Dashboard
              navigation.replace('Main');
            } catch (error) {
              Alert.alert('Database Error', 'Could not save profile data.');
              console.error(error);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.content}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Ionicons name="person-circle-outline" size={100} color="#00E5FF" style={styles.neonGlow} />
            <Text style={styles.title}>Initialize Profile</Text>
            <Text style={styles.subtitle}>Configure your FinVerse identity.</Text>
          </View>

          {/* Phone Number Display */}
          {phoneNumber ? (
            <View style={styles.phoneContainer}>
              <Ionicons name="call-outline" size={20} color="#00E5FF" />
              <Text style={styles.phoneText}>{phoneNumber}</Text>
            </View>
          ) : null}

          {/* Warning Card */}
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={24} color="#F59E0B" />
            <Text style={styles.warningText}>
              The initial amount you enter will be permanent and cannot be changed later. All transactions will be calculated from this amount.
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>OPERATOR NAME</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#00E5FF" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="e.g. Alex" 
                placeholderTextColor="#475569"
                value={nameInput} 
                onChangeText={setNameInput} 
              />
            </View>
            
            <Text style={styles.label}>INITIAL FUNDS (₹)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="wallet-outline" size={20} color="#00E5FF" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="0.00" 
                placeholderTextColor="#475569"
                keyboardType="numeric" 
                value={balanceInput} 
                onChangeText={setBalanceInput} 
              />
            </View>

            <Text style={styles.label}>CREATE 4-DIGIT PIN</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="keypad-outline" size={20} color="#00E5FF" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="****" 
                placeholderTextColor="#475569"
                keyboardType="numeric" 
                maxLength={4}
                secureTextEntry={true}
                value={pinInput} 
                onChangeText={setPinInput} 
              />
            </View>
          </View>

          <TouchableOpacity style={styles.neonButton} onPress={handleSetupComplete}>
            <Text style={styles.buttonText}>Complete Setup</Text>
            <Ionicons name="checkmark-circle" size={20} color="#000" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0B0F19' 
  },
  content: { 
    flex: 1, 
    padding: 24 
  },
  header: { 
    alignItems: 'center', 
    marginBottom: 24 
  },
  neonGlow: { 
    textShadowColor: '#00E5FF', 
    textShadowOffset: { width: 0, height: 0 }, 
    textShadowRadius: 20, 
    marginBottom: 10 
  },
  title: { 
    fontSize: 32, 
    fontWeight: '900', 
    color: '#FFFFFF', 
    textAlign: 'center', 
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: { 
    fontSize: 14, 
    color: '#94A3B8', 
    textAlign: 'center', 
    textTransform: 'uppercase', 
    letterSpacing: 1 
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  phoneText: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
    gap: 12,
  },
  warningText: {
    flex: 1,
    color: '#F59E0B',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputContainer: { 
    marginBottom: 32 
  },
  label: { 
    fontSize: 12, 
    fontWeight: '800', 
    color: '#00E5FF', 
    marginBottom: 8, 
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
    paddingHorizontal: 16,
    height: 55,
  },
  inputIcon: { 
    marginRight: 12 
  },
  input: { 
    flex: 1, 
    color: '#F8FAFC', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  neonButton: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  buttonText: { 
    color: '#000000', 
    fontSize: 18, 
    fontWeight: '800', 
    marginRight: 8, 
    textTransform: 'uppercase' 
  },
});