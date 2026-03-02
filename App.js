import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons'; 
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Import GestureHandlerRootView
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Import Context
import { FinanceContext } from './src/context/FinanceContext';

// Import Screens
import UnlockScreen from './src/screens/UnlockScreen';
import PhoneAuthScreen from './src/screens/PhoneAuthScreen';
import LoginScreen from './src/screens/LoginScreen'; 
import DashboardScreen from './src/screens/DashboardScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import StatsScreen from './src/screens/StatsScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- The Bottom Navigation Bar ---
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Stats') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          else if (route.name === 'Budget') iconName = focused ? 'wallet' : 'wallet-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#00E5FF', // Neon Blue for active tab
        tabBarInactiveTintColor: '#475569',
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0B0F19', borderTopWidth: 1, borderTopColor: '#1E293B', elevation: 10, height: 60, paddingBottom: 10 },
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Budget" component={BudgetScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// --- Root App ---
export default function App() {
  const [userName, setUserName] = useState('');
  const [balance, setBalance] = useState(0);
  
  const [transactions, setTransactions] = useState([
    { id: '1', amount: 1500, reason: 'GATE DA Test Series', category: 'Education', type: 'debit', date: new Date().toLocaleDateString() },
    { id: '2', amount: 800, reason: 'Gym Supplement', category: 'Health', type: 'debit', date: new Date().toLocaleDateString() },
    { id: '3', amount: 450, reason: 'GullyBazar Server Hosting', category: 'Projects', type: 'debit', date: new Date().toLocaleDateString() },
  ]);

  const addTransaction = (amount, reason, category = 'General', type = 'debit') => {
    const newTx = { id: Date.now().toString(), amount: parseFloat(amount), reason, category, type, date: new Date().toLocaleDateString() };
    setTransactions([newTx, ...transactions]);
    setBalance((prev) => (type === 'debit' ? prev - parseFloat(amount) : prev + parseFloat(amount)));
  };

  return (
    // Add GestureHandlerRootView as the absolute root with flex:1
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <FinanceContext.Provider value={{ userName, setUserName, balance, setBalance, transactions, addTransaction }}>
          <NavigationContainer>
            <Stack.Navigator initialRouteName="Unlock" screenOptions={{ headerShadowVisible: false }}>
              
              {/* Security & Auth Flow */}
              <Stack.Screen name="Unlock" component={UnlockScreen} options={{ headerShown: false }} />
              <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              
              {/* Main App Interface */}
              <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} /> 
              
              {/* Scanner Screen - Animation Disabled for Instant Open */}
              <Stack.Screen 
                name="Scanner" 
                component={ScannerScreen} 
                options={{ 
                  title: 'Scan & Pay', 
                  headerStyle: { backgroundColor: '#0B0F19'}, 
                  headerTintColor: '#FFF',
                  animation: 'none' // <--- THIS KILLS THE TRANSITION DELAY
                }} 
              />
            </Stack.Navigator>
          </NavigationContainer>
        </FinanceContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}