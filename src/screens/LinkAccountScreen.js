import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';

// Import Firebase
import { auth, db } from '../config/firebase';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';

const { width } = Dimensions.get('window');

export default function LinkAccountScreen({ navigation }) {
  const [role, setRole] = useState(null); // 'parent', 'child', or 'linked_child'
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isWaitingForChild, setIsWaitingForChild] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUserData, setCurrentUserData] = useState(null);

  // Listen to current user document for live handshake updates
  useEffect(() => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentUserData(data);

        // 1. AUTO-REDIRECT PARENT: If already linked, go straight to report!
        if (data.linkedChild) {
          if (isWaitingForChild) {
            setIsWaitingForChild(false);
            Alert.alert("Success!", "The child has accepted your link request.");
          }
          navigation.replace('ChildReport', { childId: data.linkedChild });
          return;
        }

        // 2. AUTO-REDIRECT CHILD: If already linked, show the lock screen!
        if (data.linkedParent) {
          setRole('linked_child');
          return;
        }

        // 3. CHILD LOGIC: If child receives a link request
        if (data.pendingParentRequest && role === 'child') {
          Alert.alert(
            "Account Link Request",
            `${data.pendingParentName} wants to link to your account as a Parent. Do you accept?`,
            [
              { 
                text: "Deny", 
                style: "cancel",
                onPress: () => updateDoc(userRef, { pendingParentRequest: null, pendingParentName: null }) 
              },
              { 
                text: "Accept", 
                onPress: async () => {
                  const parentRef = doc(db, 'users', data.pendingParentRequest);
                  
                  // Update Child Doc
                  await updateDoc(userRef, { 
                    linkedParent: data.pendingParentRequest, 
                    pendingParentRequest: null, 
                    pendingParentName: null 
                  });
                  
                  // Update Parent Doc (Completes the handshake)
                  await updateDoc(parentRef, {
                    linkedChild: auth.currentUser.uid
                  });
                  
                  Alert.alert("Success", "Account linked successfully!");
                } 
              }
            ]
          );
        }
      }
    });

    return () => unsubscribe();
  }, [role, isWaitingForChild, navigation]);

  const handleBarCodeScanned = async ({ data }) => {
    setScanned(true);
    setLoading(true);
    try {
      if (data === auth.currentUser.uid) {
        Alert.alert("Error", "You cannot scan your own QR code.");
        setScanned(false);
        setLoading(false);
        return;
      }

      const childRef = doc(db, 'users', data);
      const childSnap = await getDoc(childRef);
      
      if (!childSnap.exists()) {
        Alert.alert("Error", "Invalid QR Code. Child account not found.");
        setScanned(false);
        setLoading(false);
        return;
      }

      // Send request to child (DO NOT SET linkedChild on parent yet)
      await updateDoc(childRef, {
        pendingParentRequest: auth.currentUser.uid,
        pendingParentName: currentUserData?.name || 'A Parent'
      });

      setIsWaitingForChild(true);
    } catch (error) {
      Alert.alert("Scan Error", "Failed to process QR code.");
      setScanned(false);
    }
    setLoading(false);
  };

  const handleUnlink = () => {
    Alert.alert("Revoke Access", "Are you sure you want to unlink from your parent?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Unlink", 
        style: "destructive", 
        onPress: async () => {
          const parentRef = doc(db, 'users', currentUserData.linkedParent);
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { linkedParent: null });
          await updateDoc(parentRef, { linkedChild: null });
          setRole(null);
        }
      }
    ]);
  };

  // UI FOR ALREADY LINKED CHILD
  if (role === 'linked_child') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Connection Status</Text>
          <View style={{width: 28}} />
        </View>

        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="shield-check" size={80} color="#10B981" />
          <Text style={[styles.subtitle, { marginTop: 20 }]}>Securely Linked</Text>
          <Text style={styles.roleDesc}>Your account is currently linked. Your parent can view your transactions to help you manage your finances.</Text>
          
          {/* <TouchableOpacity style={styles.unlinkBtn} onPress={handleUnlink}>
            <Text style={styles.unlinkBtnText}>Revoke Parent Access</Text>
          </TouchableOpacity> */}
        </View>
      </SafeAreaView>
    );
  }

  // UI FOR CHOOSING ROLE
  if (!role) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Account Linking</Text>
          <View style={{width: 28}} />
        </View>

        <View style={styles.centerContainer}>
          <Text style={styles.subtitle}>Who is using this device?</Text>
          
          <TouchableOpacity style={styles.roleCard} onPress={() => {
            if (!permission?.granted) requestPermission();
            setRole('parent');
          }}>
            <MaterialCommunityIcons name="shield-account" size={48} color="#00E5FF" />
            <Text style={styles.roleTitle}>I am the Parent</Text>
            <Text style={styles.roleDesc}>Scan your child's QR code to monitor their expenses.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.roleCard, {borderColor: '#10B981'}]} onPress={() => setRole('child')}>
            <MaterialCommunityIcons name="account-child" size={48} color="#10B981" />
            <Text style={[styles.roleTitle, {color: '#10B981'}]}>I am the Child</Text>
            <Text style={styles.roleDesc}>Show a QR code for your parent to scan.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // UI FOR SCANNER / QR GENERATOR
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { setRole(null); setScanned(false); setIsWaitingForChild(false); }}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>{role === 'parent' ? 'Scan Child' : 'Your QR Code'}</Text>
        <View style={{width: 28}} />
      </View>

      {role === 'child' && (
        <View style={styles.qrContainer}>
          <Text style={styles.qrInstruction}>Ask your Parent to scan this code.</Text>
          <View style={styles.qrBox}>
            {auth.currentUser && (
              <QRCode value={auth.currentUser.uid} size={220} color="#000" backgroundColor="#FFF" />
            )}
          </View>
          <Text style={styles.waitingText}>Waiting for scan...</Text>
          <ActivityIndicator size="large" color="#10B981" style={{marginTop: 20}} />
        </View>
      )}

      {role === 'parent' && (
        <View style={styles.cameraContainer}>
          {isWaitingForChild ? (
            <View style={styles.waitingContainer}>
              <MaterialCommunityIcons name="cellphone-message" size={64} color="#00E5FF" />
              <Text style={styles.waitingTitle}>Request Sent!</Text>
              <Text style={styles.waitingDesc}>Please ask the child to tap "Accept" on their phone to complete the link.</Text>
              <ActivityIndicator size="large" color="#00E5FF" style={{marginTop: 30}} />
            </View>
          ) : (
            <>
              {permission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                />
              ) : (
                <Text style={{color: 'red'}}>No camera access</Text>
              )}
              <View style={styles.overlay}>
                <View style={styles.scannerOutline} />
                <Text style={styles.scanText}>ALIGN CHILD'S QR CODE HERE</Text>
              </View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  centerContainer: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  subtitle: { fontSize: 24, fontWeight: '900', color: '#FFF', marginBottom: 30, textAlign: 'center' },
  
  roleCard: { width: '100%', backgroundColor: '#1E293B', padding: 24, borderRadius: 20, borderWidth: 1, borderColor: '#00E5FF', alignItems: 'center', marginBottom: 20 },
  roleTitle: { fontSize: 20, fontWeight: 'bold', color: '#00E5FF', marginTop: 12, marginBottom: 8 },
  roleDesc: { color: '#94A3B8', textAlign: 'center', fontSize: 14, paddingHorizontal: 10 },

  qrContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  qrInstruction: { color: '#FFF', fontSize: 18, marginBottom: 40, fontWeight: 'bold' },
  qrBox: { backgroundColor: '#FFF', padding: 20, borderRadius: 20 },
  waitingText: { color: '#10B981', fontSize: 16, marginTop: 40, fontWeight: 'bold' },

  cameraContainer: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(11, 15, 25, 0.6)', justifyContent: 'center', alignItems: 'center' },
  scannerOutline: { width: 250, height: 250, borderWidth: 2, borderColor: '#00E5FF', borderRadius: 20 },
  scanText: { color: '#00E5FF', marginTop: 30, fontWeight: 'bold', letterSpacing: 1 },

  waitingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  waitingTitle: { fontSize: 24, color: '#00E5FF', fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  waitingDesc: { color: '#94A3B8', textAlign: 'center', fontSize: 16, lineHeight: 24 },

  unlinkBtn: { marginTop: 40, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: '#EF4444' },
  unlinkBtnText: { color: '#EF4444', fontWeight: 'bold', fontSize: 16 }
});