// src/screens/ProfileScreen.js
import React, { useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch, TextInput, Modal, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FinanceContext } from '../context/FinanceContext';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Import Firebase
import { auth, db } from '../config/firebase';
import { signOut, updatePhoneNumber, PhoneAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { firebaseConfig } from '../config/firebase';

export default function ProfileScreen({ navigation }) {
  const { userName, setUserName, setBalance } = useContext(FinanceContext);
  
  const [editNameModal, setEditNameModal] = useState(false);
  const [phoneModal, setPhoneModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [reauthModal, setReauthModal] = useState(false);
  
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  const [reauthPhone, setReauthPhone] = useState('');
  const [reauthOtp, setReauthOtp] = useState('');
  const [reauthVerificationId, setReauthVerificationId] = useState(null);
  const [isReauthVerifying, setIsReauthVerifying] = useState(false);
  
  const [pushNotifications, setPushNotifications] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  
  const recaptchaVerifier = useRef(null);
  const reauthRecaptchaVerifier = useRef(null);

  useEffect(() => {
    fetchUserData();
    checkNotificationPermission();
  }, []);

  const fetchUserData = async () => {
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        setUserData(userDoc.data());
        setNewName(userDoc.data().name);
        setNewPhone(userDoc.data().phoneNumber?.replace('+91', '') || '');
        setReauthPhone(userDoc.data().phoneNumber || '');
        if (userDoc.data().pushNotificationsEnabled !== undefined) {
          setPushNotifications(userDoc.data().pushNotificationsEnabled);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const checkNotificationPermission = async () => {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    setPushNotifications(existingStatus === 'granted');
  };

  const togglePushNotifications = async (value) => {
    setLoading(true);
    try {
      if (value) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const token = await Notifications.getExpoPushTokenAsync({ projectId: 'your-expo-project-id' });
          const userRef = doc(db, 'users', auth.currentUser.uid);
          await updateDoc(userRef, { pushNotificationsEnabled: true, pushToken: token.data, updatedAt: new Date().toISOString() });
          setPushNotifications(true);
        } else {
          Alert.alert('Permission Denied', 'Please enable notifications in your device settings');
          setPushNotifications(false);
        }
      } else {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { pushNotificationsEnabled: false, pushToken: null, updatedAt: new Date().toISOString() });
        setPushNotifications(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleEditName = async () => {
    if (!newName.trim()) return Alert.alert('Error', 'Please enter a valid name');
    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { name: newName, updatedAt: new Date().toISOString() });
      setUserName(newName);
      setEditNameModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update name');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (newPhone.length >= 10) {
      setLoading(true);
      try {
        const phoneProvider = new PhoneAuthProvider(auth);
        const id = await phoneProvider.verifyPhoneNumber(`+91${newPhone}`, recaptchaVerifier.current);
        setVerificationId(id);
        setIsVerifying(true);
      } catch (error) {
        Alert.alert('Error', error.message || 'Failed to send OTP');
      } finally {
        setLoading(false);
      }
    } else {
      Alert.alert('Invalid', 'Please enter a valid 10-digit phone number.');
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length === 6 && verificationId) {
      setLoading(true);
      try {
        const credential = PhoneAuthProvider.credential(verificationId, otp);
        await updatePhoneNumber(auth.currentUser, credential);
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { phoneNumber: `+91${newPhone}`, updatedAt: new Date().toISOString() });
        setPhoneModal(false);
        setIsVerifying(false);
        setOtp('');
        setVerificationId(null);
      } catch (error) {
        Alert.alert('Error', 'Invalid OTP. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSendReauthOTP = async () => {
    setLoading(true);
    try {
      const phoneProvider = new PhoneAuthProvider(auth);
      const id = await phoneProvider.verifyPhoneNumber(reauthPhone, reauthRecaptchaVerifier.current);
      setReauthVerificationId(id);
      setIsReauthVerifying(true);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReauthOTP = async () => {
    if (reauthOtp.length === 6 && reauthVerificationId) {
      setLoading(true);
      try {
        const credential = PhoneAuthProvider.credential(reauthVerificationId, reauthOtp);
        await reauthenticateWithCredential(auth.currentUser, credential);
        setReauthModal(false);
        setIsReauthVerifying(false);
        setReauthOtp('');
        setReauthVerificationId(null);
        handleDeleteAccount();
      } catch (error) {
        Alert.alert('Error', 'Invalid OTP. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation.toLowerCase() !== 'delete') {
      Alert.alert('Error', 'Please type "delete" to confirm account deletion');
      return;
    }

    Alert.alert('⚠️ Permanent Deletion', 'This action cannot be undone. All your data will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteDoc(doc(db, 'users', auth.currentUser.uid));
            await auth.currentUser.delete();
            await SecureStore.deleteItemAsync('userPin');
            await SecureStore.deleteItemAsync('notificationSettings');
            setUserName('');
            setBalance(0);
            navigation.replace('PhoneAuth');
          } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
              setDeleteModal(false);
              setReauthModal(true);
            } else {
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to disconnect from FinVerse?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", 
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            setUserName('');
            setBalance(0);
            navigation.replace('PhoneAuth');
          } catch (error) {
            Alert.alert('Error', 'Could not safely disconnect.');
          }
        }
      }
    ]);
  };

  const helpSections = [
    { title: 'Getting Started', content: '• Add your initial balance carefully\n• Set up your 4-digit PIN\n• Enable biometrics' },
    { title: 'Managing Transactions', content: '• Scan UPI QR codes to make payments\n• Add manual cash expenses' },
    { title: 'Contact Support', content: 'Email: support@finverse.ai\nResponse time: Within 24 hours' }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={firebaseConfig} attemptInvisibleVerification={true} />
      <FirebaseRecaptchaVerifierModal ref={reauthRecaptchaVerifier} firebaseConfig={firebaseConfig} attemptInvisibleVerification={true} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{userName ? userName.charAt(0).toUpperCase() : 'U'}</Text>
          </View>
          <Text style={styles.name}>{userName}</Text>
          <Text style={styles.email}>ID: {auth.currentUser?.uid.substring(0, 8)}...</Text>
          <Text style={styles.phone}>{userData?.phoneNumber || 'No phone'}</Text>
          
          {/* Display Link Status for Child */}
          {userData?.linkedParent && (
            <View style={styles.linkBadge}>
              <MaterialCommunityIcons name="link-variant" size={14} color="#10B981" />
              <Text style={styles.linkBadgeText}>Linked to Parent</Text>
            </View>
          )}
        </View>

        <View style={styles.menu}>
          {/* DYNAMIC PARENT-CHILD BUTTON */}
          {userData?.linkedChild ? (
            <TouchableOpacity 
              style={[styles.menuItem, { backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: 12, paddingHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }]} 
              onPress={() => navigation.navigate('ChildReport', { childId: userData.linkedChild })}
            >
              <MaterialCommunityIcons name="finance" size={26} color="#10B981" />
              <Text style={[styles.menuText, { color: '#10B981', fontWeight: 'bold' }]}>View Child's Report</Text>
              <Ionicons name="chevron-forward" size={20} color="#10B981" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.menuItem, { backgroundColor: 'rgba(0, 229, 255, 0.05)', borderRadius: 12, paddingHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.2)' }]} 
              onPress={() => navigation.navigate('LinkAccount')}
            >
              <MaterialCommunityIcons name="account-child-circle" size={26} color="#00E5FF" />
              <Text style={[styles.menuText, { color: '#00E5FF', fontWeight: 'bold' }]}>Parent-Child Setup</Text>
              <Ionicons name="chevron-forward" size={20} color="#00E5FF" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={() => setEditNameModal(true)}>
            <Ionicons name="person-outline" size={24} color="#00E5FF" />
            <Text style={styles.menuText}>Edit Name</Text>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => setPhoneModal(true)}>
            <Ionicons name="call-outline" size={24} color="#00E5FF" />
            <Text style={styles.menuText}>Update Phone Number</Text>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>

          <View style={styles.notificationContainer}>
            <View style={styles.notificationLeft}>
              <Ionicons name="notifications-outline" size={24} color="#00E5FF" />
              <Text style={styles.notificationText}>Push Notifications</Text>
            </View>
            <Switch value={pushNotifications} onValueChange={togglePushNotifications} trackColor={{ false: '#334155', true: '#00E5FF' }} thumbColor={pushNotifications ? '#FFFFFF' : '#f4f3f4'} disabled={loading} />
          </View>

          <TouchableOpacity style={styles.menuItem} onPress={() => setHelpModal(true)}>
            <Ionicons name="help-buoy-outline" size={24} color="#00E5FF" />
            <Text style={styles.menuText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="power-outline" size={24} color="#EF4444" />
            <Text style={styles.logoutText}>Disconnect Session</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={() => setDeleteModal(true)}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Delete Account Permanently</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal visible={editNameModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput style={styles.modalInput} value={newName} onChangeText={setNewName} placeholder="Enter new name" placeholderTextColor="#64748B" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setEditNameModal(false)}><Text style={styles.modalCancelText}>CANCEL</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleEditName} disabled={loading}>{loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalConfirmText}>SAVE</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Phone Update Modal */}
      <Modal visible={phoneModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Phone Number</Text>
            {!isVerifying ? (
              <>
                <View style={styles.phoneInputWrapper}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput style={styles.phoneInput} value={newPhone} onChangeText={setNewPhone} placeholder="Enter new phone" placeholderTextColor="#64748B" keyboardType="phone-pad" maxLength={10} />
                </View>
                <TouchableOpacity style={styles.modalConfirmButton} onPress={handleSendOTP} disabled={loading}>{loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalConfirmText}>SEND OTP</Text>}</TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput style={styles.modalInput} value={otp} onChangeText={setOtp} placeholder="Enter 6-digit OTP" placeholderTextColor="#64748B" keyboardType="number-pad" maxLength={6} />
                <TouchableOpacity style={styles.modalConfirmButton} onPress={handleVerifyOTP} disabled={loading}>{loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalConfirmText}>VERIFY OTP</Text>}</TouchableOpacity>
                <TouchableOpacity onPress={() => setIsVerifying(false)}><Text style={styles.linkText}>Change Number</Text></TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => { setPhoneModal(false); setIsVerifying(false); setOtp(''); }}><Text style={styles.modalCancelText}>CANCEL</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Help Modal */}
      <Modal visible={helpModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.helpModalContent]}>
            <Text style={styles.modalTitle}>Help & Support</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {helpSections.map((section, index) => (
                <View key={index} style={styles.helpSection}>
                  <Text style={styles.helpSectionTitle}>{section.title}</Text>
                  <Text style={styles.helpSectionContent}>{section.content}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setHelpModal(false)}><Text style={styles.modalCancelText}>CLOSE</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Modal */}
      <Modal visible={deleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={50} color="#EF4444" style={styles.warningIcon} />
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.deleteWarning}>This action is permanent. All your data will be lost.</Text>
            <Text style={styles.deleteInstruction}>Type "delete" to confirm:</Text>
            <TextInput style={styles.modalInput} value={deleteConfirmation} onChangeText={setDeleteConfirmation} placeholder="delete" placeholderTextColor="#64748B" autoCapitalize="none" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => { setDeleteModal(false); setDeleteConfirmation(''); }}><Text style={styles.modalCancelText}>CANCEL</Text></TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirmButton} onPress={handleDeleteAccount} disabled={loading}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.deleteConfirmText}>DELETE</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reauth Modal */}
      <Modal visible={reauthModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Verify Identity</Text>
            <Text style={styles.reauthText}>For security, please verify your identity with an OTP sent to your phone.</Text>
            {!isReauthVerifying ? (
              <>
                <View style={styles.phoneDisplay}><Ionicons name="call-outline" size={20} color="#00E5FF" /><Text style={styles.phoneDisplayText}>{reauthPhone}</Text></View>
                <TouchableOpacity style={styles.modalConfirmButton} onPress={handleSendReauthOTP} disabled={loading}>{loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalConfirmText}>SEND OTP</Text>}</TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput style={styles.modalInput} value={reauthOtp} onChangeText={setReauthOtp} placeholder="Enter 6-digit OTP" placeholderTextColor="#64748B" keyboardType="number-pad" maxLength={6} />
                <TouchableOpacity style={styles.modalConfirmButton} onPress={handleVerifyReauthOTP} disabled={loading}>{loading ? <ActivityIndicator color="#000" /> : <Text style={styles.modalConfirmText}>VERIFY & DELETE</Text>}</TouchableOpacity>
                <TouchableOpacity onPress={() => setIsReauthVerifying(false)}><Text style={styles.linkText}>Change Phone Number</Text></TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => { setReauthModal(false); setIsReauthVerifying(false); setReauthOtp(''); setReauthVerificationId(null); }}><Text style={styles.modalCancelText}>CANCEL</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  profileHeader: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#1E293B', borderBottomWidth: 1, borderColor: '#334155' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00E5FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 15, elevation: 10 },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#0B0F19' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  email: { fontSize: 14, color: '#94A3B8', marginTop: 4, fontFamily: 'monospace' },
  phone: { fontSize: 14, color: '#00E5FF', marginTop: 8, fontWeight: '600' },
  linkBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12, gap: 4 },
  linkBadgeText: { color: '#10B981', fontSize: 12, fontWeight: 'bold' },
  menu: { padding: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderColor: '#1E293B', gap: 16 },
  menuText: { flex: 1, fontSize: 16, color: '#F8FAFC', fontWeight: '500' },
  notificationContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderColor: '#1E293B' },
  notificationLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  notificationText: { fontSize: 16, color: '#F8FAFC', fontWeight: '500' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24, backgroundColor: '#1E293B', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EF4444' },
  logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 16, flex: 1 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, padding: 12, gap: 8 },
  deleteButtonText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 24, padding: 24, width: '90%', borderWidth: 1, borderColor: '#334155' },
  helpModalContent: { maxHeight: '80%' },
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 20, textAlign: 'center', letterSpacing: 1 },
  modalInput: { backgroundColor: '#0B0F19', borderRadius: 12, padding: 16, color: '#F8FAFC', fontSize: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 16 },
  phoneInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B0F19', borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 16, paddingHorizontal: 16, height: 56 },
  prefix: { color: '#00E5FF', fontSize: 16, fontWeight: 'bold', marginRight: 8 },
  phoneInput: { flex: 1, color: '#F8FAFC', fontSize: 16, fontWeight: '500' },
  phoneDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F19', padding: 16, borderRadius: 12, marginBottom: 16, gap: 8 },
  phoneDisplayText: { color: '#00E5FF', fontSize: 16, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  modalCancelButton: { flex: 1, backgroundColor: '#1E293B', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  modalCancelText: { color: '#94A3B8', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  modalConfirmButton: { flex: 1, backgroundColor: '#00E5FF', padding: 16, borderRadius: 12, alignItems: 'center' },
  modalConfirmText: { color: '#000', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  deleteConfirmButton: { flex: 1, backgroundColor: '#EF4444', padding: 16, borderRadius: 12, alignItems: 'center' },
  deleteConfirmText: { color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  linkText: { color: '#00E5FF', textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
  helpSection: { marginBottom: 20 },
  helpSectionTitle: { fontSize: 18, fontWeight: '700', color: '#00E5FF', marginBottom: 8 },
  helpSectionContent: { fontSize: 14, color: '#94A3B8', lineHeight: 20 },
  warningIcon: { marginBottom: 16, alignSelf: 'center' },
  deleteWarning: { color: '#EF4444', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  deleteInstruction: { color: '#94A3B8', fontSize: 14, marginBottom: 8 },
  reauthText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 16 },
});